import fs from "fs";
import path from "path";

const SCREEN = path.resolve(__dirname, "../../screens/guides/GuideDetailScreen.tsx");
const source = fs.readFileSync(SCREEN, "utf8");

describe("GuideDetailScreen", () => {
  it("no longer hardcodes a burns protocol", () => {
    expect(source).not.toContain("Remove from heat");
    expect(source).not.toContain("Cool with water");
    expect(source).not.toMatch(/const GUIDE\s*=/);
  });

  it("no longer hardcodes a review date", () => {
    expect(source).not.toMatch(/Last reviewed: \w+ \d{4}/);
  });

  it("derives the badge from content", () => {
    expect(source).toContain("badgeText");
  });

  it("looks the item up by the navigated slug", () => {
    expect(source).toContain("itemBySlug");
    expect(source).toMatch(/route\.params/);
  });

  it("shows the first-aid disclaimer with the mandated wording", () => {
    expect(source).toContain(
      "General first aid guidance. Not a substitute for professional medical care."
    );
  });
});
