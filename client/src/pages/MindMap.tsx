import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { trpc } from "@/lib/trpc";
import { useCompanion } from "@/companion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  voice_and_language: "Voice & Language",
  memory_and_life_events: "Memory & Life",
  reasoning_and_decisions: "Reasoning",
  values_and_beliefs: "Values & Beliefs",
  emotional_patterns: "Emotional",
};

/** Map halliday layer enum → Halliday interview category ID */
const LAYER_TO_CATEGORY: Record<string, string> = {
  voice_and_language: "voice_language",
  memory_and_life_events: "memory_life_events",
  reasoning_and_decisions: "reasoning_decisions",
  values_and_beliefs: "values_beliefs",
  emotional_patterns: "emotional_patterns",
};

const THRESHOLDS = [
  { pct: 0.2, label: "Seed" },
  { pct: 0.4, label: "Emerging" },
  { pct: 0.6, label: "Developing" },
  { pct: 0.8, label: "Established" },
  { pct: 1.0, label: "Complete" },
];

function getThresholdLabel(pct: number) {
  for (const t of THRESHOLDS) {
    if (pct <= t.pct) return t.label;
  }
  return "Complete";
}

const THRESHOLD_COLORS: Record<string, string> = {
  Seed: "bg-red-500",
  Emerging: "bg-orange-500",
  Developing: "bg-yellow-500",
  Established: "bg-blue-500",
  Complete: "bg-green-500",
};

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

/** Extract the string ID from a link endpoint (string before ForceGraph processes, object after) */
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

  // ─── State ───
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
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
    },
  });

  // ─── Resize tracking ───
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    };
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

  // ─── Node renderer ───
  const drawNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const color = LAYER_COLORS[node.hallidayLayer] ?? "#64748b";
      const radius = 4 + node.depth * 16;

      // Ambient glow
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = color + "26"; // 15% alpha
      ctx.fill();

      // Main circle
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = color + "cc"; // 80% alpha
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label at sufficient zoom
      if (globalScale > 1.5) {
        ctx.font = `${Math.max(10 / globalScale, 3)}px Sora, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(
          node.label.length > 24 ? node.label.slice(0, 22) + "…" : node.label,
          node.x ?? 0,
          (node.y ?? 0) + radius + 3
        );
      }
    },
    []
  );

  // ─── Link renderer ───
  const linkColor = useCallback((edge: GraphEdge) => {
    const alpha = Math.round(0.15 + edge.strength * 0.4 * 255)
      .toString(16)
      .padStart(2, "0");
    return `#94a3b8${alpha}`;
  }, []);

  const linkWidth = useCallback(
    (edge: GraphEdge) => 0.5 + edge.strength * 2,
    []
  );

  // ─── Node click ───
  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
  }, []);

  // ─── Answer submit ───
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

  // ─── Visible prompts ───
  const visiblePrompts = (promptsQuery.data?.prompts ?? []).filter(
    (p) => !dismissedPrompts.has(p.id)
  );

  // ─── Overall progress ───
  const overallProgress = graphQuery.data?.overallProgress ?? 0;
  const thresholdLabel = getThresholdLabel(overallProgress);

  // ─── Loading ───
  if (graphQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#080b14] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080b14] text-white flex flex-col overflow-hidden">
      {/* ─── Header ─── */}
      <header className="glass border-b border-white/5 px-6 py-3 flex items-center justify-between z-20 relative">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/")}
            className="text-slate-400 hover:text-white hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Home
          </Button>
          <h1 className="text-xl font-semibold font-sora">Mind Map</h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400 font-sora">
            Identity Mapped
          </span>
          <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.round(overallProgress * 100)}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-white font-sora">
            {Math.round(overallProgress * 100)}%
          </span>
          <Badge
            className={`${THRESHOLD_COLORS[thresholdLabel] ?? "bg-slate-600"} text-white text-xs`}
          >
            {thresholdLabel}
          </Badge>
        </div>
      </header>

      {/* ─── Main area ─── */}
      <div className="flex-1 relative" ref={containerRef}>
        {/* Graph canvas */}
        {filteredData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={graphRef}
            graphData={filteredData}
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={(node: GraphNode, color, ctx) => {
              const r = 4 + node.depth * 16;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, r + 2, 0, Math.PI * 2);
              ctx.fill();
            }}
            linkColor={linkColor}
            linkWidth={linkWidth}
            onNodeClick={handleNodeClick}
            backgroundColor="#080b14"
            width={containerSize.width}
            height={containerSize.height}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            cooldownTicks={200}
            nodeId="id"
            linkSource="source"
            linkTarget="target"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <Sparkles className="h-12 w-12 text-blue-400/50" />
            <p className="text-slate-400 font-sora text-lg">
              Your mind map is empty
            </p>
            <p className="text-slate-500 text-sm max-w-md">
              Start capturing memories, values, and decisions to see your
              identity graph come alive.
            </p>
            <Button
              onClick={() => setLocation("/halliday")}
              className="bg-blue-600 hover:bg-blue-700 mt-2"
            >
              Start Halliday Interview
            </Button>
          </div>
        )}

        {/* ─── Prompt bubbles ─── */}
        {visiblePrompts.length > 0 && (
          <div className="absolute bottom-24 left-6 flex flex-col gap-3 z-10 max-w-sm">
            {visiblePrompts.slice(0, 3).map((prompt, i) => (
              <div
                key={prompt.id}
                className="glass rounded-xl p-4 animate-float-in"
                style={{ animationDelay: `${i * 0.15}s` }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-serif italic text-sm text-slate-200 leading-relaxed">
                    {prompt.question}
                  </p>
                  <button
                    onClick={() =>
                      setDismissedPrompts((s) => new Set(s).add(prompt.id))
                    }
                    className="text-slate-500 hover:text-slate-300 flex-shrink-0 mt-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={answerTexts[prompt.id] ?? ""}
                    onChange={(e) =>
                      setAnswerTexts((prev) => ({
                        ...prev,
                        [prompt.id]: e.target.value,
                      }))
                    }
                    placeholder="Answer here..."
                    rows={2}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                  />
                  <Button
                    size="sm"
                    disabled={
                      !answerTexts[prompt.id]?.trim() ||
                      answerMutation.isPending
                    }
                    onClick={() => handleAnswer(prompt)}
                    className="bg-blue-600 hover:bg-blue-700 self-end"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex gap-2 mt-2">
                  <Badge
                    variant="outline"
                    className="text-xs border-white/10"
                    style={{ color: LAYER_COLORS[prompt.targetLayer] }}
                  >
                    {LAYER_LABELS[prompt.targetLayer]}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Node detail panel ─── */}
        <div
          className={`absolute top-0 right-0 h-full w-96 glass border-l border-white/5 z-20 transition-transform duration-300 ${
            selectedNode ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {selectedNode && (
            <div className="p-6 h-full overflow-y-auto">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-lg font-semibold font-sora pr-4">
                  {selectedNode.label}
                </h2>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-400 hover:text-white flex-shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex gap-2 mb-4">
                <Badge
                  className="text-xs"
                  style={{
                    backgroundColor: LAYER_COLORS[selectedNode.hallidayLayer] + "33",
                    color: LAYER_COLORS[selectedNode.hallidayLayer],
                    borderColor: LAYER_COLORS[selectedNode.hallidayLayer] + "66",
                  }}
                >
                  {LAYER_LABELS[selectedNode.hallidayLayer]}
                </Badge>
                <Badge variant="outline" className="text-xs text-slate-400 border-slate-600">
                  {selectedNode.nodeType.replace(/_/g, " ")}
                </Badge>
              </div>

              <p className="font-serif text-slate-300 text-sm leading-relaxed mb-6">
                {selectedNode.content.length > 500
                  ? selectedNode.content.slice(0, 500) + "…"
                  : selectedNode.content}
              </p>

              {/* Depth indicator */}
              <div className="mb-6">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Understanding depth</span>
                  <span>{Math.round(selectedNode.depth * 100)}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round(selectedNode.depth * 100)}%`,
                      backgroundColor:
                        LAYER_COLORS[selectedNode.hallidayLayer],
                    }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedNode.edgeCount} connection{selectedNode.edgeCount !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Connected nodes */}
              {connectedNodes.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Connected
                  </h3>
                  <div className="space-y-1">
                    {connectedNodes.slice(0, 8).map((n) => (
                      <button
                        key={n.id}
                        onClick={() => setSelectedNode(n)}
                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: LAYER_COLORS[n.hallidayLayer],
                          }}
                        />
                        <span className="text-sm text-slate-300 truncate">
                          {n.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Deepen CTA */}
              <Button
                onClick={() => {
                  const cat = LAYER_TO_CATEGORY[selectedNode.hallidayLayer];
                  setLocation(
                    `/halliday?topic=${selectedNode.id}&layer=${cat}`
                  );
                }}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Deepen this memory
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Layer filter bar ─── */}
      <div className="glass border-t border-white/5 px-6 py-3 flex items-center gap-2 z-20 relative overflow-x-auto">
        <button
          onClick={() => setActiveLayer(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sora transition-colors ${
            activeLayer === null
              ? "bg-white/10 text-white"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          All
        </button>
        {(graphQuery.data?.layerStats ?? []).map((ls) => (
          <button
            key={ls.layer}
            onClick={() =>
              setActiveLayer(activeLayer === ls.layer ? null : ls.layer)
            }
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-sora transition-colors ${
              activeLayer === ls.layer
                ? "bg-white/10 text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: LAYER_COLORS[ls.layer] }}
            />
            <span className="font-semibold">
              {LAYER_LABELS[ls.layer]}
            </span>
            <span className="text-slate-500">{ls.count}</span>
            <span
              className="text-slate-600"
              style={{ color: LAYER_COLORS[ls.layer] + "aa" }}
            >
              {Math.round(ls.completion * 100)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
