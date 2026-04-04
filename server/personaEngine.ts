import { getMemoriesByUserId, getReasoningPatternsByUserId, getCoreValuesByUserId } from "./db";
import { hybridSearch } from "./vectorSearch";
import { generateEmbedding } from "./embeddingService";

/**
 * Persona Engine: Generates responses based on user's memories, reasoning patterns, and values
 * This is the core "Digital Mind" that mirrors the user's voice and reasoning
 */

export interface TruthfulnessTag {
  type: "known_memory" | "likely_inference" | "speculation";
  confidence: number; // 0-1
  source?: string;
}

export interface PersonaResponse {
  content: string;
  truthfulnessTag: TruthfulnessTag;
  sourceMemories?: string[];
  reasoning?: string;
}

/**
 * Build the system prompt for the persona based on user's core values and reasoning patterns
 */
export async function buildPersonaSystemPrompt(userId: number): Promise<string> {
  const values = await getCoreValuesByUserId(userId);
  const reasoningPatterns = await getReasoningPatternsByUserId(userId, 10);

  const valueStatements = values
    .map((v) => `- ${v.valueStatement}${v.beliefContext ? ` (${v.beliefContext})` : ""}`)
    .join("\n");

  const reasoningExamples = reasoningPatterns
    .map((r) => `Decision: ${r.decision}\nReasoning: ${r.logicWhy}${r.outcome ? `\nOutcome: ${r.outcome}` : ""}`)
    .join("\n\n");

  return `You are the Digital Mind of a user. Your role is to think, reason, and advise based on their unique perspective, values, and life experience.

## Core Values
${valueStatements || "No core values recorded yet."}

## Reasoning Patterns
${reasoningExamples || "No reasoning patterns recorded yet."}

## Instructions
1. Always respond in a direct, unfiltered manner. Do not use corporate-safe language.
2. When giving advice, reference the user's own past decisions and values.
3. Challenge ideas if they contradict the user's established values.
4. Be reflective and act as a "Second Mind" - help the user think more clearly about their situation.
5. If you're uncertain about something, clearly indicate your confidence level.
6. Never apologize for the user's views or values.
7. Maintain the user's authentic voice and perspective in all responses.`;
}

/**
 * Retrieve relevant memories and reasoning patterns for a query using semantic search
 */
export async function retrieveRelevantContext(userId: number, query: string, limit = 5) {
  try {
    // Generate embedding for the query
    const embeddingResult = await generateEmbedding(query);
    const queryEmbedding = embeddingResult.embedding;

    // Fetch all user's memories and reasoning patterns
    const memories = await getMemoriesByUserId(userId, 100); // Fetch more to filter by similarity
    const reasoning = await getReasoningPatternsByUserId(userId, 100);
    const values = await getCoreValuesByUserId(userId);

    // Use hybrid search for memories (semantic + keyword)
    const relevantMemories = hybridSearch(
      memories.map((m) => ({
        ...m,
        embedding: m.embedding
          ? typeof m.embedding === "string"
            ? JSON.parse(m.embedding)
            : Array.isArray(m.embedding)
            ? m.embedding
            : undefined
          : undefined,
      })),
      query,
      queryEmbedding,
      limit
    );

    // Use hybrid search for reasoning patterns
    const relevantReasoning = hybridSearch(
      reasoning.map((r) => ({
        ...r,
        content: r.decision + " " + r.logicWhy,
        embedding: r.embedding
          ? typeof r.embedding === "string"
            ? JSON.parse(r.embedding)
            : Array.isArray(r.embedding)
            ? r.embedding
            : undefined
          : undefined,
      })),
      query,
      queryEmbedding,
      limit
    );

    // Always include all core values (they're short and important)
    return {
      memories: relevantMemories.slice(0, limit),
      reasoning: relevantReasoning.slice(0, limit),
      values: values,
    };
  } catch (error) {
    console.error("Failed to retrieve context:", error);
    // Fallback to empty context if search fails
    return {
      memories: [],
      reasoning: [],
      values: [],
    };
  }
}

/**
 * Generate a response from the Persona Engine
 */
export async function generatePersonaResponse(
  userId: number,
  userQuery: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<PersonaResponse> {
  try {
    // Build the system prompt
    const systemPrompt = await buildPersonaSystemPrompt(userId);

    // Retrieve relevant context using semantic search
    const context = await retrieveRelevantContext(userId, userQuery);

    // Build context string
    const contextString = `
## Relevant Memories
${context.memories.map((m) => `- ${m.content?.substring(0, 200)}`).join("\n") || "No relevant memories found."}

## Relevant Reasoning
${context.reasoning.map((r) => `- Decision: ${r.decision}\n  Logic: ${r.logicWhy}`).join("\n") || "No relevant reasoning found."}

## Core Values
${context.values.map((v) => `- ${v.valueStatement}: ${v.beliefContext}`).join("\n") || "No core values found."}`;

    // Build messages for LLM
    const messages: any[] = [
      {
        role: "system",
        content: systemPrompt + "\n\n" + contextString,
      },
    ];

    // Add conversation history
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // Add current user query
    messages.push({
      role: "user",
      content: userQuery,
    });

    // Call LLM to generate response
    const response = await (require("./_core/llm").invokeLLM)({
      messages,
    });

    // Extract response content
    let responseContent = "I couldn't generate a response.";
    if (typeof response === "string") {
      responseContent = response;
    } else if (response.choices?.[0]?.message?.content) {
      responseContent = response.choices[0].message.content;
    }

    // Determine truthfulness tag
    let truthfulnessTag: TruthfulnessTag;
    if (context.memories.length > 0 && context.memories[0].score > 0.7) {
      truthfulnessTag = {
        type: "known_memory",
        confidence: Math.min(context.memories[0].score, 1),
        source: context.memories[0].content?.substring(0, 100),
      };
    } else if (context.reasoning.length > 0) {
      truthfulnessTag = {
        type: "likely_inference",
        confidence: 0.7,
        source: "Derived from reasoning patterns",
      };
    } else {
      truthfulnessTag = {
        type: "speculation",
        confidence: 0.5,
      };
    }

    return {
      content: responseContent,
      truthfulnessTag,
      sourceMemories: context.memories.map((m) => (m as any).content?.substring(0, 100) || ""),
    };
  } catch (error) {
    console.error("Error generating persona response:", error);
    throw new Error("Failed to generate response from Digital Mind");
  }
}
