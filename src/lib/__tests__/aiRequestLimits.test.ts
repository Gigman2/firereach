/**
 * What the app sends to /v1/ai/ask, and what it says when that request fails.
 *
 * The API refuses a history longer than its limit, and any turn longer than
 * its per-turn limit, with a 400. The chat used to send every message it had,
 * so a conversation past about 26 questions, or one answer longer than 2,000
 * characters, made every later question fail. Each failure then showed the
 * offline message, which blamed the network for a request the server refused.
 */
import {
  askFailureMessage,
  historyForRequest,
  MAX_HISTORY_TURNS,
  MAX_QUESTION_CHARACTERS,
  MAX_TURN_CHARACTERS,
  type AskTurn,
} from "../aiApi";
import { ApiError } from "../apiClient";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

function turns(count: number): AskTurn[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `turn ${i}`,
  }));
}

describe("historyForRequest", () => {
  it("leaves a short conversation as it is", () => {
    const history = turns(4);
    expect(historyForRequest(history)).toEqual(history);
  });

  it("sends only the most recent turns, which are the ones the model is shown", () => {
    const trimmed = historyForRequest(turns(40));
    expect(trimmed).toHaveLength(MAX_HISTORY_TURNS);
    expect(trimmed[trimmed.length - 1].content).toBe("turn 39");
  });

  it("clips a long answer rather than failing every later question", () => {
    const long: AskTurn[] = [
      { role: "assistant", content: "a".repeat(MAX_TURN_CHARACTERS + 500) },
    ];
    expect(historyForRequest(long)[0].content).toHaveLength(MAX_TURN_CHARACTERS);
  });

  it("never cuts a character in half", () => {
    // Slicing a string by index splits an emoji, which is two UTF-16 units.
    const long: AskTurn[] = [
      { role: "user", content: "🔥".repeat(MAX_TURN_CHARACTERS + 10) },
    ];
    const clipped = historyForRequest(long)[0].content;
    expect(Array.from(clipped)).toHaveLength(MAX_TURN_CHARACTERS);
    // Ends on a whole emoji. Slicing by index would leave half a pair here.
    expect(clipped.endsWith("🔥")).toBe(true);
  });

  // The API counts characters, not bytes, so these are the same number on both
  // sides: api/internal/usecase/ai/ask.go.
  it("matches the limits the API publishes", () => {
    expect(MAX_QUESTION_CHARACTERS).toBe(1000);
    expect(MAX_TURN_CHARACTERS).toBe(2000);
  });
});

describe("askFailureMessage", () => {
  it("says to wait when the server rate limits", () => {
    expect(askFailureMessage(new ApiError(429, "rate limit exceeded"))).toMatch(/wait a minute/i);
  });

  it("says the question was refused when the server refuses it", () => {
    expect(askFailureMessage(new ApiError(400, "ask ai: invalid input"))).toMatch(/fewer words/i);
  });

  it("keeps the offline message for a network failure", () => {
    expect(askFailureMessage(new Error("Network request failed"))).toMatch(/work offline/i);
  });

  it("keeps the offline message when the server itself fails", () => {
    expect(askFailureMessage(new ApiError(500, "internal server error"))).toMatch(/work offline/i);
  });

  it("uses no em dash in anything it returns", () => {
    const messages = [
      askFailureMessage(new ApiError(429, "")),
      askFailureMessage(new ApiError(400, "")),
      askFailureMessage(new Error("")),
    ];
    messages.forEach((message) => expect(message).not.toContain("—"));
  });
});
