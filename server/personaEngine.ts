import { invokeLLM } from "./_core/llm";
import { getMemoriesByUserId, getReasoningPatternsByUserId, getCoreValuesByUserId } from "./db";

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

  return `You are the Digital Mind of a user named Chase. Your role is to think, reason, and advise based on their unique perspective, values, and life experience.

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
 * Retrieve relevant memories and reasoning patterns for a query
 */
export async function retrieveRelevantContext(userId: number, query: string, limit = 5) {
  const memories = await getMemoriesByUserId(userId, limit);
  const reasoning = await getReasoningPatternsByUserId(userId, limit);

  // Simple keyword matching for now (in production, use vector similarity)
  const relevantMemories = memories.filter((m) =>
    query.toLowerCase().includes(m.content.substring(0, 50).toLowerCase()) ||
      (Array.isArray(m.tags) && m.tags.some((tag: string) => query.toLowerCase().includes(tag.toLowerCase())))
  );

  const relevantReasoning = reasoning.filter((r) =>
    query.toLowerCase().includes(r.decision.substring(0, 30).toLowerCase()) ||
      query.toLowerCase().includes(r.logicWhy.substring(0, 30).toLowerCase())
  );

  return {
    memories: relevantMemories.slice(0, 3),
    reasoning: relevantReasoning.slice(0, 3),
  };
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

    // Retrieve relevant context
    const context = await retrieveRelevantContext(userId, userQuery);

    // Build context string
    const contextString = `
## Relevant Memories
${context.memories.map((m) => `- ${m.content.substring(0, 200)}`).join("\n") || "No relevant memories found."}

## Relevant Reasoning
${context.reasoning.map((r) => `- Decision: ${r.decision}\n  Logic: ${r.logicWhy}`).join("\n") || "No relevant reasoning found."}

## User Query
${userQuery}
`;

    // Prepare messages for LLM
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: contextString },
    ];

    // Call LLM
    const response = await invokeLLM({
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })) as any,
    });

    const responseContent = typeof response.choices[0]?.message?.content === 'string' 
      ? response.choices[0].message.content 
      : '';

    // Determine truthfulness tag based on context
    let truthfulnessTag: TruthfulnessTag;
    if (context.memories.length > 0 || context.reasoning.length > 0) {
      truthfulnessTag = {
        type: "likely_inference",
        confidence: 0.8,
        source: "Based on user's documented patterns and values",
      };
    } else {
      truthfulnessTag = {
        type: "speculation",
        confidence: 0.5,
        source: "Limited context available",
      };
    }

    return {
      content: responseContent,
      truthfulnessTag,
      sourceMemories: context.memories.map((m) => m.content.substring(0, 100)),
      reasoning: context.reasoning.map((r) => r.decision).join(", "),
    };
  } catch (error) {
    console.error("Error generating persona response:", error);
    throw error;
  }
}
