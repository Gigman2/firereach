import fs from "fs";
import path from "path";

const SCREEN = path.resolve(__dirname, "../../screens/guides/GuidesChatScreen.tsx");
const source = fs.readFileSync(SCREEN, "utf8");

describe("GuidesChatScreen", () => {
  it("ships no fabricated AI answers", () => {
    expect(source).not.toContain("MOCK_RESPONSES");
    expect(source).not.toContain("getResponse");
  });

  it("recommends no medication", () => {
    // The deleted mock advised ibuprofen and paracetamol by name. Nothing in
    // this build may name a drug — the system prompt forbids Claude from it,
    // and hardcoded text must be held to the same rule.
    expect(source).not.toMatch(/ibuprofen|paracetamol|acetaminophen|aspirin/i);
  });

  it("calls the real endpoint", () => {
    expect(source).toContain("askAI");
  });

  it("carries the mandated disclaimer verbatim", () => {
    expect(source).toContain(
      "This is general guidance only. In an active emergency, call your nearest fire station immediately."
    );
  });

  it("labels responses as AI-generated", () => {
    expect(source).toContain("AI-generated · Not medical advice");
  });
});

describe("app-wide", () => {
  it("names no medication anywhere in the guides screens", () => {
    const dir = path.resolve(__dirname, "../../screens/guides");
    for (const file of fs.readdirSync(dir)) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      expect(text).not.toMatch(/ibuprofen|paracetamol|acetaminophen|aspirin/i);
    }
  });
});
