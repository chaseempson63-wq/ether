import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ───
// Mock db BEFORE importing graphPipeline so the real postgres client never
// loads. The fake db is just in-memory state we drive per-test.

type FakeNode = {
  id: string;
  userId: number;
  nodeType: string;
  hallidayLayer: string;
  content: string;
  summary: string | null;
  embedding: number[] | null;
  sourceType: string;
  confidence: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeEdge = {
  userId: number;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: string;
  strength: number;
  evidence: string | null;
};

const fake = {
  nodes: new Map<string, FakeNode>(),
  edges: [] as FakeEdge[],
  createNodeCalls: 0,
  createEdgeCalls: 0,
  updateNodeCalls: [] as Array<{
    id: string;
    data: Record<string, unknown>;
  }>,
  nextNodeCounter: 0,
};

function resetFake() {
  fake.nodes.clear();
  fake.edges.length = 0;
  fake.createNodeCalls = 0;
  fake.createEdgeCalls = 0;
  fake.updateNodeCalls = [];
  fake.nextNodeCounter = 0;
}

vi.mock("./db", () => ({
  getMemoryNodesByIds: vi.fn(async (ids: string[]) => {
    return ids.map((id) => fake.nodes.get(id)).filter(Boolean) as FakeNode[];
  }),
  searchMemoryNodesByName: vi.fn(
    async (userId: number, name: string) => {
      const lower = name.toLowerCase();
      return Array.from(fake.nodes.values()).filter((n) => {
        if (n.userId !== userId) return false;
        const meta = n.metadata ?? {};
        const nodeName = ((meta.name as string) ?? "").toLowerCase();
        const aliases = ((meta.aliases as string[]) ?? []).map((a) =>
          a.toLowerCase()
        );
        return (
          nodeName === lower ||
          nodeName.includes(lower) ||
          aliases.some((a) => a === lower)
        );
      });
    }
  ),
  createMemoryNode: vi.fn(
    async (
      userId: number,
      data: {
        nodeType: string;
        hallidayLayer: string;
        content: string;
        summary?: string | null;
        sourceType: string;
        confidence?: number;
        metadata?: Record<string, unknown> | null;
      }
    ) => {
      fake.createNodeCalls += 1;
      fake.nextNodeCounter += 1;
      const id = `node-new-${fake.nextNodeCounter}`;
      const node: FakeNode = {
        id,
        userId,
        nodeType: data.nodeType,
        hallidayLayer: data.hallidayLayer,
        content: data.content,
        summary: data.summary ?? null,
        embedding: null,
        sourceType: data.sourceType,
        confidence: data.confidence ?? 1.0,
        metadata: data.metadata ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      fake.nodes.set(id, node);
      return node;
    }
  ),
  createMemoryEdge: vi.fn(
    async (
      userId: number,
      data: {
        sourceNodeId: string;
        targetNodeId: string;
        relationshipType: string;
        strength?: number;
        evidence?: string;
      }
    ) => {
      fake.createEdgeCalls += 1;
      const edge: FakeEdge = {
        userId,
        sourceNodeId: data.sourceNodeId,
        targetNodeId: data.targetNodeId,
        relationshipType: data.relationshipType,
        strength: data.strength ?? 0.5,
        evidence: data.evidence ?? null,
      };
      fake.edges.push(edge);
      return edge;
    }
  ),
  updateMemoryNode: vi.fn(
    async (
      id: string,
      data: {
        content?: string;
        summary?: string | null;
        embedding?: number[] | null;
        metadata?: Record<string, unknown> | null;
        confidence?: number;
      }
    ) => {
      fake.updateNodeCalls.push({ id, data });
      const existing = fake.nodes.get(id);
      if (!existing) return;
      if (data.content !== undefined) existing.content = data.content;
      if (data.summary !== undefined) existing.summary = data.summary;
      if (data.embedding !== undefined) existing.embedding = data.embedding;
      if (data.metadata !== undefined) existing.metadata = data.metadata;
      if (data.confidence !== undefined) existing.confidence = data.confidence;
      existing.updatedAt = new Date();
    }
  ),
}));

vi.mock("./embeddingService", () => ({
  generateEmbedding: vi.fn(async () => ({
    embedding: new Array(1024).fill(0.1),
  })),
}));

// invokeLLM is used by extractEntities + proposeAndCreateEdges. Each test
// customises its return value by setting mockLLMResponse before invoking.
let mockLLMResponse: string = "[]";
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async () => ({
    choices: [{ message: { content: mockLLMResponse } }],
  })),
}));

// Import AFTER mocks so graphPipeline binds to the fake db + llm
import { processProbeResponse } from "./graphPipeline";

// ─── Helpers ───

function seedSourceNode(overrides: Partial<FakeNode> = {}): FakeNode {
  const node: FakeNode = {
    id: overrides.id ?? "source-node-1",
    userId: 1,
    nodeType: "concept",
    hallidayLayer: "values_and_beliefs",
    content: "faith anchors me through uncertainty",
    summary: "personal anchor belief",
    embedding: new Array(1024).fill(0),
    sourceType: "reflection",
    confidence: 1.0,
    metadata: { name: "faith", aliases: ["faith"] },
    createdAt: new Date(Date.now() - 10_000),
    updatedAt: new Date(Date.now() - 10_000),
    ...overrides,
  };
  fake.nodes.set(node.id, node);
  return node;
}

// ─── Tests ───

describe("processProbeResponse", () => {
  beforeEach(() => {
    resetFake();
    mockLLMResponse = "[]";
  });

  it("enriches the source node: appends probe content and regenerates embedding", async () => {
    const source = seedSourceNode();
    const probe =
      "when my daughter was born premature, faith was the only thing that kept me steady.";

    // Extraction returns nothing new — pure enrichment path.
    mockLLMResponse = "[]";

    const result = await processProbeResponse(
      source.userId,
      source.id,
      probe,
      "reflection"
    );

    expect(result.enrichedSource).toBe(true);
    expect(result.newChildNodeIds).toEqual([]);

    // Source content grew — it includes the original and the probe response.
    const updated = fake.nodes.get(source.id)!;
    expect(updated.content).toContain("faith anchors me through uncertainty");
    expect(updated.content).toContain("daughter was born premature");
    expect(updated.content.length).toBeGreaterThan(
      "faith anchors me through uncertainty".length
    );

    // Embedding was regenerated (1024-dim from the mock).
    expect(updated.embedding).toHaveLength(1024);

    // updateMemoryNode was called on the source with content + embedding.
    const sourceUpdates = fake.updateNodeCalls.filter(
      (c) => c.id === source.id
    );
    expect(sourceUpdates.length).toBeGreaterThan(0);
    expect(sourceUpdates[0]?.data).toMatchObject({
      content: expect.stringContaining("daughter was born premature"),
      embedding: expect.any(Array),
    });
  });

  it("creates no orphan nodes when the probe response has no new entities", async () => {
    const source = seedSourceNode();
    mockLLMResponse = "[]"; // no entities extracted

    await processProbeResponse(source.userId, source.id, "just rambling.", "reflection");

    // Zero new nodes, zero edges — the ONLY change should be enriching the source.
    expect(fake.createNodeCalls).toBe(0);
    expect(fake.createEdgeCalls).toBe(0);
    // Fake DB has exactly one node — the source.
    expect(fake.nodes.size).toBe(1);
    expect(fake.edges).toHaveLength(0);
  });

  it("creates child nodes for new entities AND edges them back to the source", async () => {
    const source = seedSourceNode();

    // Extraction finds two new entities the user hasn't mentioned before.
    mockLLMResponse = JSON.stringify([
      {
        name: "Grace",
        node_type: "person",
        halliday_layer: "memory_and_life_events",
        summary: "my daughter, born premature",
      },
      {
        name: "NICU nights",
        node_type: "event",
        halliday_layer: "emotional_patterns",
        summary: "weeks of bedside vigils in the NICU",
      },
    ]);

    const probe =
      "Grace was born premature — NICU nights tested every ounce of faith I had.";
    const result = await processProbeResponse(
      source.userId,
      source.id,
      probe,
      "reflection"
    );

    expect(result.enrichedSource).toBe(true);
    expect(result.newChildNodeIds).toHaveLength(2);

    // Two new nodes created (source is not counted — it was updated, not created).
    expect(fake.createNodeCalls).toBe(2);

    // Two edges — one from source → each new child, all typed "elaborates_on".
    expect(fake.edges).toHaveLength(2);
    for (const edge of fake.edges) {
      expect(edge.sourceNodeId).toBe(source.id);
      expect(edge.relationshipType).toBe("elaborates_on");
      expect(result.newChildNodeIds).toContain(edge.targetNodeId);
      expect(edge.userId).toBe(source.userId);
    }

    // Every new child node has an edge pointing to it from the source — no orphans.
    for (const childId of result.newChildNodeIds) {
      const hasEdge = fake.edges.some(
        (e) => e.sourceNodeId === source.id && e.targetNodeId === childId
      );
      expect(hasEdge).toBe(true);
    }

    // The source content still grew (enrichment always happens).
    const updated = fake.nodes.get(source.id)!;
    expect(updated.content).toContain("Grace was born premature");
  });

  it("bails safely when the source node does not exist", async () => {
    mockLLMResponse = "[]";
    const result = await processProbeResponse(
      1,
      "nonexistent-node",
      "whatever",
      "reflection"
    );

    expect(result.enrichedSource).toBe(false);
    expect(result.newChildNodeIds).toEqual([]);
    expect(fake.createNodeCalls).toBe(0);
    expect(fake.createEdgeCalls).toBe(0);
    expect(fake.updateNodeCalls).toHaveLength(0);
  });
});
