import { formatDistance } from "../format";

describe("formatDistance", () => {
  it("says 'less than 100 m' rather than a bare zero when you are at the station", () => {
    expect(formatDistance(0)).toBe("Less than 100 m away");
  });

  it("uses metres below a kilometre", () => {
    expect(formatDistance(826)).toBe("~826 m away");
  });

  it("rounds metres to whole numbers", () => {
    expect(formatDistance(826.7)).toBe("~827 m away");
  });

  it("uses kilometres to one decimal at and above a kilometre", () => {
    expect(formatDistance(2415)).toBe("~2.4 km away");
  });

  it("switches unit exactly at 1000 m", () => {
    expect(formatDistance(999)).toBe("~999 m away");
    expect(formatDistance(1000)).toBe("~1.0 km away");
  });

  it("returns null for a negative distance rather than rendering nonsense", () => {
    expect(formatDistance(-1)).toBeNull();
  });

  it("returns null for NaN and Infinity", () => {
    expect(formatDistance(NaN)).toBeNull();
    expect(formatDistance(Infinity)).toBeNull();
  });

  it("switches unit exactly at the 100 m boundary", () => {
    expect(formatDistance(99)).toBe("Less than 100 m away");
    expect(formatDistance(100)).toBe("~100 m away");
  });

  describe("with { suffix: false }", () => {
    it("drops the trailing ' away' below 100 m", () => {
      expect(formatDistance(0, { suffix: false })).toBe("Less than 100 m");
      expect(formatDistance(99, { suffix: false })).toBe("Less than 100 m");
    });

    it("drops the trailing ' away' below a kilometre", () => {
      expect(formatDistance(826, { suffix: false })).toBe("~826 m");
    });

    it("drops the trailing ' away' at and above a kilometre", () => {
      expect(formatDistance(2415, { suffix: false })).toBe("~2.4 km");
    });

    it("still returns null for an unusable distance", () => {
      expect(formatDistance(-1, { suffix: false })).toBeNull();
      expect(formatDistance(NaN, { suffix: false })).toBeNull();
    });
  });
});
