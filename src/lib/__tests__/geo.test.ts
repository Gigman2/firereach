import {
  haversineMeters,
  nearestStations,
  bearingDegrees,
  compassPoint,
} from "../geo";

describe("haversineMeters", () => {
  it("is zero at the same point", () => {
    expect(haversineMeters(5.6, -0.19, 5.6, -0.19)).toBe(0);
  });

  it("matches the Go suite: 0.01 deg of longitude at 5.6N is about 1108 m", () => {
    const d = haversineMeters(5.6, -0.19, 5.6, -0.18);
    expect(d).toBeGreaterThan(1050);
    expect(d).toBeLessThan(1160);
  });

  it("matches the live API for a known pair: Airport to query point is 1971m", () => {
    // API reference: GET /v1/stations?lat=5.6&lng=-0.19 returns
    // Airport Fire Station at (5.6037167, -0.1725827) with distance_meters=1971.
    // This exact-value assertion catches a 0.1% radius error or a lat/lng swap.
    const d = haversineMeters(5.6, -0.19, 5.6037167, -0.1725827);
    expect(d).toBe(1971);
  });

  it("is symmetric", () => {
    const a = haversineMeters(5.55, -0.207, 6.69, -1.62);
    const b = haversineMeters(6.69, -1.62, 5.55, -0.207);
    expect(a).toBe(b);
  });

  it("handles the Greenwich meridian, which runs through Ghana", () => {
    // Tema sits at roughly 0 degrees longitude; a sign flip must not blow up.
    const d = haversineMeters(5.66, -0.01, 5.66, 0.01);
    expect(d).toBeGreaterThan(2000);
    expect(d).toBeLessThan(2400);
  });

  it("returns whole metres", () => {
    expect(Number.isInteger(haversineMeters(5.6, -0.19, 6.0, -1.0))).toBe(true);
  });
});

const STATIONS = [
  { id: "far", lat: 6.0, lng: -1.0 },
  { id: "near", lat: 5.6, lng: -0.2 },
  { id: "mid", lat: 5.7, lng: -0.5 },
];

describe("nearestStations", () => {
  it("returns nearest first", () => {
    const got = nearestStations(STATIONS, 5.6, -0.19, 3);
    expect(got.map((s) => s.id)).toEqual(["near", "mid", "far"]);
  });

  it("attaches distanceMeters ascending", () => {
    const got = nearestStations(STATIONS, 5.6, -0.19, 3);
    expect(got[0].distanceMeters).toBeLessThan(got[1].distanceMeters);
    expect(got[1].distanceMeters).toBeLessThan(got[2].distanceMeters);
  });

  it("honours the limit", () => {
    expect(nearestStations(STATIONS, 5.6, -0.19, 1)).toHaveLength(1);
  });

  it("returns everything when the limit exceeds the input", () => {
    expect(nearestStations(STATIONS, 5.6, -0.19, 99)).toHaveLength(3);
  });

  it("returns an empty array for an empty table rather than throwing", () => {
    expect(nearestStations([], 5.6, -0.19, 3)).toEqual([]);
  });

  it("does not mutate the caller's array", () => {
    const input = [...STATIONS];
    nearestStations(input, 5.6, -0.19, 3);
    expect(input.map((s) => s.id)).toEqual(["far", "near", "mid"]);
  });

  it("breaks ties deterministically regardless of input order", () => {
    const a = nearestStations(
      [{ id: "b", lat: 5.6, lng: -0.19 }, { id: "a", lat: 5.6, lng: -0.19 }],
      5.6,
      -0.19,
      2
    );
    const b = nearestStations(
      [{ id: "a", lat: 5.6, lng: -0.19 }, { id: "b", lat: 5.6, lng: -0.19 }],
      5.6,
      -0.19,
      2
    );
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
  });

  describe("agrees with the server to the metre", () => {
    // Expected distances and order captured from the Go API at
    // GET /v1/stations?lat=5.6&lng=-0.19&limit=5
    // Using real station coordinates from src/data/stations.bundled.json.
    // Exact values (toBe, not a range): a wrong earth radius or a swapped
    // lat/lng argument changes these numbers while leaving relative ordering
    // intact, and ordering-only assertions cannot see that.
    it("matches API distances exactly for the 5 nearest stations", () => {
      const stations = [
        {
          id: "0eb0ab4d-8a8f-5ca9-b348-f9e824eaaa6e",
          name: "Airport Fire Station",
          lat: 5.6037167,
          lng: -0.1725827,
        },
        {
          id: "d5599159-1077-549b-b632-60da77e0aa90",
          name: "Abelemkpe Fire Station",
          lat: 5.6090978,
          lng: -0.2111861,
        },
        {
          id: "8ed4d9a2-e0f3-58b5-b587-c82cf9fceb6f",
          name: "Ghana National Fire Service Headquarters",
          lat: 5.5696908,
          lng: -0.1849408,
        },
        {
          id: "8a4010c1-559e-5149-b12b-594c8b863beb",
          name: "Ghana Fire Service",
          lat: 5.5698415,
          lng: -0.2143746,
        },
        {
          id: "57533584-e092-5ed6-9f51-7b80c1eceb34",
          name: "University Fire Station Legon",
          lat: 5.6484568,
          lng: -0.1812207,
        },
      ];

      const queryLat = 5.6;
      const queryLng = -0.19;

      const got = nearestStations(stations, queryLat, queryLng, 5);

      // Assert exact order and distances from the API reference.
      expect(got).toHaveLength(5);
      expect(got[0].id).toBe("0eb0ab4d-8a8f-5ca9-b348-f9e824eaaa6e");
      expect(got[0].distanceMeters).toBe(1971);
      expect(got[1].id).toBe("d5599159-1077-549b-b632-60da77e0aa90");
      expect(got[1].distanceMeters).toBe(2553);
      expect(got[2].id).toBe("8ed4d9a2-e0f3-58b5-b587-c82cf9fceb6f");
      expect(got[2].distanceMeters).toBe(3416);
      expect(got[3].id).toBe("8a4010c1-559e-5149-b12b-594c8b863beb");
      expect(got[3].distanceMeters).toBe(4304);
      expect(got[4].id).toBe("57533584-e092-5ed6-9f51-7b80c1eceb34");
      expect(got[4].distanceMeters).toBe(5475);
    });
  });
});

describe("bearingDegrees", () => {
  it("reads 0 for due north", () => {
    expect(Math.round(bearingDegrees(5.6, -0.2, 6.6, -0.2))).toBe(0);
  });

  it("reads 180 for due south", () => {
    expect(Math.round(bearingDegrees(6.6, -0.2, 5.6, -0.2))).toBe(180);
  });

  it("reads about 90 for due east", () => {
    expect(Math.round(bearingDegrees(5.6, -0.2, 5.6, 0.8))).toBe(90);
  });

  it("reads about 270 for due west", () => {
    expect(Math.round(bearingDegrees(5.6, 0.8, 5.6, -0.2))).toBe(270);
  });

  it("always returns 0-360, never negative", () => {
    const b = bearingDegrees(5.6, 0.5, 5.5, -0.5);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });

  it("returns 0 for identical points rather than NaN", () => {
    expect(bearingDegrees(5.6, -0.2, 5.6, -0.2)).toBe(0);
  });
});

describe("compassPoint", () => {
  it("names the eight points at their centres", () => {
    expect(compassPoint(0)).toBe("north");
    expect(compassPoint(45)).toBe("north-east");
    expect(compassPoint(90)).toBe("east");
    expect(compassPoint(135)).toBe("south-east");
    expect(compassPoint(180)).toBe("south");
    expect(compassPoint(225)).toBe("south-west");
    expect(compassPoint(270)).toBe("west");
    expect(compassPoint(315)).toBe("north-west");
  });

  it("wraps past 337.5 back to north", () => {
    expect(compassPoint(338)).toBe("north");
    expect(compassPoint(359.9)).toBe("north");
    expect(compassPoint(360)).toBe("north");
  });

  it("splits on the 22.5 boundaries", () => {
    expect(compassPoint(22)).toBe("north");
    expect(compassPoint(23)).toBe("north-east");
  });

  it("spells words rather than abbreviations, because this is read aloud", () => {
    expect(compassPoint(45)).not.toBe("NE");
  });
});
