import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { trpc } from "@/lib/trpc";
import { useCompanion } from "@/companion";
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
  question: string;
  targetLayer: string;
  targetNodeType: string;
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
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Queries ───
  const graphQuery = trpc.mindMap.graph.useQuery(undefined, {
    staleTime: 30_000,
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
    const update = () =>
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ─── Filter graph data by active layer ───
  const filteredData = (() => {
    if (!graphQuery.data) return { nodes: [], links: [] };
    const nodes = activeLayer
      ? graphQuery.data.nodes.filter((n) => n.hallidayLayer === activeLayer)
      : graphQuery.data.nodes;
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links = graphQuery.data.edges.filter((e) => {
      const src = edgeNodeId(e.source);
      const tgt = edgeNodeId(e.target);
      return nodeIds.has(src) && nodeIds.has(tgt);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { nodes, links } as any;
  })();

  // ─── d3-force config for Obsidian-style clustering ───
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-150);
    fg.d3Force("link")?.strength(0.8).distance(50);
    fg.d3ReheatSimulation();
  }, [activeLayer, graphQuery.data]);

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
  const drawNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const color = LAYER_COLORS[node.hallidayLayer] ?? "#64748b";
      const radius = 3 + node.depth * 14 + Math.max(node.edgeCount * 0.8, 0);
      const isHovered = hoveredNode?.id === node.id;
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      // Ambient glow
      const glowAlpha = isHovered ? 0.3 : 0.12;
      ctx.beginPath();
      ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
      ctx.fillStyle =
        color +
        Math.round(glowAlpha * 255)
          .toString(16)
          .padStart(2, "0");
      ctx.fill();

      // Main circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? color : color + "b3";
      ctx.fill();

      // Label — always visible, brighter on hover
      const fontSize = Math.max(10 / globalScale, 2.5);
      ctx.font = `400 ${fontSize}px Sora, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = isHovered ? "#f8fafc" : "#e2e8f066";
      const label =
        node.label.length > 20 ? node.label.slice(0, 18) + "…" : node.label;
      ctx.fillText(label, x, y + radius + 2);
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
      const alpha = isHighlighted ? 0.6 : 0.08 + edge.strength * 0.12;
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

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoveredNode(node);
  }, []);

  const handleAnswer = useCallback(
    async (prompt: Prompt) => {
      const text = answerTexts[prompt.id]?.trim();
      if (!text) return;
      await answerMutation.mutateAsync({
        question: prompt.question,
        answer: text,
        targetLayer: prompt.targetLayer as any,
        targetNodeType: prompt.targetNodeType as any,
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
    <div className="min-h-screen bg-[#080b14] text-white flex flex-col overflow-hidden font-sora">
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
      <div className="flex-1 relative" ref={containerRef}>
        {filteredData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={graphRef}
            graphData={filteredData}
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={(node: GraphNode, color, ctx) => {
              const r = 3 + node.depth * 14 + Math.max(node.edgeCount * 0.8, 0);
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, r + 4, 0, Math.PI * 2);
              ctx.fill();
            }}
            linkCanvasObject={drawLink}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            backgroundColor="#080b14"
            width={containerSize.width}
            height={containerSize.height}
            d3AlphaDecay={0.015}
            d3VelocityDecay={0.25}
            cooldownTicks={300}
            warmupTicks={50}
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

        {/* ─── Prompt pills (collapsed) / expanded answer ─── */}
        {visiblePrompts.length > 0 && (
          <div className="absolute top-4 left-4 flex flex-col gap-2 z-10" style={{ maxWidth: expandedPrompt ? "340px" : "260px" }}>
            {visiblePrompts.slice(0, 2).map((prompt) => {
              const isExpanded = expandedPrompt === prompt.id;
              const color = LAYER_COLORS[prompt.targetLayer] ?? "#64748b";

              if (!isExpanded) {
                return (
                  <button
                    key={prompt.id}
                    onClick={() => setExpandedPrompt(prompt.id)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-all animate-float-in hover:bg-white/[0.04]"
                    style={{ background: "rgba(8,11,20,0.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[12px] text-slate-400 truncate">
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
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <p className="text-[13px] text-[#e2e8f0] leading-snug">
                      {prompt.question}
                    </p>
                    <button
                      onClick={() => setExpandedPrompt(null)}
                      className="text-slate-600 hover:text-slate-400 flex-shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-[0.08em] mb-2.5 block"
                    style={{ color }}
                  >
                    {LAYER_LABELS[prompt.targetLayer]}
                  </span>
                  <div className="flex gap-2">
                    <textarea
                      value={answerTexts[prompt.id] ?? ""}
                      onChange={(e) =>
                        setAnswerTexts((prev) => ({
                          ...prev,
                          [prompt.id]: e.target.value,
                        }))
                      }
                      placeholder="Answer..."
                      rows={2}
                      className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-md px-2.5 py-2 text-[12px] text-white placeholder:text-slate-600 resize-none focus:outline-none focus:border-white/[0.12]"
                    />
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

        {/* ─── Node detail panel ─── */}
        <div
          className={`absolute top-0 right-0 h-full w-[360px] z-20 transition-transform duration-300 ease-out ${
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
                <h2 className="text-[20px] font-medium text-white pr-4 leading-tight">
                  {selectedNode.label}
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
                {selectedNode.content.length > 500
                  ? selectedNode.content.slice(0, 500) + "…"
                  : selectedNode.content}
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
                          {n.label}
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
