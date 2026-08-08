import { whatToSay } from "../whatToSay";
import type { SavedPlace } from "../savedPlaces";
import type { RankedStation } from "../stationTypes";

const HOME: SavedPlace = {
  id: "h", label: "Home", lat: 5.6091, lng: -0.2112,
  note: "near the blue kiosk", radiusMeters: 300,
};

// Madina, from the bundled table.
const STATION: RankedStation = {
  id: "s", name: "Madina Fire Station", region: "Greater Accra Region",
  district: "La-Nkwantanang-Madina Municipal District",
  lat: 5.6837, lng: -0.1665, contacts: [], distanceMeters: 0,
};

describe("whatToSay", () => {
  it("uses a saved place when the caller is inside its radius", () => {
    const got = whatToSay({ lat: 5.6092, lng: -0.2113 }, [HOME], STATION);
    expect(got.kind).toBe("savedPlace");
    if (got.kind !== "savedPlace") return;
    expect(got.label).toBe("Home");
    expect(got.note).toBe("near the blue kiosk");
  });

  it("renders the user's note verbatim, never paraphrased", () => {
    const odd = { ...HOME, note: "3rd gate AFTER the mosque, blue roof" };
    const got = whatToSay({ lat: 5.6091, lng: -0.2112 }, [odd], STATION);
    expect(JSON.stringify(got)).toContain("3rd gate AFTER the mosque, blue roof");
  });

  it("does not claim a place the caller is outside the radius of", () => {
    // ~1.1 km east — well beyond 300 m.
    const got = whatToSay({ lat: 5.6091, lng: -0.2012 }, [HOME], STATION);
    expect(got.kind).toBe("derived");
  });

  it("honours each place's own radius", () => {
    const tight = { ...HOME, id: "t", radiusMeters: 100 };
    const loose = { ...HOME, id: "l", label: "Farm", radiusMeters: 2000 };
    const at = { lat: 5.6091, lng: -0.2012 }; // ~1.1 km from both
    expect(whatToSay(at, [tight], STATION).kind).toBe("derived");
    const got = whatToSay(at, [loose], STATION);
    expect(got.kind).toBe("savedPlace");
    if (got.kind === "savedPlace") expect(got.label).toBe("Farm");
  });

  it("picks the nearest when several places match", () => {
    const near = { ...HOME, id: "n", label: "Shop", lat: 5.60915, lng: -0.21125 };
    const far = { ...HOME, id: "f", label: "Home", lat: 5.6100, lng: -0.2120 };
    const got = whatToSay({ lat: 5.60915, lng: -0.21125 }, [far, near], STATION);
    expect(got.kind === "savedPlace" && got.label).toBe("Shop");
  });

  it("falls back to district, region and bearing from the station", () => {
    const got = whatToSay({ lat: 5.6091, lng: -0.2112 }, [], STATION);
    expect(got.kind).toBe("derived");
    if (got.kind !== "derived") return;
    const all = got.lines.join(" ");
    expect(all).toContain("La-Nkwantanang-Madina Municipal District");
    expect(all).toContain("Greater Accra Region");
    expect(all).toContain("Madina Fire Station");
    expect(all).toMatch(/south-west/);
    expect(got.coords).toBe("5.6091° N, 0.2112° W");
  });

  it("still gives district and coordinates when there is no station", () => {
    const got = whatToSay({ lat: 5.6091, lng: -0.2112 }, [], null);
    expect(got.kind).toBe("derived");
    if (got.kind !== "derived") return;
    expect(got.coords).toBe("5.6091° N, 0.2112° W");
    expect(got.lines.join(" ")).not.toContain("undefined");
  });

  it("breaks exact distance ties deterministically, not by array order", () => {
    // haversineMeters rounds to whole metres, so two places really can tie.
    const at = { lat: 5.6091, lng: -0.2112 };
    const a = { ...HOME, id: "zzz", label: "Zebra" };
    const b = { ...HOME, id: "aaa", label: "Apple" };
    const one = whatToSay(at, [a, b], STATION);
    const two = whatToSay(at, [b, a], STATION);
    expect(one.kind === "savedPlace" && one.label).toBe("Apple");
    expect(two.kind === "savedPlace" && two.label).toBe("Apple");
  });

  it("says nothing for a non-finite position", () => {
    // Some Android OEMs hand back a partial fix during a lock failure. The
    // contract is "none" — not a derived sentence built on NaN. Without this,
    // stripping the finite guard leaves every other test green, which is
    // exactly how the guard once got removed unnoticed.
    expect(whatToSay({ lat: NaN, lng: -0.2112 }, [], STATION).kind).toBe("none");
    expect(whatToSay({ lat: 5.6091, lng: Infinity }, [HOME], STATION).kind).toBe("none");
  });

  it("says nothing when there is no position", () => {
    expect(whatToSay(null, [HOME], STATION).kind).toBe("none");
  });

  it("says nothing when there is no position and no places either", () => {
    expect(whatToSay(null, [], null).kind).toBe("none");
  });
});
