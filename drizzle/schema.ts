import { integer, jsonb, pgEnum, pgTable, real, serial, text, timestamp, varchar, boolean, uuid, vector, index } from "drizzle-orm/pg-core";

// ─── Enum types (match CREATE TYPE in 001_init.sql) ───

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const sourceTypeEnum = pgEnum("source_type", ["journal", "voice_memo", "passive_import", "interview"]);
export const accessLevelEnum = pgEnum("access_level", ["full", "restricted", "legacy_only"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);
export const truthfulnessTagEnum = pgEnum("truthfulness_tag", ["Known Memory", "Likely Inference", "Speculation"]);
export const responseTypeEnum = pgEnum("response_type", ["text", "voice", "interview"]);

// ─── Graph memory enums (match CREATE TYPE in 002_graph_memory.sql) ───

export const nodeTypeEnum = pgEnum("node_type", [
  "memory", "person", "place", "value", "belief",
  "reasoning_pattern", "decision", "skill", "event",
  "emotion", "concept",
]);

export const hallidayLayerEnum = pgEnum("halliday_layer", [
  "voice_and_language", "memory_and_life_events",
  "reasoning_and_decisions", "values_and_beliefs",
  "emotional_patterns",
]);

export const graphSourceTypeEnum = pgEnum("graph_source_type", [
  "journal", "voice_memo", "interview", "halliday", "chat",
  "reflection", "quick_memory", "system_inferred",
]);

// ─── Users ───

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: userRoleEnum("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Profiles ───

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  bio: text("bio"),
  headline: varchar("headline", { length: 255 }),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  voiceStyle: varchar("voice_style", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;

// ─── Memories (Surface Layer) ───

export const memories = pgTable("memories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  sourceType: sourceTypeEnum("source_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  embedding: jsonb("embedding"),
  tags: jsonb("tags"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Memory = typeof memories.$inferSelect;
export type InsertMemory = typeof memories.$inferInsert;

// ─── Reasoning Patterns (Logic Layer) ───

export const reasoningPatterns = pgTable("reasoning_patterns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  decision: text("decision").notNull(),
  logicWhy: text("logic_why").notNull(),
  outcome: text("outcome"),
  embedding: jsonb("embedding"),
  tags: jsonb("tags"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ReasoningPattern = typeof reasoningPatterns.$inferSelect;
export type InsertReasoningPattern = typeof reasoningPatterns.$inferInsert;

// ─── Core Values (Values Layer) ───

export const coreValues = pgTable("core_values", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  valueStatement: text("value_statement").notNull(),
  beliefContext: text("belief_context"),
  priority: integer("priority").default(1),
  embedding: jsonb("embedding"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CoreValue = typeof coreValues.$inferSelect;
export type InsertCoreValue = typeof coreValues.$inferInsert;

// ─── Beneficiaries (Inheritance Layer) ───

export const beneficiaries = pgTable("beneficiaries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  relationship: varchar("relationship", { length: 100 }),
  accessLevel: accessLevelEnum("access_level").notNull().default("legacy_only"),
  email: varchar("email", { length: 320 }),
  inviteToken: varchar("invite_token", { length: 255 }).unique(),
  inviteTokenExpiry: timestamp("invite_token_expiry", { withTimezone: true }),
  isActive: boolean("is_active").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Beneficiary = typeof beneficiaries.$inferSelect;
export type InsertBeneficiary = typeof beneficiaries.$inferInsert;

// ─── Interview Sessions ───

export const interviewSessions = pgTable("interview_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  sessionData: jsonb("session_data"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type InterviewSession = typeof interviewSessions.$inferSelect;
export type InsertInterviewSession = typeof interviewSessions.$inferInsert;

// ─── Conversations ───

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: varchar("title", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

// ─── Chat Messages ───

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  userId: integer("user_id").notNull(),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  truthfulnessTag: truthfulnessTagEnum("truthfulness_tag"),
  sourceMemories: jsonb("source_memories"),
  confidence: real("confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// ─── Halliday Questions ───

export const hallidayQuestions = pgTable("halliday_questions", {
  id: serial("id").primaryKey(),
  questionId: varchar("question_id", { length: 10 }).notNull().unique(),
  category: varchar("category", { length: 50 }).notNull(),
  section: varchar("section", { length: 100 }).notNull(),
  text: text("text").notNull(),
  weight: real("weight").notNull(),
  difficulty: integer("difficulty").default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type HallidayQuestion = typeof hallidayQuestions.$inferSelect;
export type InsertHallidayQuestion = typeof hallidayQuestions.$inferInsert;

// ─── Halliday Responses ───

export const hallidayResponses = pgTable("halliday_responses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  questionId: varchar("question_id", { length: 10 }).notNull(),
  response: text("response").notNull(),
  responseType: responseTypeEnum("response_type").notNull(),
  specificity: real("specificity"),
  accuracy: real("accuracy"),
  sourceMemoryId: integer("source_memory_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type HallidayResponse = typeof hallidayResponses.$inferSelect;
export type InsertHallidayResponse = typeof hallidayResponses.$inferInsert;

// ─── Halliday Progress ───

export const hallidayProgress = pgTable("halliday_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  totalQuestionsAnswered: integer("total_questions_answered").default(0),
  voiceLanguageProgress: real("voice_language_progress").default(0),
  memoryLifeProgress: real("memory_life_progress").default(0),
  reasoningDecisionsProgress: real("reasoning_decisions_progress").default(0),
  valuesBelifsProgress: real("values_beliefs_progress").default(0),
  emotionalPatternsProgress: real("emotional_patterns_progress").default(0),
  overallAccuracy: real("overall_accuracy").default(0),
  lastQuestionAnsweredAt: timestamp("last_question_answered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type HallidayProgress = typeof hallidayProgress.$inferSelect;
export type InsertHallidayProgress = typeof hallidayProgress.$inferInsert;

// ─── Memory Nodes (graph-based unified identity data) ───

export const memoryNodes = pgTable("memory_nodes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: integer("user_id").notNull(),
  nodeType: nodeTypeEnum("node_type").notNull(),
  hallidayLayer: hallidayLayerEnum("halliday_layer").notNull(),
  content: text("content").notNull(),
  summary: text("summary"),
  embedding: vector("embedding", { dimensions: 1024 }),
  sourceType: graphSourceTypeEnum("source_type").notNull(),
  confidence: real("confidence").default(1.0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("memory_nodes_user_id_idx").on(table.userId),
  index("memory_nodes_node_type_idx").on(table.nodeType),
  index("memory_nodes_halliday_layer_idx").on(table.hallidayLayer),
  index("memory_nodes_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
]);

export type MemoryNode = typeof memoryNodes.$inferSelect;
export type InsertMemoryNode = typeof memoryNodes.$inferInsert;

// ─── Memory Edges (relationships between nodes) ───

export const memoryEdges = pgTable("memory_edges", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: integer("user_id").notNull(),
  sourceNodeId: uuid("source_node_id").notNull(),
  targetNodeId: uuid("target_node_id").notNull(),
  relationshipType: text("relationship_type").notNull(),
  strength: real("strength").default(0.5),
  evidence: text("evidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("memory_edges_user_id_idx").on(table.userId),
  index("memory_edges_source_node_idx").on(table.sourceNodeId),
  index("memory_edges_target_node_idx").on(table.targetNodeId),
]);

export type MemoryEdge = typeof memoryEdges.$inferSelect;
export type InsertMemoryEdge = typeof memoryEdges.$inferInsert;
