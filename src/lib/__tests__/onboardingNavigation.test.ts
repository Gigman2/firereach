import fs from "fs";
import path from "path";

/**
 * Onboarding is a linear flow, and `replace` quietly makes it a one-way one.
 *
 * Every forward step used to replace, so nothing had a back stack: the denied
 * screen's own arrow landed two steps back on How-it-works, leaving a user who
 * refused permission by accident with no route to the Allow button; and the
 * save-a-place step had no back affordance and nothing behind it if it had.
 * Nothing failed, nothing typechecked wrong, and only walking the flow on a
 * device shows it — which is exactly why it survived to a real handset.
 *
 * A second, separate defect in the same flow: leaving onboarding by the intro
 * cross or the how-it-works Skip jumped to the app without recording that
 * onboarding had happened, so it replayed on every launch. Only one of the
 * three exits persisted the flag.
 *
 * These scan source text, because Jest here is scoped to `src/lib` and there
 * are no component tests.
 */

const ONBOARDING = path.join(__dirname, "..", "..", "screens", "onboarding");

const files = fs
  .readdirSync(ONBOARDING)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => ({ name: f, src: fs.readFileSync(path.join(ONBOARDING, f), "utf8") }));

/** Leaving onboarding entirely. Replacing is right here — there is no back. */
const EXIT_ROUTE = "MainTabs";

/** The splash is not a step; replacing it is deliberate so it cannot return. */
const NOT_A_STEP = "SplashScreen.tsx";

/** The first step has nothing behind it. */
const FIRST_STEP = "OnboardingIntroScreen.tsx";

describe("onboarding navigation", () => {
  it("finds the onboarding screens", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it("never replaces its way to another onboarding step", () => {
    // replace() drops the current screen from the stack, so the next screen's
    // back arrow skips it. Forward steps must push.
    const offenders: string[] = [];
    for (const { name, src } of files) {
      if (name === NOT_A_STEP) continue;
      for (const m of src.matchAll(/navigation\.replace\(\s*['"](\w+)['"]/g)) {
        if (m[1] !== EXIT_ROUTE) offenders.push(`${name} → replace("${m[1]}")`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("gives every step after the first a way back", () => {
    const offenders = files
      .filter(({ name }) => name !== NOT_A_STEP && name !== FIRST_STEP)
      .filter(({ src }) => !src.includes("navigation.goBack()"))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it("records completion at every exit to the app", () => {
    // Three screens leave onboarding. All three must persist the flag, or the
    // flow replays forever for anyone who skips.
    const offenders: string[] = [];
    for (const { name, src } of files) {
      if (!src.includes(`navigation.replace("${EXIT_ROUTE}")`) &&
          !src.includes(`navigation.replace('${EXIT_ROUTE}')`)) continue;
      // A live call, not the identifier appearing anywhere — checking for the
      // bare name passed with the call commented out, which is precisely the
      // regression this is for.
      const calls = src
        .split("\n")
        .filter((l) => {
          const t = l.trim();
          return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
        })
        .some((l) => /\bcompleteOnboarding\s*\(/.test(l));
      if (!calls) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the completion key in one place", () => {
    // It was written out as a literal in two files and read in a third.
    const offenders = files
      .filter(({ src }) => src.includes("@firereach_onboarding_complete"))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});
