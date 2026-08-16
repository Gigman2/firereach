import { apiPost } from "./apiClient";
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
export async function askAI(
  question: string,
  topic?: string,
): Promise<AIResponse> {
  const body: { question: string; topic?: string } = { question };
  if (topic) body.topic = topic;

  // /v1/ai/ask is rate-limited per device hash, falling back to client IP.
  // Without this header everyone behind one carrier NAT shares a single
  // budget — the same reasoning as submissionsApi.ts:134.
  const deviceHash = await getDeviceHash();

  const response = await apiPost<AskAIResponse>("/v1/ai/ask", body, {
    "X-Device-Hash": deviceHash,
  });

  return response;
}
