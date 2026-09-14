/**
 * Behavioral coverage for two fix-round-1 findings on GuidesChatScreen:
 *
 * I1: `isLoading` must actually gate the Send button and surface a visible
 *     typing indicator, not just swallow a second tap silently.
 * I2: The "AI-generated" disclaimer must only render on messages that
 *     genuinely came back from askAI — not the static welcome message and
 *     not the client-side offline fallback.
 *
 * I3: A question the server refused must not be reported as a dead network.
 *     The screen showed one offline message for every failure, so a rate limit
 *     or a refused question told the user to go read the offline guides.
 *
 * Written with React.createElement (no JSX) so the file can stay a plain
 * .test.ts and run under the existing `testMatch` in jest.config.js, which
 * — like every other test in this suite — only picks up .test.ts files.
 */
import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NATIONAL_EMERGENCY_PHONE } from "../stationTypes";
import { GuidesChatScreen } from "../../screens/guides/GuidesChatScreen";
import { ApiError } from "../apiClient";
import { MAX_QUESTION_CHARACTERS } from "../aiApi";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const mockAskAI = jest.fn();
jest.mock("../aiApi", () => ({
  // Only askAI is faked: the screen also reads the real limits and the real
  // failure copy from this module.
  ...jest.requireActual("../aiApi"),
  askAI: (...args: unknown[]) => mockAskAI(...args),
}));

const FRAME = { x: 0, y: 0, width: 320, height: 640 };
const INSETS = { top: 0, left: 0, right: 0, bottom: 0 };

function renderScreen() {
  const navigation = { goBack: jest.fn() } as any;
  const route = { params: undefined } as any;

  let tree: ReturnType<typeof create>;
  act(() => {
    tree = create(
      React.createElement(
        SafeAreaProvider,
        { initialMetrics: { frame: FRAME, insets: INSETS } },
        React.createElement(GuidesChatScreen, { navigation, route })
      )
    );
  });
  return tree!;
}

function findAllText(node: any, out: string[] = []): string[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    node.forEach((n) => findAllText(n, out));
    return out;
  }
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (node.children) findAllText(node.children, out);
  return out;
}

function textOf(tree: ReturnType<typeof create>): string {
  return findAllText(tree.toJSON()).join(" | ");
}

// JSX interpolation (`Call {NATIONAL_EMERGENCY_PHONE}`) renders as two
// separate text children ("Call " and "192"), so a substring check for the
// whole phrase needs them concatenated without the " | " debug separator.
function flatTextOf(tree: ReturnType<typeof create>): string {
  return findAllText(tree.toJSON()).join("");
}

function getByTestId(tree: ReturnType<typeof create>, testID: string): ReactTestInstance {
  return tree.root.findByProps({ testID });
}

function queryByTestId(tree: ReturnType<typeof create>, testID: string): ReactTestInstance | null {
  const matches = tree.root.findAllByProps({ testID });
  return matches.length > 0 ? matches[0] : null;
}

/** A promise the test controls the settlement of, to hold the screen mid-request. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// The first render of GuidesChatScreen is when react-native's lazily
// required components load and, on a cold transform cache, compile. That
// one-time cost is about 3s on a fast laptop with a cold cache and exceeds
// Jest's default 5s per-test budget on a GitHub runner, where the cache is
// always cold. Paying it here, under its own budget, keeps each test's 5s
// timeout about that test's own behaviour, so a real hang still fails fast.
beforeAll(() => {
  jest.useFakeTimers();
  const tree = renderScreen();
  act(() => {
    tree.unmount();
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
}, 30000);

beforeEach(() => {
  mockAskAI.mockReset();
  // handleSend's `finally` schedules `flatListRef.current?.scrollToEnd(...)`
  // 100ms out. Fake timers let each test flush that deterministically inside
  // `act()` instead of leaving a real macrotask pending after the test (and
  // the Jest environment) tears down, which otherwise crashes the process.
  jest.useFakeTimers();
});

afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

describe("I1: loading state is visible", () => {
  it("disables Send while a request is in flight, independent of input text", async () => {
    const pending = deferred<any>();
    mockAskAI.mockReturnValue(pending.promise);

    const tree = renderScreen();

    const input = getByTestId(tree, "guidesChatInput");
    act(() => {
      input.props.onChangeText("How do I treat a burn?");
    });

    expect(getByTestId(tree, "guidesChatSendButton").props.disabled).toBe(false);

    // Fire the send. handleSend clears `input` synchronously, then awaits.
    await act(async () => {
      getByTestId(tree, "guidesChatSendButton").props.onPress();
    });

    // Loading now, and the box is empty again — type into it a second time to
    // prove the button stays disabled because of isLoading, not because the
    // field happens to be empty.
    act(() => {
      getByTestId(tree, "guidesChatInput").props.onChangeText("second question");
    });

    expect(getByTestId(tree, "guidesChatSendButton").props.disabled).toBe(true);
    expect(queryByTestId(tree, "guidesChatTypingIndicator")).not.toBeNull();

    await act(async () => {
      pending.resolve({
          kind: "text",
          body: "Stop, drop, and roll.",
          answer: "Stop, drop, and roll.",
        });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Loading finished; the button re-enables now that there is text again.
    expect(getByTestId(tree, "guidesChatSendButton").props.disabled).toBe(false);
    expect(queryByTestId(tree, "guidesChatTypingIndicator")).toBeNull();
  });
});

describe("I2: the AI-generated label only marks genuine askAI output", () => {
  it("does not label the welcome message", () => {
    const tree = renderScreen();
    expect(textOf(tree)).not.toContain("AI-generated · Not medical advice");
  });

  it("labels a real askAI response but not the offline fallback on failure", async () => {
    mockAskAI.mockResolvedValueOnce({
      kind: "text",
      body: "Cool the burn under running water.",
      answer: "Cool the burn under running water.",
    });
    const tree = renderScreen();

    await act(async () => {
      getByTestId(tree, "guidesChatInput").props.onChangeText("How do I treat a burn?");
    });
    await act(async () => {
      getByTestId(tree, "guidesChatSendButton").props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textOf(tree)).toContain("Cool the burn under running water.");
    const labelCountAfterSuccess = (textOf(tree).match(/AI-generated · Not medical advice/g) || [])
      .length;
    expect(labelCountAfterSuccess).toBe(1);

    // Fake timers freeze Date.now(); nudge it forward so this round's message
    // ids (Date.now()-derived) don't collide with the previous round's.
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    mockAskAI.mockRejectedValueOnce(new Error("network down"));
    await act(async () => {
      getByTestId(tree, "guidesChatInput").props.onChangeText("another question");
    });
    await act(async () => {
      getByTestId(tree, "guidesChatSendButton").props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = textOf(tree);
    // Fallback text is present and still offers the call shortcut...
    expect(rendered).toContain(
      "I couldn't reach the safety assistant. The written guides work offline, so go back and open any topic."
    );
    expect(flatTextOf(tree)).toContain(`Call ${NATIONAL_EMERGENCY_PHONE}`);
    // ...but the label count is unchanged: only the genuine askAI reply carries it.
    const labelCountAfterFailure = (rendered.match(/AI-generated · Not medical advice/g) || [])
      .length;
    expect(labelCountAfterFailure).toBe(1);
  });
});

describe("I3: a refused question does not read as a dead network", () => {
  async function ask(tree: ReturnType<typeof create>, question: string) {
    act(() => {
      getByTestId(tree, "guidesChatInput").props.onChangeText(question);
    });
    await act(async () => {
      getByTestId(tree, "guidesChatSendButton").props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("says to wait when the server rate limits", async () => {
    mockAskAI.mockRejectedValueOnce(new ApiError(429, "rate limit exceeded"));
    const tree = renderScreen();

    await ask(tree, "How do I treat a burn?");

    expect(textOf(tree)).toMatch(/wait a minute/i);
    expect(textOf(tree)).not.toContain("work offline");
  });

  it("says the question was refused when the server refuses it", async () => {
    mockAskAI.mockRejectedValueOnce(new ApiError(400, "ask ai: invalid input"));
    const tree = renderScreen();

    await ask(tree, "How do I treat a burn?");

    expect(textOf(tree)).toMatch(/fewer words/i);
  });

  it("keeps the offline message when the network is the problem", async () => {
    mockAskAI.mockRejectedValueOnce(new Error("Network request failed"));
    const tree = renderScreen();

    await ask(tree, "How do I treat a burn?");

    expect(textOf(tree)).toContain("work offline");
  });

  it("caps the question box at the length the API accepts", () => {
    const tree = renderScreen();
    // Asserted against the number too: before the constant existed, both sides
    // of the comparison were undefined and this passed while nothing was capped.
    expect(MAX_QUESTION_CHARACTERS).toBe(1000);
    expect(getByTestId(tree, "guidesChatInput").props.maxLength).toBe(MAX_QUESTION_CHARACTERS);
  });
});
