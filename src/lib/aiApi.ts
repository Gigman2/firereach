import { ApiError, apiPost } from "./apiClient";
import { getDeviceHash } from "./deviceHash";

/**
 * The structured answer the chat renders per `kind`. The server owns the
 * classification; the app owns every phone number and call-to-action, so no
 * field carries a number — the call controls dial the app constants, never
 * model text.
 */
export type AIResponseKind =
  | "text"
  | "emergency"
  | "steps"
  | "emergency_number"
  | "warning"
  | "out_of_scope";

export interface AIStep {
  title?: string;
  body: string;
}

export interface AIResponse {
  kind: AIResponseKind;
  title?: string;
  /** Lead prose. Always present. */
  body: string;
  /** Bullets (emergency/warning) or numbered steps (steps). */
  items?: AIStep[];
  /** True when items are an ordered procedure; false for bullets. */
  ordered?: boolean;
  /** Amber safety-warning callout text (kind "warning"). */
  warning?: string;
  /** Server-computed plain-text flattening, kept for backward compat. */
  answer: string;
}

interface AskAIResponse extends AIResponse {}

/**
 * Routes through the Go backend, never the Anthropic API directly — the key
 * stays server-side and the backend applies the scoped system prompt.
 * Product Scope §API: "The mobile app never calls the Claude API directly."
 */
/** One prior message in the conversation, sent so follow-ups carry context. */
export interface AskTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Limits the API enforces (api/internal/usecase/ai/ask.go). It counts
 * characters rather than bytes, so these are the same numbers on both sides
 * and a question written in Twi gets the same room as one in English.
 */
export const MAX_QUESTION_CHARACTERS = 1000;
export const MAX_TURN_CHARACTERS = 2000;

/**
 * The API accepts a longer history, but its gateway shows the model only the
 * most recent turns (api/internal/infra/claude/gateway.go), so older ones cost
 * request size and are then dropped.
 */
export const MAX_HISTORY_TURNS = 12;

/**
 * The part of a conversation worth sending: the most recent turns, each clipped
 * to what the API accepts.
 *
 * The chat used to send everything it had, so a conversation past about 26
 * questions, or a single answer longer than a turn's limit, was refused with a
 * 400, and every later question in that chat failed the same way.
 */
export function historyForRequest(history: AskTurn[]): AskTurn[] {
  return history.slice(-MAX_HISTORY_TURNS).map((turn) => ({
    role: turn.role,
    content: clip(turn.content, MAX_TURN_CHARACTERS),
  }));
}

/** Clips by character, so a clip never splits an emoji into half a pair. */
function clip(text: string, limit: number): string {
  const characters = Array.from(text);
  return characters.length <= limit ? text : characters.slice(0, limit).join("");
}

/**
 * What to show when a question fails.
 *
 * One message used to cover every failure, so a rate limit or a question the
 * server refused told the user the assistant was unreachable and sent them to
 * the offline guides, which answers neither.
 */
export function askFailureMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return "That's a lot of questions in a short time. Wait a minute, then ask again.";
    }
    if (err.status >= 400 && err.status < 500) {
      return "I couldn't use that question. Try asking it again in fewer words.";
    }
  }
  return "I couldn't reach the safety assistant. The written guides work offline, so go back and open any topic.";
}

export async function askAI(
  question: string,
  topic?: string,
  history?: AskTurn[],
): Promise<AIResponse> {
  const body: { question: string; topic?: string; history?: AskTurn[] } = {
    question,
  };
  if (topic) body.topic = topic;
  const recent = historyForRequest(history ?? []);
  if (recent.length > 0) body.history = recent;

  // /v1/ai/ask is rate-limited per device hash, falling back to client IP.
  // Without this header everyone behind one carrier NAT shares a single
  // budget — the same reasoning as submissionsApi.ts:134.
  const deviceHash = await getDeviceHash();

  const response = await apiPost<AskAIResponse>("/v1/ai/ask", body, {
    "X-Device-Hash": deviceHash,
  });

  return response;
}
