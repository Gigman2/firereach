import { dialOrder, NATIONAL_EMERGENCY_PHONE, CachedStation } from "../stationTypes";

const station = (contacts: CachedStation["contacts"]): CachedStation => ({
  id: "s1",
  name: "Test Station",
  region: "Greater Accra Region",
  district: "Accra Metropolitan District",
  lat: 5.55,
  lng: -0.2,
  contacts,
});

describe("dialOrder", () => {
  it("puts the highest response rate first", () => {
    const got = dialOrder(
      station([
        { phone: "0299346018", responseRate: 0.5, active: true },
        { phone: "0302666576", responseRate: 1.0, active: true },
      ])
    );
    expect(got[0]).toBe("0302666576");
  });

  it("skips inactive contacts", () => {
    const got = dialOrder(
      station([{ phone: "0302666576", responseRate: 1.0, active: false }])
    );
    expect(got).not.toContain("0302666576");
  });

  it("always ends with the national number", () => {
    const got = dialOrder(
      station([{ phone: "0302666576", responseRate: 1.0, active: true }])
    );
    expect(got[got.length - 1]).toBe(NATIONAL_EMERGENCY_PHONE);
  });

  it("never duplicates the national number", () => {
    const got = dialOrder(
      station([
        { phone: "192", responseRate: 0.1, active: true },
        { phone: "0302666576", responseRate: 1.0, active: true },
      ])
    );
    expect(got.filter((p) => p === NATIONAL_EMERGENCY_PHONE)).toHaveLength(1);
  });

  it("returns just the national number when nothing is active", () => {
    expect(dialOrder(station([]))).toEqual([NATIONAL_EMERGENCY_PHONE]);
  });

  it("breaks rate ties deterministically", () => {
    const a = dialOrder(
      station([
        { phone: "0999999999", responseRate: 0.5, active: true },
        { phone: "0111111111", responseRate: 0.5, active: true },
      ])
    );
    expect(a[0]).toBe("0111111111");
  });
});
