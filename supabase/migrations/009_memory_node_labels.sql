-- Add short concept labels to memory nodes.
--
-- Venice generates a 2-3 word ALL CAPS label at create time ("BROKE MY LEG",
-- "FIRST JOB", "LOST FAITH"). The mind map canvas renders this instead of the
-- long content/summary text so nodes are visually legible at a glance.
--
-- Nullable for backward compatibility: legacy rows pre-backfill stay null and
-- the UI falls back to summary/content. A backfill script
-- (scripts/backfill-node-labels.mjs) hits Venice once per existing row.

ALTER TABLE memory_nodes
  ADD COLUMN IF NOT EXISTS label text;
