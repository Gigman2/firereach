import { apiPost } from "./apiClient";
import { getDeviceHash } from "./deviceHash";

interface AskAIResponse {
  answer: string;
}

/**
 * Routes through the Go backend, never the Anthropic API directly — the key
 * stays server-side and the backend applies the scoped system prompt.
 * Product Scope §API: "The mobile app never calls the Claude API directly."
 */
export async function askAI(question: string, topic?: string): Promise<string> {
  const body: { question: string; topic?: string } = { question };
  if (topic) body.topic = topic;

  // /v1/ai/ask is rate-limited per device hash, falling back to client IP.
  // Without this header everyone behind one carrier NAT shares a single
  // budget — the same reasoning as submissionsApi.ts:134.
  const deviceHash = await getDeviceHash();

  const response = await apiPost<AskAIResponse>("/v1/ai/ask", body, {
    "X-Device-Hash": deviceHash,
  });

  return response.answer;
}
