import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { trpc } from "@/lib/trpc";
import { useCompanion } from "@/companion";
import { VoiceInput } from "@/components/VoiceInput";
import {
  ArrowLeft,
  Loader2,
  X,
  ChevronRight,
  Send,
  Sparkles,
} from "lucide-react";

// ─── Constants ───

const LAYER_COLORS: Record<string, string> = {
  voice_and_language: "#8b5cf6",
  memory_and_life_events: "#3b82f6",
  reasoning_and_decisions: "#10b981",
  values_and_beliefs: "#f59e0b",
  emotional_patterns: "#ef4444",
};

const LAYER_LABELS: Record<string, string> = {
  voice_and_language: "VOICE",
  memory_and_life_events: "MEMORY",
  reasoning_and_decisions: "REASONING",
  values_and_beliefs: "VALUES",
  emotional_patterns: "EMOTIONAL",
};

const LAYER_TO_CATEGORY: Record<string, string> = {
  voice_and_language: "voice_language",
  memory_and_life_events: "memory_life_events",
  reasoning_and_decisions: "reasoning_decisions",
  values_and_beliefs: "values_beliefs",
  emotional_patterns: "emotional_patterns",
};

const THRESHOLDS = [
  { pct: 0.2, label: "SEED" },
  { pct: 0.4, label: "EMERGING" },
  { pct: 0.6, label: "DEVELOPING" },
  { pct: 0.8, label: "ESTABLISHED" },
  { pct: 1.0, label: "COMPLETE" },
];

// Node types that represent memory anchors (roots of families). These dominate
// their children visually even when edge counts are close.
const ANCHOR_NODE_TYPES = new Set(["memory", "event"]);

// Render-time label normalizer. Handles messy DB casing ("OPTIMISTIC mindset",
// "booking A flight", "Weird-Caps") → "Optimistic mindset", "Booking a flight".
// Also capitalizes standalone pronoun "i" → "I" (and contractions "i'm" → "I'm"
// since JS regex treats apostrophe as a word boundary).
function toSentenceCase(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const withPronoun = lower.replace(/\bi\b/g, "I");
  return withPronoun.charAt(0).toUpperCase() + withPronoun.slice(1);
}

// Labels from Venice are ALL CAPS concept labels ("BROKE MY LEG", "FIRST JOB").
// Legacy nodes may have mixed casing. Preserve ALL CAPS; sentence-case the rest.
function renderNodeLabel(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const letters = trimmed.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 0 && letters === letters.toUpperCase()) {
    return trimmed;
  }
  return toSentenceCase(trimmed);
}

// Light-touch fix for prose display (side-panel content): only capitalize
// standalone "i" → "I" (and contractions like "i'm"). Preserves all other
// casing so proper nouns, sentence starts, etc. are untouched.
function fixPronounCasing(raw: string): string {
  if (!raw) return "";
  return raw.replace(/\bi\b/g, "I");
}

// Power-curve node sizing. Anchors visually dominate leaves; floor keeps tiny
// nodes clickable; ceiling keeps hubs from eating the canvas.
function computeNodeRadius(edgeCount: number, nodeType: string): number {
  const base = 4 + Math.sqrt(Math.max(edgeCount, 0)) * 4;
  const anchorBoost = ANCHOR_NODE_TYPES.has(nodeType) ? 1.15 : 1;
  return Math.max(4, Math.min(22, base * anchorBoost));
}

// Z-order + label collision priority. Anchors always outrank leaves; within a
// tier, more edges = higher priority.
function computeNodePriority(nodeType: string, edgeCount: number): number {
  return (ANCHOR_NODE_TYPES.has(nodeType) ? 1000 : 0) + edgeCount;
}

function getThresholdLabel(pct: number) {
  for (const t of THRESHOLDS) {
    if (pct <= t.pct) return t.label;
  }
  return "COMPLETE";
}

// ─── Types ───

type GraphNode = {
  id: string;
  label: string;
  nodeType: string;
  hallidayLayer: string;
  summary: string;
  content: string;
  depth: number;
  edgeCount: number;
  createdAt: Date | string;
  x?: number;
  y?: number;
};

type GraphEdge = {
  source: string | GraphNode;
  target: string | GraphNode;
  relationshipType: string;
  strength: number;
};

function edgeNodeId(endpoint: string | GraphNode): string {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

type Prompt = {
  id: string;
  nodeId: string | null;
  nodeLabel: string;
  layer: string;
  question: string;
};

// ─── Component ───

export default function MindMap() {
  const [, setLocation] = useLocation();
  const { notifyMutation } = useCompanion();
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphEdge>>(undefined);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [dismissedPrompts, setDismissedPrompts] = useState<Set<string>>(
    () => new Set()
  );
  const [answerTexts, setAnswerTexts] = useState<Record<string, string>>({});
  const [containerSize, setContainerSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 800,
    height: typeof window !== "undefined" ? window.innerHeight - 80 : 600, // minus header+footer estimate
  }));
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Queries ───
  // ─── INVALIDATION CONTRACT ───
  // Graph is cached indefinitely to prevent simulation jitter (nodes resettling
  // on every refetch would make the graph feel unstable). Do NOT relax these
  // flags — they are load-bearing for UX stability.
  //
  // Any mutation elsewhere in the app that creates memory_nodes MUST call
  // utils.mindMap.graph.invalidate() (and utils.mindMap.prompts.invalidate())
  // in its onSuccess, otherwise new nodes won't appear until a hard reload.
  //
  // Current invalidation sites (keep this list in sync):
  //   - QuickMemory.tsx       → trpc.memory.create
  //   - DailyReflection.tsx   → trpc.memory.create / reasoning.create / values.create
  //   - HallidayInterview.tsx → trpc.halliday.submitResponse
  //   - InterviewMode.tsx     → trpc.interviewMode.answer
  //   - MindMap.tsx           → trpc.mindMap.answer (same-page refetch, below)
  const graphQuery = trpc.mindMap.graph.useQuery(undefined, {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
  const promptsQuery = trpc.mindMap.prompts.useQuery(undefined, {
    staleTime: 120_000,
  });
  const answerMutation = trpc.mindMap.answer.useMutation({
    onSuccess: () => {
      graphQuery.refetch();
      promptsQuery.refetch();
      setExpandedPrompt(null);
    },
  });

  // ─── Resize tracking ───
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      // Only update if the element has non-zero dimensions (layout complete)
      if (w > 0 && h > 0) {
        setContainerSize({ width: w, height: h });
      }
    };
    // Defer initial read so flex layout has settled
    requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ─── Filter graph data by active layer ───
  //
  // Nodes are sorted by priority ASCENDING (leaves first, anchors last) so the
  // canvas paints anchors on TOP of leaves in z-order. Label collision then
  // uses a cross-frame bbox cache (see labelBboxRef below) so lower-priority
  // leaf labels get suppressed when they'd overlap an anchor label, regardless
  // of paint order.
  const filteredData = (() => {
    if (!graphQuery.data) return { nodes: [], links: [] };
    const nodesRaw = activeLayer
      ? graphQuery.data.nodes.filter((n) => n.hallidayLayer === activeLayer)
      : graphQuery.data.nodes;
    const nodes = [...nodesRaw].sort(
      (a, b) =>
        computeNodePriority(a.nodeType, a.edgeCount) -
        computeNodePriority(b.nodeType, b.edgeCount)
    );
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links = graphQuery.data.edges.filter((e) => {
      const src = edgeNodeId(e.source);
      const tgt = edgeNodeId(e.target);
      return nodeIds.has(src) && nodeIds.has(tgt);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { nodes, links } as any;
  })();

  // ─── Label collision tracking ───
  //
  // We use a two-frame swap: drawNode writes into `currFrame`, and each new
  // render frame promotes `currFrame` → `prevFrame` via onRenderFramePre. Lower-
  // priority nodes check `prevFrame` for overlap with higher-priority labels
  // and skip their label if one is nearby. Stale by 1 frame but positions move
  // slowly enough that this is imperceptible.
  const labelBboxRef = useRef<{
    prev: Array<{ x: number; y: number; w: number; h: number; priority: number }>;
    curr: Array<{ x: number; y: number; w: number; h: number; priority: number }>;
  }>({ prev: [], curr: [] });

  const handleRenderFramePre = useCallback(() => {
    const ref = labelBboxRef.current;
    ref.prev = ref.curr;
    ref.curr = [];
  }, []);

  // ─── d3-force config (Obsidian parity) ───
  //
  // Obsidian's graph view lets the simulation stop at rest. Heavy warmup so
  // the layout appears already settled on first render. Moderate repulsion
  // and short links keep the graph cohesive. The library's default center +
  // x/y forces handle the cohesion — no custom tweaks needed.
  //
  // Drag behavior is entirely native: the library reheats to alphaTarget=0.3
  // on drag start, drops to 0 on release, and alpha decays naturally until
  // the sim stops again. Same flow Obsidian uses.
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    // Unpin everything so layout recalculates from scratch on data change
    filteredData.nodes?.forEach((n: any) => {
      n.fx = undefined;
      n.fy = undefined;
    });
    // Keep library defaults for center/x/y — those give Obsidian-like cohesion.
    fg.d3Force("charge")?.strength(-180);
    fg.d3Force("link")?.distance(40);
    fg.d3ReheatSimulation();
  }, [graphQuery.data, activeLayer]); // eslint-disable-line react-hooks/exhaustive-deps

  // First-settle zoom-to-fit. Fires once when the engine naturally stops
  // after initial layout. Subsequent drag-triggered stops don't re-fit (user
  // has zoomed/panned intentionally by then).
  const hasFitRef = useRef(false);
  useEffect(() => {
    hasFitRef.current = false;
  }, [graphQuery.data, activeLayer]);
  const handleEngineStop = useCallback(() => {
    if (hasFitRef.current) return;
    const fg = graphRef.current;
    if (!fg) return;
    hasFitRef.current = true;
    fg.zoomToFit(400, 80);
  }, []);

  // Drag is handled entirely natively by the library: alphaTarget=0.3 on drag
  // start, node follows cursor via fx/fy, on release alphaTarget drops to 0
  // and the node auto-unpins (since it wasn't pinned pre-drag), then alpha
  // decays to zero and the engine stops. Same flow as Obsidian.

  // ─── Hovered node edge set ───
  const hoveredEdgeSet = (() => {
    if (!hoveredNode || !graphQuery.data) return new Set<string>();
    const set = new Set<string>();
    for (const e of graphQuery.data.edges) {
      const src = edgeNodeId(e.source);
      const tgt = edgeNodeId(e.target);
      if (src === hoveredNode.id || tgt === hoveredNode.id) {
        set.add(`${src}__${tgt}`);
      }
    }
    return set;
  })();

  // ─── Node renderer ───
  //
  // Obsidian-style: nodes in canvas-space (scale with zoom), labels in
  // screen-space (constant pixel size — always readable). The sqrt-curve
  // hierarchy ensures anchors remain visually dominant over leaves at all
  // zoom levels.
  const drawNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const color = LAYER_COLORS[node.hallidayLayer] ?? "#64748b";
      const isAnchor = ANCHOR_NODE_TYPES.has(node.nodeType);
      const radius = computeNodeRadius(node.edgeCount, node.nodeType);
      const priority = computeNodePriority(node.nodeType, node.edgeCount);
      const isHovered = hoveredNode?.id === node.id;
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      // Ambient glow halo (1.8x radius, subtle)
      const glowAlpha = isHovered ? 0.18 : isAnchor ? 0.08 : 0.05;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.8, 0, Math.PI * 2);
      ctx.fillStyle =
        color +
        Math.round(glowAlpha * 255)
          .toString(16)
          .padStart(2, "0");
      ctx.fill();

      // Main circle — anchors fully saturated, leaves slightly muted
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? color : color + (isAnchor ? "d9" : "a6");
      ctx.fill();

      // Label. Full text — no truncation. Anchors get slightly larger font and
      // higher opacity so they pop above leaves without over-dominating.
      const baseFontSize = isAnchor ? 11 : 9.5;
      const fontSize = Math.max(baseFontSize / globalScale, 2.5);
      const fontWeight = isAnchor ? 500 : 400;
      ctx.font = `${fontWeight} ${fontSize}px Sora, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      // Prefer the Venice ALL CAPS label as-is; sentence-case legacy mixed
      // data as a fallback.
      const label = renderNodeLabel(node.label);
      const labelWidth = ctx.measureText(label).width;
      const labelHeight = fontSize * 1.15;
      const labelX = x - labelWidth / 2;
      const labelY = y + radius + 3;
      const myBbox = { x: labelX, y: labelY, w: labelWidth, h: labelHeight, priority };

      // Collision: suppress this label if a STRICTLY higher-priority label
      // from last frame would overlap. Hovered nodes always draw.
      const bboxRef = labelBboxRef.current;
      const overlaps =
        !isHovered &&
        bboxRef.prev.some(
          (b) =>
            b.priority > priority &&
            labelX < b.x + b.w &&
            labelX + labelWidth > b.x &&
            labelY < b.y + b.h &&
            labelY + labelHeight > b.y
        );

      // Always record bbox so next frame's leaves can check against us.
      bboxRef.curr.push(myBbox);

      if (overlaps) return;

      if (isHovered) {
        // Subtle dark backdrop chip so the hovered label is always readable
        // above any neighbor pixels.
        const pad = 3;
        ctx.fillStyle = "rgba(8, 11, 20, 0.85)";
        ctx.fillRect(
          labelX - pad,
          labelY - pad,
          labelWidth + pad * 2,
          labelHeight + pad * 2
        );
        ctx.fillStyle = "#f8fafc";
      } else {
        // 90% for anchors, 75% for leaves (readability over subtlety —
        // legacy product, text must be legible at rest).
        ctx.fillStyle = isAnchor ? "#e2e8f0e6" : "#e2e8f0bf";
      }
      ctx.fillText(label, x, labelY);
    },
    [hoveredNode]
  );

  // ─── Link renderer ───
  const drawLink = useCallback(
    (edge: GraphEdge, ctx: CanvasRenderingContext2D) => {
      const src = typeof edge.source === "string" ? null : edge.source;
      const tgt = typeof edge.target === "string" ? null : edge.target;
      if (!src || !tgt) return;

      const srcId = edgeNodeId(edge.source);
      const tgtId = edgeNodeId(edge.target);
      const key = `${srcId}__${tgtId}`;
      const isHighlighted = hoveredEdgeSet.has(key);

      const srcColor = LAYER_COLORS[src.hallidayLayer] ?? "#64748b";
      const alpha = isHighlighted ? 0.6 : 0.20 + edge.strength * 0.15;
      const width = isHighlighted ? 1.5 : 0.4 + edge.strength * 0.8;

      ctx.beginPath();
      ctx.moveTo(src.x ?? 0, src.y ?? 0);
      ctx.lineTo(tgt.x ?? 0, tgt.y ?? 0);
      ctx.strokeStyle =
        srcColor +
        Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0");
      ctx.lineWidth = width;
      ctx.stroke();
    },
    [hoveredEdgeSet]
  );

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
  }, []);

  // At rest the simulation is fully stopped (no alphaTarget perpetual drift),
  // so nodes don't squirm away from the cursor. No hover-pin workaround
  // needed — match Obsidian's "hover just highlights, doesn't move things".
  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoveredNode(node);
  }, []);

  const handleAnswer = useCallback(
    async (prompt: Prompt) => {
      const text = answerTexts[prompt.id]?.trim();
      if (!text) return;
      // Map layer to a sensible default node type
      const layerToType: Record<string, string> = {
        voice_and_language: "concept",
        memory_and_life_events: "memory",
        reasoning_and_decisions: "reasoning_pattern",
        values_and_beliefs: "value",
        emotional_patterns: "emotion",
      };
      await answerMutation.mutateAsync({
        question: prompt.question,
        answer: text,
        targetLayer: prompt.layer as any,
        targetNodeType: (layerToType[prompt.layer] ?? "memory") as any,
        // Carry source node forward so the server enriches it instead of
        // spawning an orphan. null prompts (generic bootstrap) fall through
        // to the free-creation path.
        sourceNodeId: prompt.nodeId ?? undefined,
      });
      setAnswerTexts((prev) => ({ ...prev, [prompt.id]: "" }));
      setDismissedPrompts((prev) => new Set(prev).add(prompt.id));
      notifyMutation("mindMap.answer");
    },
    [answerTexts, answerMutation, notifyMutation]
  );

  // ─── Connected nodes for detail panel ───
  const connectedNodes = (() => {
    if (!selectedNode || !graphQuery.data) return [];
    const neighborIds = new Set<string>();
    for (const e of graphQuery.data.edges) {
      const src = edgeNodeId(e.source);
      const tgt = edgeNodeId(e.target);
      if (src === selectedNode.id) neighborIds.add(tgt);
      if (tgt === selectedNode.id) neighborIds.add(src);
    }
    return graphQuery.data.nodes.filter((n) => neighborIds.has(n.id));
  })();

  const visiblePrompts = (promptsQuery.data?.prompts ?? []).filter(
    (p) => !dismissedPrompts.has(p.id)
  );
  const overallProgress = graphQuery.data?.overallProgress ?? 0;
  const thresholdLabel = getThresholdLabel(overallProgress);
  const accentColor = selectedNode
    ? LAYER_COLORS[selectedNode.hallidayLayer]
    : "#3b82f6";

  if (graphQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#080b14] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#080b14] text-white flex flex-col overflow-hidden font-sora">
      {/* ─── Header ─── */}
      <header className="flex items-center justify-between px-5 py-2.5 z-20 relative border-b border-white/[0.04]" style={{ background: "rgba(8,11,20,0.9)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-6">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 tracking-wide uppercase transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Home
          </button>
          <div className="w-px h-4 bg-white/[0.06]" />
          <span className="text-[13px] font-medium text-white tracking-tight">
            Mind Map
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500 uppercase tracking-[0.08em]">
            Identity Mapped
          </span>
          <div className="w-24 h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.round(overallProgress * 100)}%`, background: "#3b82f6" }}
            />
          </div>
          <span className="text-[11px] font-medium text-slate-300 tabular-nums">
            {Math.round(overallProgress * 100)}%
          </span>
          <span className="text-[9px] text-slate-600 uppercase tracking-[0.1em]">
            {thresholdLabel}
          </span>
        </div>
      </header>

      {/* ─── Main area ─── */}
      <div className="flex-1 relative w-full overflow-hidden" ref={containerRef}>
        {filteredData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={graphRef}
            graphData={filteredData}
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={(node: GraphNode, color, ctx) => {
              // Canvas-space hit-test, matches the visible circle. +4px for
              // easier clicking.
              const r = computeNodeRadius(node.edgeCount, node.nodeType) + 4;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, Math.PI * 2);
              ctx.fill();
            }}
            linkCanvasObject={drawLink}
            onRenderFramePre={handleRenderFramePre}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onEngineStop={handleEngineStop}
            backgroundColor="#080b14"
            width={containerSize.width}
            height={containerSize.height}
            // Obsidian parity: simulation stops at rest. Heavy warmup pre-
            // settles the layout invisibly so the graph appears already laid
            // out on first render. Default alphaDecay/VelocityDecay/alphaMin
            // — same defaults d3-force (and Obsidian) use.
            warmupTicks={120}
            cooldownTicks={300}
            nodeId="id"
            linkSource="source"
            linkTarget="target"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <Sparkles className="h-10 w-10 text-slate-600" />
            <p className="text-slate-400 text-[15px] font-medium">
              Your mind map is empty
            </p>
            <p className="text-slate-600 text-[12px] max-w-xs leading-relaxed">
              Start capturing memories, values, and decisions to see your
              identity graph come alive.
            </p>
            <button
              onClick={() => setLocation("/halliday")}
              className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-[12px] font-semibold text-white rounded-md transition-colors"
            >
              Start Halliday Interview
            </button>
          </div>
        )}

        {/* ─── Prompt pills — node-specific ─── */}
        {visiblePrompts.length > 0 && (
          <div className="absolute top-4 left-4 flex flex-col gap-2 z-10" style={{ maxWidth: expandedPrompt ? "340px" : "280px" }}>
            {visiblePrompts.slice(0, 3).map((prompt) => {
              const isExpanded = expandedPrompt === prompt.id;
              const color = LAYER_COLORS[prompt.layer] ?? "#64748b";

              if (!isExpanded) {
                return (
                  <button
                    key={prompt.id}
                    onClick={() => setExpandedPrompt(prompt.id)}
                    className="flex flex-col gap-0.5 px-3 py-2 rounded-md text-left transition-all animate-float-in hover:bg-white/[0.04]"
                    style={{ background: "rgba(8,11,20,0.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="text-[9px] uppercase tracking-[0.08em] font-medium" style={{ color }}>{LAYER_LABELS[prompt.layer]}</span>
                      <span className="text-[9px] text-slate-600">·</span>
                      <span className="text-[12px] text-white truncate">&ldquo;{renderNodeLabel(prompt.nodeLabel)}&rdquo;</span>
                    </span>
                    <span className="text-[11px] text-[#94a3b8] truncate">
                      {prompt.question}
                    </span>
                  </button>
                );
              }

              return (
                <div
                  key={prompt.id}
                  className="rounded-md p-3.5 animate-float-in"
                  style={{ background: "rgba(8,11,20,0.88)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[9px] uppercase tracking-[0.08em] font-medium" style={{ color }}>{LAYER_LABELS[prompt.layer]}</span>
                      <span className="text-[9px] text-slate-600">·</span>
                      <span className="text-[12px] text-white">&ldquo;{renderNodeLabel(prompt.nodeLabel)}&rdquo;</span>
                    </span>
                    <button
                      onClick={() => setExpandedPrompt(null)}
                      className="text-slate-600 hover:text-slate-400 flex-shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="text-[11px] text-[#94a3b8] leading-relaxed mb-3">
                    {prompt.question}
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <textarea
                        value={answerTexts[prompt.id] ?? ""}
                        onChange={(e) =>
                          setAnswerTexts((prev) => ({
                            ...prev,
                            [prompt.id]: e.target.value,
                          }))
                        }
                        placeholder="Type or speak..."
                        rows={2}
                        className="w-full bg-white/[0.03] border border-white/[0.06] rounded-md px-2.5 py-2 pr-9 text-[12px] text-white placeholder:text-slate-600 resize-none focus:outline-none focus:border-white/[0.12]"
                      />
                      <VoiceInput
                        className="absolute bottom-1.5 right-1.5"
                        disabled={answerMutation.isPending}
                        onTranscript={(text) =>
                          setAnswerTexts((prev) => ({
                            ...prev,
                            [prompt.id]: prev[prompt.id] ? prev[prompt.id] + " " + text : text,
                          }))
                        }
                      />
                    </div>
                    <button
                      disabled={
                        !answerTexts[prompt.id]?.trim() ||
                        answerMutation.isPending
                      }
                      onClick={() => handleAnswer(prompt)}
                      className="self-end p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-colors"
                    >
                      <Send className="h-3 w-3 text-white" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Node detail panel (fixed overlay, doesn't reduce graph width) ─── */}
        <div
          className={`fixed top-0 right-0 h-full w-[360px] z-30 transition-transform duration-300 ease-out ${
            selectedNode ? "translate-x-0" : "translate-x-full"
          }`}
          style={{
            background: "rgba(8,11,20,0.85)",
            backdropFilter: "blur(20px)",
            borderLeft: "1px solid rgba(255,255,255,0.08)",
            boxShadow: selectedNode
              ? `inset 1px 0 0 ${accentColor}15, -8px 0 32px ${accentColor}08`
              : "none",
          }}
        >
          {selectedNode && (
            <div className="p-5 h-full overflow-y-auto">
              <div className="flex items-start justify-between mb-3">
                <h2 className="text-[20px] font-medium text-white pr-4 leading-tight tracking-wide">
                  {renderNodeLabel(selectedNode.label)}
                </h2>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-600 hover:text-slate-400 flex-shrink-0 mt-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Layer + type labels */}
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="text-[10px] uppercase tracking-[0.08em] font-medium"
                  style={{ color: LAYER_COLORS[selectedNode.hallidayLayer] }}
                >
                  {LAYER_LABELS[selectedNode.hallidayLayer]}
                </span>
                <span className="text-[10px] text-slate-600 uppercase tracking-[0.08em]">
                  {selectedNode.nodeType.replace(/_/g, " ")}
                </span>
              </div>

              {/* Content */}
              <p className="text-[13px] text-slate-400 leading-relaxed mb-5">
                {fixPronounCasing(
                  selectedNode.content.length > 500
                    ? selectedNode.content.slice(0, 500) + "…"
                    : selectedNode.content
                )}
              </p>

              {/* Depth / connections — tabular metadata */}
              <div className="mb-5 py-3 border-t border-b border-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-slate-600 tracking-wide">DEPTH</span>
                  <span className="text-[11px] text-slate-400 tabular-nums">{Math.round(selectedNode.depth * 100)}%</span>
                </div>
                <div className="w-full h-[3px] bg-white/[0.04] rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(Math.round(selectedNode.depth * 100), 2)}%`,
                      backgroundColor: LAYER_COLORS[selectedNode.hallidayLayer],
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-600 tracking-wide">CONNECTIONS</span>
                  <span className="text-[11px] text-slate-400 tabular-nums">{selectedNode.edgeCount}</span>
                </div>
              </div>

              {/* Connected nodes */}
              {connectedNodes.length > 0 && (
                <div className="mb-5">
                  <span className="text-[10px] text-slate-600 uppercase tracking-[0.08em] block mb-2">
                    Connected
                  </span>
                  <div className="space-y-0.5">
                    {connectedNodes.slice(0, 8).map((n) => (
                      <button
                        key={n.id}
                        onClick={() => setSelectedNode(n)}
                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.03] transition-colors"
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: LAYER_COLORS[n.hallidayLayer] }}
                        />
                        <span className="text-[12px] text-slate-400 truncate">
                          {renderNodeLabel(n.label)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Deepen CTA */}
              <button
                onClick={() => {
                  const cat = LAYER_TO_CATEGORY[selectedNode.hallidayLayer];
                  setLocation(`/halliday?topic=${selectedNode.id}&layer=${cat}`);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-[12px] font-semibold text-white rounded-md transition-colors"
              >
                Deepen this memory
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Layer filter bar ─── */}
      <div
        className="flex items-center gap-1 px-5 py-2 z-20 relative overflow-x-auto border-t border-white/[0.04]"
        style={{ background: "rgba(8,11,20,0.9)", backdropFilter: "blur(12px)" }}
      >
        <button
          onClick={() => setActiveLayer(null)}
          className={`px-2.5 py-1 rounded text-[10px] uppercase tracking-[0.08em] font-medium transition-colors ${
            activeLayer === null
              ? "text-white bg-white/[0.06]"
              : "text-slate-600 hover:text-slate-400"
          }`}
        >
          All
        </button>
        {(graphQuery.data?.layerStats ?? []).map((ls) => {
          const color = LAYER_COLORS[ls.layer];
          const isActive = activeLayer === ls.layer;
          return (
            <button
              key={ls.layer}
              onClick={() =>
                setActiveLayer(isActive ? null : ls.layer)
              }
              className={`flex items-center gap-2 px-2.5 py-1 rounded text-[10px] uppercase tracking-[0.08em] transition-colors ${
                isActive
                  ? "bg-white/[0.06]"
                  : "hover:bg-white/[0.02]"
              }`}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span style={{ color: isActive ? color : "#475569" }} className="font-medium">
                {LAYER_LABELS[ls.layer]}
              </span>
              <span className="text-slate-700 tabular-nums">{ls.count}</span>
              <span className="tabular-nums" style={{ color: isActive ? color + "88" : "#334155" }}>
                {Math.round(ls.completion * 100)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
