import { haversineMeters, nearestStations } from "../geo";

describe("haversineMeters", () => {
  it("is zero at the same point", () => {
    expect(haversineMeters(5.6, -0.19, 5.6, -0.19)).toBe(0);
  });

  it("matches the Go suite: 0.01 deg of longitude at 5.6N is about 1108 m", () => {
    const d = haversineMeters(5.6, -0.19, 5.6, -0.18);
    expect(d).toBeGreaterThan(1050);
    expect(d).toBeLessThan(1160);
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
});
