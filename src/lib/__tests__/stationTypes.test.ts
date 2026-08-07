import {
  dialTargets,
  NATIONAL_EMERGENCY_PHONE,
  CachedStation,
} from "../stationTypes";

const station = (contacts: CachedStation["contacts"]): CachedStation => ({
  id: "s1",
  name: "Test Station",
  region: "Greater Accra Region",
  district: "Accra Metropolitan District",
  lat: 5.55,
  lng: -0.2,
  contacts,
});

const HOTLINES: CachedStation["contacts"] = [
  { phone: "0299346018", responseRate: 0.5, active: true },
  { phone: "0302666576", responseRate: 1.0, active: true },
  { phone: "192", responseRate: 0.1, active: true },
];

describe("dialTargets", () => {
  it("always puts the national number first", () => {
    expect(dialTargets(station(HOTLINES))[0].phone).toBe(
      NATIONAL_EMERGENCY_PHONE
    );
  });

  it("marks only the national number toll-free", () => {
    const got = dialTargets(station(HOTLINES));
    expect(got[0].tollFree).toBe(true);
    expect(got.slice(1).every((t) => t.tollFree === false)).toBe(true);
  });

  it("orders hotlines by response rate after the national number", () => {
    const got = dialTargets(station(HOTLINES));
    expect(got.map((t) => t.phone)).toEqual([
      "192",
      "0302666576",
      "0299346018",
    ]);
  });

  it("never duplicates the national number when it is also a contact", () => {
    const got = dialTargets(station(HOTLINES));
    expect(got.filter((t) => t.phone === NATIONAL_EMERGENCY_PHONE)).toHaveLength(
      1
    );
  });

  it("skips inactive contacts", () => {
    const got = dialTargets(
      station([{ phone: "0302666576", responseRate: 1.0, active: false }])
    );
    expect(got.map((t) => t.phone)).not.toContain("0302666576");
  });

  it("returns just the national number when nothing is active", () => {
    expect(dialTargets(station([]))).toEqual([
      { phone: NATIONAL_EMERGENCY_PHONE, tollFree: true },
    ]);
  });

  it("is never empty, so a caller always has a number", () => {
    expect(dialTargets(station([])).length).toBeGreaterThan(0);
  });

  it("breaks response-rate ties deterministically", () => {
    const a = dialTargets(
      station([
        { phone: "0999999999", responseRate: 0.5, active: true },
        { phone: "0111111111", responseRate: 0.5, active: true },
      ])
    );
    const b = dialTargets(
      station([
        { phone: "0111111111", responseRate: 0.5, active: true },
        { phone: "0999999999", responseRate: 0.5, active: true },
      ])
    );
    expect(a.map((t) => t.phone)).toEqual(b.map((t) => t.phone));
    expect(a[1].phone).toBe("0111111111");
  });
});
