import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, float, boolean, bigint } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Ether-specific tables for legacy memory and reasoning platform

/**
 * Profiles table: Stores the core identity of each user
 */
export const profiles = mysqlTable("profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  bio: text("bio"),
  headline: varchar("headline", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;

/**
 * Memories table: Stores the "Surface Layer" (Facts, Events, Journal Entries)
 */
export const memories = mysqlTable("memories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  content: text("content").notNull(),
  sourceType: mysqlEnum("sourceType", ["journal", "voice_memo", "passive_import", "interview"]).notNull(),
  occurredAt: timestamp("occurredAt"),
  embedding: json("embedding"), // Store as JSON array for vector data
  tags: json("tags"), // Store as JSON array of strings
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Memory = typeof memories.$inferSelect;
export type InsertMemory = typeof memories.$inferInsert;

/**
 * Reasoning patterns table: Stores the "Logic Layer" (Decisions and their 'Why')
 */
export const reasoningPatterns = mysqlTable("reasoningPatterns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  decision: text("decision").notNull(),
  logicWhy: text("logicWhy").notNull(),
  outcome: text("outcome"),
  embedding: json("embedding"),
  tags: json("tags"), // e.g., ['risk', 'independence', 'growth']
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReasoningPattern = typeof reasoningPatterns.$inferSelect;
export type InsertReasoningPattern = typeof reasoningPatterns.$inferInsert;

/**
 * Core values table: Stores the "Values Layer" (Non-negotiables and Beliefs)
 */
export const coreValues = mysqlTable("coreValues", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  valueStatement: text("valueStatement").notNull(),
  beliefContext: text("beliefContext"),
  priority: int("priority").default(1), // 1 is highest
  embedding: json("embedding"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CoreValue = typeof coreValues.$inferSelect;
export type InsertCoreValue = typeof coreValues.$inferInsert;

/**
 * Beneficiaries table: For the "Inheritance" layer
 */
export const beneficiaries = mysqlTable("beneficiaries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  relationship: varchar("relationship", { length: 100 }),
  accessLevel: mysqlEnum("accessLevel", ["full", "restricted", "legacy_only"]).default("legacy_only").notNull(),
  email: varchar("email", { length: 320 }),
  inviteToken: varchar("inviteToken", { length: 255 }).unique(),
  inviteTokenExpiry: timestamp("inviteTokenExpiry"),
  isActive: boolean("isActive").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Beneficiary = typeof beneficiaries.$inferSelect;
export type InsertBeneficiary = typeof beneficiaries.$inferInsert;

/**
 * Interview sessions table: Tracks AI-generated interview sessions
 */
export const interviewSessions = mysqlTable("interviewSessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sessionData: json("sessionData"), // Store questions, answers, and metadata
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InterviewSession = typeof interviewSessions.$inferSelect;
export type InsertInterviewSession = typeof interviewSessions.$inferInsert;

/**
 * Conversations table: Tracks chat sessions between user and their Digital Mind
 */
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }), // Auto-generated from first message
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * Chat messages table: Individual messages in a conversation
 */
export const chatMessages = mysqlTable("chatMessages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(), // Who sent the message
  content: text("content").notNull(),
  truthfulnessTag: mysqlEnum("truthfulnessTag", ["Known Memory", "Likely Inference", "Speculation"]),
  sourceMemories: json("sourceMemories"), // Array of memory IDs cited
  confidence: float("confidence"), // 0.0 to 1.0
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

/**
 * Halliday Questions table: Stores the 140+ question framework
 */
export const hallidayQuestions = mysqlTable("halliday_questions", {
  id: int("id").autoincrement().primaryKey(),
  questionId: varchar("questionId", { length: 10 }).notNull().unique(), // Q001, Q002, etc.
  category: varchar("category", { length: 50 }).notNull(), // voice_language, memory_life_events, etc.
  section: varchar("section", { length: 100 }).notNull(), // Natural Speech Patterns, etc.
  text: text("text").notNull(), // The actual question
  weight: float("weight").notNull(), // Category weight (0.2, 0.25, etc.)
  difficulty: int("difficulty").default(1), // 1-5 scale
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HallidayQuestion = typeof hallidayQuestions.$inferSelect;
export type InsertHallidayQuestion = typeof hallidayQuestions.$inferInsert;

/**
 * Halliday Responses table: Stores user answers to Halliday questions
 */
export const hallidayResponses = mysqlTable("halliday_responses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  questionId: varchar("questionId", { length: 10 }).notNull(),
  response: text("response").notNull(), // User's answer
  responseType: mysqlEnum("responseType", ["text", "voice", "interview"]).notNull(),
  specificity: float("specificity"), // 0.0-1.0 score for how specific the answer is
  accuracy: float("accuracy"), // 0.0-1.0 score for how well it captures their identity
  sourceMemoryId: int("sourceMemoryId"), // If response became a memory
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HallidayResponse = typeof hallidayResponses.$inferSelect;
export type InsertHallidayResponse = typeof hallidayResponses.$inferInsert;

/**
 * Halliday Progress table: Tracks user progress through the question bank
 */
export const hallidayProgress = mysqlTable("halliday_progress", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  totalQuestionsAnswered: int("totalQuestionsAnswered").default(0),
  voiceLanguageProgress: float("voiceLanguageProgress").default(0), // 0.0-1.0
  memoryLifeProgress: float("memoryLifeProgress").default(0),
  reasoningDecisionsProgress: float("reasoningDecisionsProgress").default(0),
  valuesBelifsProgress: float("valuesBelifsProgress").default(0),
  emotionalPatternsProgress: float("emotionalPatternsProgress").default(0),
  overallAccuracy: float("overallAccuracy").default(0), // Weighted accuracy across all categories
  lastQuestionAnsweredAt: timestamp("lastQuestionAnsweredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HallidayProgress = typeof hallidayProgress.$inferSelect;
export type InsertHallidayProgress = typeof hallidayProgress.$inferInsert;
