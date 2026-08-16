/**
 * The guide footer's call button used to dial the national number as a
 * literal, behind copy reading "In an active emergency, call 192". Every
 * other call site in the app had already moved to `dialTargets(nearest)` —
 * this one had not, so a caller who had a resolved station everywhere else
 * got the single national line here, and only here.
 *
 * (Written without the "tel:"-plus-digits spelling on purpose:
 * noHardcodedNumbers.test.ts scans this directory's source text too, and
 * cannot tell a prose mention of the old bug from a live dial site.)
 *
 * Source-text assertions (guideDetailContent.test.ts) can prove the screen
 * *imports* the chain. Only rendering proves it puts the right number on the
 * button, so these mount the screen against a fake resolution and read the
 * text back.
 *
 * React.createElement rather than JSX, so the file stays a plain .test.ts and
 * is picked up by the existing `testMatch` — the same reason
 * guidesChatLoadingAndDisclaimer.test.ts is written that way.
 */
import React from "react";
import { act, create } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NATIONAL_EMERGENCY_PHONE, type CachedStation } from "../stationTypes";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// The real hook needs its provider, a location permission and a GPS fix.
// What this file is testing is what the footer does with a resolution, not
// how one is obtained, so the resolution is supplied directly.
const mockNearest = jest.fn();
jest.mock("../../hooks/useNearestStation", () => ({
  useNearestStation: () => ({ nearest: mockNearest() }),
}));

// Bundled content only, resolved synchronously. The real hook seeds from the
// same bundled set and then swaps in the cached/OTA one from two promises
// that settle after these assertions have run — re-rendering into a torn-down
// Jest environment. What the OTA path loads is safetyContentOta.test.ts's
// subject, not this file's; the items reaching the screen are real either way.
jest.mock("../../hooks/useSafetyContent", () => ({
  useSafetyContent: () => require("../safetyContent").visibleItems(),
}));

import { GuideDetailScreen } from "../../screens/guides/GuideDetailScreen";

const FRAME = { x: 0, y: 0, width: 320, height: 640 };
const INSETS = { top: 0, left: 0, right: 0, bottom: 0 };

/** A station whose chain is a chargeable regional line, then 192. */
const STATION: CachedStation & { distanceMeters: number } = {
  id: "test-station",
  name: "Test Station",
  region: "Greater Accra",
  district: "Ayawaso",
  lat: 5.6,
  lng: -0.2,
  distanceMeters: 1200,
  contacts: [
    { phone: "0302666576", responseRate: 0.9, active: true },
    { phone: "0302772446", responseRate: 0.4, active: true },
    // Inactive: must never reach the button, however good its rate looks.
    { phone: "0300000000", responseRate: 1, active: false },
  ],
};

function collect(node: any, out: string[] = []): string[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collect(n, out));
    return out;
  }
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (node.children) collect(node.children, out);
  return out;
}

function renderDetail(guideId: string): string {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
  const route = { params: { guideId } } as any;

  let tree: ReturnType<typeof create>;
  act(() => {
    tree = create(
      React.createElement(
        SafeAreaProvider,
        { initialMetrics: { frame: FRAME, insets: INSETS } },
        React.createElement(GuideDetailScreen, { navigation, route })
      )
    );
  });
  // Concatenated without a separator: `Call {primary.phone}` renders as two
  // text children ("Call " and the digits), so a separator would break every
  // phrase check below.
  const text = collect(tree!.toJSON()).join("");
  act(() => tree.unmount());
  return text;
}

describe("GuideDetailScreen emergency footer", () => {
  afterEach(() => mockNearest.mockReset());

  it("calls the resolved station's line, not the national number", () => {
    mockNearest.mockReturnValue(STATION);
    const text = renderDetail("hazard-cooking");

    // Highest response rate among the active contacts leads, which is the
    // order dialTargets defines and the home screen already dials.
    expect(text).toContain("Call 0302666576");
    expect(text).not.toContain("Call 192");
  });

  it("still offers 192 beside it, because that is the number that needs no credit", () => {
    mockNearest.mockReturnValue(STATION);
    const text = renderDetail("hazard-cooking");

    // The whole risk of leading with a chargeable line: a caller with no
    // airtime taps it and nothing happens. 192 has to stay on screen.
    expect(text).toContain(NATIONAL_EMERGENCY_PHONE);
    expect(text).toContain("Free");
  });

  it("falls back to the national number when nothing resolved", () => {
    mockNearest.mockReturnValue(null);
    const text = renderDetail("hazard-cooking");

    expect(text).toContain(`Call ${NATIONAL_EMERGENCY_PHONE}`);
    expect(text).toContain("Free on any network");
  });

  it("never leaves the call button dead", () => {
    for (const nearest of [STATION, null]) {
      mockNearest.mockReturnValue(nearest);
      expect(renderDetail("hazard-cooking")).toMatch(/Call \d+/);
    }
  });
});

describe("GuideDetailScreen header", () => {
  afterEach(() => mockNearest.mockReset());

  it("names the category and subcategory in full, without truncating the title", () => {
    mockNearest.mockReturnValue(null);
    const text = renderDetail("hazard-electrical");

    expect(text).toContain("HAZARD · ELECTRICAL");
    // The title used to share one row with a back button and a badge, and
    // rendered as "Electrical Fire S..". It gets its own two lines now.
    expect(text).toContain("Electrical Fire Safety");
  });

  it("labels first aid as first aid", () => {
    mockNearest.mockReturnValue(null);
    const text = renderDetail("firstaid-burns");

    expect(text).toContain("FIRST AID · BURNS");
  });
});

describe("GuideDetailScreen body", () => {
  afterEach(() => mockNearest.mockReset());

  it("renders bullets as glyphs, never as the source's literal dash", () => {
    mockNearest.mockReturnValue(null);
    const text = renderDetail("hazard-home");

    expect(text).toContain("•");
    expect(text).not.toContain("- Fit an alarm");
    expect(text).toContain("Fit an alarm in every bedroom");
  });

  it("sets section headings apart, uppercased and without their colon", () => {
    mockNearest.mockReturnValue(null);
    const text = renderDetail("hazard-home");

    expect(text).toContain("REDUCE THE RISK");
    expect(text).not.toContain("Reduce the risk:");
  });

  it("opens the flame guide and marks both of its response sections", () => {
    mockNearest.mockReturnValue(null);
    const text = renderDetail("hazard-flames");

    expect(text).toContain("HAZARD · FLAMES");
    // The distinction the guide exists to hold: blue is clean combustion on
    // an appliance, while blue-white arcing at a fire means electricity.
    expect(text).toContain("BLUE MEANS IT IS BURNING CLEANLY");
    expect(text).toContain("IF THE FLAME HAS CHANGED");
    expect(text).toContain("IF YOU ARE CHOOSING HOW TO PUT A FIRE OUT");
  });

  it("shows the first-aid lead that the screen used to drop", () => {
    // GuideDetailScreen branched `isFirstAid ? steps : body`, so all four
    // first-aid guides carried a body paragraph that was parsed, validated,
    // cached, reviewed — and then never rendered.
    mockNearest.mockReturnValue(null);
    const text = renderDetail("firstaid-burns");

    expect(text).toContain("This is first aid only");
    // ...and the steps and disclaimer are still there.
    expect(text).toContain("General first aid guidance");
    expect(text).toContain("Cool the burn");
  });
});
