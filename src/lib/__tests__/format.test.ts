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
});
