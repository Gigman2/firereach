import {
  whatToSay,
  DISTRICT_CLAIM_MAX_METERS,
  NEAR_STATION_MAX_METERS,
} from "../whatToSay";
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

  it("gives coordinates and nothing else when there is no station", () => {
    // Was named "still gives district and coordinates", which was never true:
    // the district is the *station's*, so with no station there is no line to
    // give. Nothing asserted it either, so the name was the only claim — and
    // it is exactly the claim this function must not make. Asserted properly
    // now, because "coordinates alone" is a state the card treats specially.
    const got = whatToSay({ lat: 5.6091, lng: -0.2112 }, [], null);
    expect(got.kind).toBe("derived");
    if (got.kind !== "derived") return;
    expect(got.coords).toBe("5.6091° N, 0.2112° W");
    expect(got.lines).toEqual([]);
  });

  describe("the district claim is bounded by distance", () => {
    // The district comes from the nearest station, not from the position.
    // Unbounded, a caller 196 km away was told to say they were in a district
    // they had never been to, and then, in the next line, that they were
    // 196 km from it.
    it("claims the district when the caller is plausibly inside it", () => {
      // ~9.4 km due south of Madina — inside the bound.
      const got = whatToSay({ lat: 5.599, lng: -0.1665 }, [], STATION);
      expect(got.kind).toBe("derived");
      if (got.kind !== "derived") return;
      expect(got.lines[0]).toBe(
        "I'm in La-Nkwantanang-Madina Municipal District, Greater Accra Region."
      );
    });

    it("drops the district beyond the bound, keeping bearing and coordinates", () => {
      // ~10.5 km — just the other side of DISTRICT_CLAIM_MAX_METERS.
      const got = whatToSay({ lat: 5.589, lng: -0.1665 }, [], STATION);
      expect(got.kind).toBe("derived");
      if (got.kind !== "derived") return;
      const all = got.lines.join(" ");
      expect(all).not.toContain("La-Nkwantanang-Madina Municipal District");
      expect(all).not.toContain("Greater Accra Region");
      expect(all).toContain("Madina Fire Station");
      expect(all).toMatch(/south/);
      expect(got.coords).toBe("5.5890° N, 0.1665° W");
    });

    it("says nothing about the district from Kumasi, 196 km away", () => {
      // The measured case from the review: two sentences that contradicted
      // each other, read aloud in sequence to an operator who cannot see you.
      const got = whatToSay({ lat: 6.6885, lng: -1.6244 }, [], STATION);
      expect(got.kind).toBe("derived");
      if (got.kind !== "derived") return;
      expect(got.lines.join(" ")).not.toContain("District");
      expect(got.lines.join(" ")).toContain("~196.1 km north-west");
    });

    it("bounds the claim at a distance, not at a station count", () => {
      // Pins the constant itself: a caller just inside gets the district, one
      // just outside does not, and the two positions differ only in distance.
      const inside = 0.9 * DISTRICT_CLAIM_MAX_METERS;
      const outside = 1.1 * DISTRICT_CLAIM_MAX_METERS;
      const at = (metres: number) => ({
        lat: STATION.lat - metres / 111_320,
        lng: STATION.lng,
      });
      const near = whatToSay(at(inside), [], STATION);
      const far = whatToSay(at(outside), [], STATION);
      expect(
        near.kind === "derived" && near.lines.some((l) => l.includes("District"))
      ).toBe(true);
      expect(
        far.kind === "derived" && far.lines.some((l) => l.includes("District"))
      ).toBe(false);
    });
  });

  describe("standing at a station", () => {
    it("says 'right by' rather than the 'Less than 100 m' fragment", () => {
      // ~33 m north. formatDistance returns the sentence fragment "Less than
      // 100 m" below 100 m, which the bearing template turned into "About
      // Less than 100 m north-west of Madina Fire Station."
      const got = whatToSay({ lat: 5.684, lng: -0.1665 }, [], STATION);
      expect(got.kind).toBe("derived");
      if (got.kind !== "derived") return;
      const all = got.lines.join(" ");
      expect(all).toContain("I'm right by Madina Fire Station.");
      expect(all).not.toContain("Less than 100 m");
      expect(all).not.toContain("About");
    });

    it("drops the bearing, which is noise at that range", () => {
      const got = whatToSay({ lat: 5.684, lng: -0.1665 }, [], STATION);
      if (got.kind !== "derived") throw new Error("expected derived");
      expect(got.lines.join(" ")).not.toMatch(
        /north|south|east|west/
      );
    });

    it("still gives the district and the coordinates", () => {
      // Both are true at arm's length from the station, and the coordinates
      // are the one line that is true at any distance at all.
      const got = whatToSay({ lat: 5.684, lng: -0.1665 }, [], STATION);
      if (got.kind !== "derived") throw new Error("expected derived");
      expect(got.lines[0]).toContain("La-Nkwantanang-Madina Municipal District");
      expect(got.coords).toBe("5.6840° N, 0.1665° W");
    });

    it("goes back to a bearing once past the near threshold", () => {
      const at = (metres: number) => ({
        lat: STATION.lat + metres / 111_320,
        lng: STATION.lng,
      });
      const inside = whatToSay(at(0.5 * NEAR_STATION_MAX_METERS), [], STATION);
      const outside = whatToSay(at(5 * NEAR_STATION_MAX_METERS), [], STATION);
      expect(
        inside.kind === "derived" && inside.lines.join(" ")
      ).toContain("right by");
      expect(
        outside.kind === "derived" && outside.lines.join(" ")
      ).toMatch(/^.*About ~\d+ m north of Madina Fire Station\.$/);
    });
  });

  it("never emits a bearing sentence with a missing direction", () => {
    // compassPoint returns "" rather than "undefined" for a non-finite
    // bearing. An empty direction must drop the whole sentence, not leave
    // "About ~5.0 km  of Madina Fire Station." with a hole in it.
    const got = whatToSay({ lat: 5.599, lng: -0.1665 }, [], STATION);
    if (got.kind !== "derived") throw new Error("expected derived");
    for (const line of got.lines) {
      expect(line).not.toMatch(/ {2}/);
      expect(line).not.toContain("undefined");
    }
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
