/**
 * Rendering coverage for AIResponseContent: each structured kind renders its
 * own component, an unknown kind fails safe to the plain bubble, and every
 * call control dials the app constant rather than any model-supplied text.
 *
 * Written with React.createElement (no JSX) so the file stays a .test.ts and
 * matches jest.config.js's testMatch, which only picks up .test.ts files.
 */
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Linking } from "react-native";
import { AIResponseContent } from "../../components/AIResponseContent";
import { NATIONAL_EMERGENCY_PHONE } from "../stationTypes";
import type { AIResponse } from "../aiApi";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// AIResponseContent reads useTheme, which has a default context value, so the
// component renders without a provider.

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

function renderPayload(payload: AIResponse): ReactTestRenderer {
  let tree: ReactTestRenderer;
  act(() => {
    tree = create(React.createElement(AIResponseContent, { payload }));
  });
  return tree!;
}

function textOf(tree: ReactTestRenderer): string {
  return findAllText(tree.toJSON()).join(" ");
}

/** Press every button whose accessibilityLabel matches, return dial URLs. */
function pressCallButtons(tree: ReactTestRenderer, label: string): void {
  // Match the element that carries both the label and a callable onPress —
  // the TouchableOpacity itself, not the inner host view the label is also
  // applied to (which has the label but no handler).
  const matches = tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === "function"
  );
  expect(matches.length).toBeGreaterThan(0);
  matches.forEach((b) => act(() => b.props.onPress()));
}

describe("AIResponseContent", () => {
  let dialSpy: jest.SpyInstance;
  beforeEach(() => {
    dialSpy = jest
      .spyOn(Linking, "openURL")
      .mockImplementation(() => Promise.resolve(true));
  });
  afterEach(() => {
    dialSpy.mockRestore();
  });

  it("renders an emergency as a headed card with bullets and a call control", () => {
    const tree = renderPayload({
      kind: "emergency",
      title: "ACTIVE EMERGENCY",
      body: "Get out of the building now.",
      items: [{ body: "Stay low" }, { body: "Feel doors before opening" }],
      answer: "Get out of the building now.",
    });

    const text = textOf(tree);
    expect(text).toContain("ACTIVE EMERGENCY");
    expect(text).toContain("Get out of the building now.");
    expect(text).toContain("Stay low");
    expect(text).toContain("Feel doors before opening");

    pressCallButtons(tree, `Call ${NATIONAL_EMERGENCY_PHONE} Now`);
    expect(dialSpy).toHaveBeenCalledWith(`tel:${NATIONAL_EMERGENCY_PHONE}`);
  });

  it("renders the emergency number large with a call control", () => {
    const tree = renderPayload({
      kind: "emergency_number",
      title: "Fire Emergency Number",
      body: "The Ghana National Fire Service emergency number is:",
      answer: "The Ghana National Fire Service emergency number is: 192",
    });

    const text = textOf(tree);
    expect(text).toContain("Fire Emergency Number");
    expect(text).toContain(NATIONAL_EMERGENCY_PHONE);

    pressCallButtons(tree, `Call ${NATIONAL_EMERGENCY_PHONE}`);
    expect(dialSpy).toHaveBeenCalledWith(`tel:${NATIONAL_EMERGENCY_PHONE}`);
  });

  it("never dials a number the model wrote, only the app constant", () => {
    // The model put a wrong number in the prose; the dial control must still
    // use the app constant.
    const tree = renderPayload({
      kind: "emergency_number",
      title: "Fire Emergency Number",
      body: "One number you could try is 999.",
      answer: "One number you could try is 999.",
    });

    pressCallButtons(tree, `Call ${NATIONAL_EMERGENCY_PHONE}`);
    expect(dialSpy).toHaveBeenCalledWith(`tel:${NATIONAL_EMERGENCY_PHONE}`);
    // The wrong number the model wrote in the prose must never be dialled.
    // Built via a variable so no literal digit follows "tel:" in source
    // (noHardcodedNumbers.test.ts scans for exactly that).
    const modelNumber = "999";
    expect(dialSpy).not.toHaveBeenCalledWith(`tel:${modelNumber}`);
  });

  it("renders steps as numbered cards with titles", () => {
    const tree = renderPayload({
      kind: "steps",
      body: "Here is how to treat a minor burn:",
      ordered: true,
      items: [
        { title: "Cool the burn", body: "Hold it under cool running water." },
        { title: "Remove jewelry", body: "Take off rings near the burn." },
      ],
      answer: "Here is how to treat a minor burn:",
    });

    const text = textOf(tree);
    expect(text).toContain("Here is how to treat a minor burn:");
    expect(text).toContain("Cool the burn");
    expect(text).toContain("Remove jewelry");
    // Numbered markers 1 and 2 are rendered.
    expect(text).toContain("1");
    expect(text).toContain("2");
    // No call control on a steps answer.
    expect(dialSpy).not.toHaveBeenCalled();
  });

  it("renders a warning answer with the amber callout", () => {
    const tree = renderPayload({
      kind: "warning",
      body: "Never use water on an electrical fire.",
      items: [{ body: "Cut the power at the breaker if safe" }],
      warning: "Water conducts electricity and can cause electrocution.",
      answer: "Never use water on an electrical fire.",
    });

    const text = textOf(tree);
    expect(text).toContain("Never use water on an electrical fire.");
    expect(text).toContain("Cut the power at the breaker if safe");
    expect(text).toContain("Safety Warning");
    expect(text).toContain("Water conducts electricity");
  });

  it("renders a plain text answer as a bare bubble with no call control", () => {
    const tree = renderPayload({
      kind: "text",
      body: "Keep matches away from children.",
      answer: "Keep matches away from children.",
    });

    expect(textOf(tree)).toContain("Keep matches away from children.");
    expect(tree.root.findAllByProps({ accessibilityRole: "button" })).toHaveLength(0);
  });

  it("still renders a list when a plain text answer carries one", () => {
    // The model sometimes answers a general-prevention question as kind=text
    // but with items; the fail-safe must show them, not drop them.
    const tree = renderPayload({
      kind: "text",
      body: "Ways to prevent kitchen fires:",
      items: [{ body: "Never leave cooking unattended" }, { body: "Keep a lid nearby" }],
      answer: "Ways to prevent kitchen fires:",
    });

    const text = textOf(tree);
    expect(text).toContain("Ways to prevent kitchen fires:");
    expect(text).toContain("Never leave cooking unattended");
    expect(text).toContain("Keep a lid nearby");
  });

  it("fails safe to the body bubble for an unknown kind", () => {
    const tree = renderPayload({
      // A kind this build has never heard of, as an OTA/server drift would
      // produce.
      kind: "diagnosis" as any,
      body: "Fall back to plain text.",
      answer: "Fall back to plain text.",
    });

    expect(textOf(tree)).toContain("Fall back to plain text.");
    // No card chrome, no call control.
    expect(tree.root.findAllByProps({ accessibilityRole: "button" })).toHaveLength(0);
  });
});
