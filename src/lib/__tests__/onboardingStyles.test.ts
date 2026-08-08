import * as onboarding from "../../screens/onboarding/onboardingStyles";

/**
 * Extracting shared styles is only safe if it changes nothing on screen, and
 * "nothing changed" is exactly what a refactor cannot prove by typechecking.
 *
 * Every expected value below was read out of the six onboarding screens as
 * they stood before the extraction, so these are not a description of the new
 * file — they are the old screens, written down. If the shared file ever
 * drifts, this fails and names the value that moved.
 *
 * These are plain objects rather than a StyleSheet registry precisely so this
 * test can exist: Jest here is scoped to pure modules and cannot import a
 * screen (they pull in AsyncStorage's native module).
 */
describe("onboarding shared styles", () => {
  it("keeps the root and filler views at flex: 1", () => {
    // container in 5 screens, mainContent in 3, spacer in 3 — all identical.
    expect(onboarding.screen).toEqual({ flex: 1 });
    expect(onboarding.fill).toEqual({ flex: 1 });
  });

  it("matches the header used by HowItWorks, LocationRequest and Ready", () => {
    expect(onboarding.headerSplit).toEqual({
      flexDirection: "row",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 8,
      justifyContent: "space-between",
      alignItems: "center",
    });
  });

  it("matches the header used by LocationDenied and SavePlace", () => {
    expect(onboarding.header).toEqual({
      flexDirection: "row",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 8,
    });
  });

  it("matches the intro's skip row", () => {
    expect(onboarding.headerEnd).toEqual({
      flexDirection: "row",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 8,
      justifyContent: "flex-end",
    });
  });

  it("matches the actions block shared by three screens", () => {
    expect(onboarding.actions).toEqual({
      paddingHorizontal: 32,
      paddingTop: 32,
      gap: 16,
    });
  });

  it("matches LocationDenied's footer", () => {
    expect(onboarding.footer).toEqual({
      paddingHorizontal: 24,
      paddingBottom: 40,
      gap: 20,
    });
  });

  it("matches the dots row", () => {
    // The one value here that is deliberately no longer "what the screens did
    // before". The extraction left marginBottom: 32 composed locally on
    // HowItWorks, because only that screen had it; it has since been hoisted
    // so all five rows are identical, and the local override removed. Checked
    // that no screen still composes its own on top — a second 32 would be the
    // obvious way for this to go wrong.
    expect(onboarding.dotsRow).toEqual({
      alignItems: "center",
      paddingVertical: 32,
      marginBottom: 32,
    });
  });

  it("derives the icon circle radius from its size, at all three sizes used", () => {
    // 96 on LocationRequest and Ready, 192 on LocationDenied and the intro's
    // outer ring, 128 on the intro's inner disc. Hand-written radii are the
    // one thing here that was genuinely easy to get wrong.
    expect(onboarding.iconCircle(96)).toEqual({
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: "center",
      justifyContent: "center",
    });
    expect(onboarding.iconCircle(192).borderRadius).toBe(96);
    expect(onboarding.iconCircle(128).borderRadius).toBe(64);
  });

  it("returns a fresh object each call, so a screen cannot mutate a shared one", () => {
    const a = onboarding.iconCircle(96);
    const b = onboarding.iconCircle(96);
    expect(a).not.toBe(b);
  });

  it("does not let the two header variants share a mutable base", () => {
    // headerSplit and headerEnd are spreads of one base. A shallow alias would
    // mean setting a property on one silently changed the other.
    expect(onboarding.headerSplit).not.toBe(onboarding.header);
    expect(onboarding.headerEnd).not.toBe(onboarding.header);
    expect(onboarding.header).not.toHaveProperty("justifyContent");
  });
});
