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
  it("puts the regional command line first when the station has one", () => {
    expect(dialTargets(station(HOTLINES))[0].phone).toBe("0302666576");
  });

  it("keeps 192 in the chain as the last resort", () => {
    const got = dialTargets(station(HOTLINES));
    expect(got[got.length - 1].phone).toBe(NATIONAL_EMERGENCY_PHONE);
  });

  it("marks only the national number toll-free", () => {
    const got = dialTargets(station(HOTLINES));
    expect(got.filter((t) => t.tollFree).map((t) => t.phone)).toEqual([
      NATIONAL_EMERGENCY_PHONE,
    ]);
  });

  it("orders hotlines by response rate ahead of the national number", () => {
    const got = dialTargets(station(HOTLINES));
    expect(got.map((t) => t.phone)).toEqual([
      "0302666576",
      "0299346018",
      "192",
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

  it("falls back to the national number as primary when nothing is active", () => {
    // The only state where 192 leads again: there is no station number to
    // lead with. The call button must still work.
    expect(dialTargets(station([]))).toEqual([
      { phone: NATIONAL_EMERGENCY_PHONE, tollFree: true },
    ]);
  });

  it("is never empty, so a caller always has a number", () => {
    expect(dialTargets(station([])).length).toBeGreaterThan(0);
  });

  it("always offers the free number regardless of how many hotlines exist", () => {
    // 6 of the 57 bundled stations have exactly one hotline; 51 have two.
    const one = dialTargets(
      station([{ phone: "0302666576", responseRate: 1, active: true }])
    );
    expect(one.map((t) => t.phone)).toEqual(["0302666576", "192"]);
    expect(dialTargets(station(HOTLINES)).map((t) => t.phone)).toContain("192");
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
    expect(a[0].phone).toBe("0111111111");
  });
});

describe("dialTargets against the real bundled table", () => {
  // The doc comment on dialTargets makes claims about the shipped data. These
  // drive all 57 stations through the function so the claims cannot rot
  // silently when the table is regenerated from the API's seed SQL.
  const bundled: CachedStation[] = require("../../data/stations.bundled.json");

  it("covers the whole table", () => {
    expect(bundled.length).toBe(57);
  });

  it("always ends with 192, for every station", () => {
    for (const s of bundled) {
      const got = dialTargets(s);
      expect(got[got.length - 1].phone).toBe(NATIONAL_EMERGENCY_PHONE);
    }
  });

  it("leads with a chargeable line for every station, never 192", () => {
    for (const s of bundled) {
      const got = dialTargets(s);
      expect(got.length).toBeGreaterThanOrEqual(2);
      expect(got[0].tollFree).toBe(false);
    }
  });

  it("lists 192 exactly once per station", () => {
    for (const s of bundled) {
      const n = dialTargets(s).filter(
        (t) => t.phone === NATIONAL_EMERGENCY_PHONE
      ).length;
      expect(n).toBe(1);
    }
  });

  it("confirms these are regional lines, not per-station ones", () => {
    // The premise behind every string that describes what the caller is
    // dialling. If a future dataset gives stations their own direct lines,
    // this fails and the copy on four screens needs revisiting.
    const owners = new Map<string, Set<string>>();
    for (const s of bundled) {
      for (const t of dialTargets(s)) {
        if (t.tollFree) continue;
        if (!owners.has(t.phone)) owners.set(t.phone, new Set());
        owners.get(t.phone)!.add(s.id);
      }
    }
    expect(owners.size).toBe(18);
    const unique = [...owners.values()].filter((v) => v.size === 1);
    expect(unique).toHaveLength(0);
  });
});
