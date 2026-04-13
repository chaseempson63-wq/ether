-- 002_graph_memory.sql
-- Graph-based memory architecture for Ether's five Halliday identity layers.
-- Old tables (memories, reasoning_patterns, core_values) are preserved for
-- data migration later.

-- Enable pgvector for embedding similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── New enum types ───

CREATE TYPE node_type AS ENUM (
  'memory', 'person', 'place', 'value', 'belief',
  'reasoning_pattern', 'decision', 'skill', 'event',
  'emotion', 'concept'
);

CREATE TYPE halliday_layer AS ENUM (
  'voice_and_language', 'memory_and_life_events',
  'reasoning_and_decisions', 'values_and_beliefs',
  'emotional_patterns'
);

CREATE TYPE graph_source_type AS ENUM (
  'journal', 'voice_memo', 'interview', 'halliday', 'chat',
  'reflection', 'quick_memory', 'system_inferred'
);

-- ─── Memory nodes (unified graph node for all identity data) ───

CREATE TABLE memory_nodes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_type       node_type NOT NULL,
  halliday_layer  halliday_layer NOT NULL,
  content         TEXT NOT NULL,
  summary         TEXT,
  embedding       vector(1024),
  source_type     graph_source_type NOT NULL,
  confidence      REAL DEFAULT 1.0,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Memory edges (relationships between nodes) ───

CREATE TABLE memory_edges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_node_id    UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  target_node_id    UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  strength          REAL DEFAULT 0.5,
  evidence          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ───

CREATE INDEX memory_nodes_user_id_idx ON memory_nodes(user_id);
CREATE INDEX memory_nodes_node_type_idx ON memory_nodes(node_type);
CREATE INDEX memory_nodes_halliday_layer_idx ON memory_nodes(halliday_layer);
CREATE INDEX memory_nodes_embedding_idx ON memory_nodes USING hnsw (embedding vector_cosine_ops);

CREATE INDEX memory_edges_user_id_idx ON memory_edges(user_id);
CREATE INDEX memory_edges_source_node_idx ON memory_edges(source_node_id);
CREATE INDEX memory_edges_target_node_idx ON memory_edges(target_node_id);

-- ─── Auto-update updated_at on memory_nodes ───

CREATE TRIGGER trg_memory_nodes_updated_at
  BEFORE UPDATE ON memory_nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
