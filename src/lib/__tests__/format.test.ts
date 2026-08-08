import { formatDistance, formatCoords } from "../format";

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

describe("formatCoords", () => {
  // The Greenwich meridian runs through Ghana, so 47 of the 57 bundled
  // stations have a negative longitude and 10 have a positive one. Every
  // coordinate below is the raw full-precision value from
  // src/data/stations.bundled.json — which also exercises the rounding,
  // since the stored values carry seven decimals and we render four.
  it("renders a western-Ghana longitude as W, never as a minus sign", () => {
    // "Ghana Fire Service", Asunafo North Municipal District, Ahafo Region.
    // Four stations share that name, so the district is what identifies it.
    expect(formatCoords(6.808575, -2.5159709)).toBe("6.8086° N, 2.5160° W");
  });

  it("renders an eastern-Ghana longitude as E", () => {
    // Akatsi Fire Station, Volta Region.
    expect(formatCoords(6.1192567, 0.8080749)).toBe("6.1193° N, 0.8081° E");
  });

  it("puts a station sitting on the meridian in the eastern hemisphere", () => {
    // Tema Industrial Area Fire Station is at longitude 0.0001651 — close
    // enough to zero that a sign-based branch is worth pinning.
    expect(formatCoords(5.6656385, 0.0001651)).toBe("5.6656° N, 0.0002° E");
  });

  it("pads to four decimals so a column of coordinates lines up", () => {
    // Abelemkpe Fire Station, Greater Accra.
    expect(formatCoords(5.6090978, -0.2111861)).toBe("5.6091° N, 0.2112° W");
  });

  it("handles southern latitudes, which Ghana has none of but the type allows", () => {
    expect(formatCoords(-33.8688, 151.2093)).toBe("33.8688° S, 151.2093° E");
  });

  it("returns null rather than 'NaN° N' for a non-finite coordinate", () => {
    expect(formatCoords(NaN, -0.2073)).toBeNull();
    expect(formatCoords(5.5493, Infinity)).toBeNull();
  });

  it("returns null for a coordinate outside the possible range", () => {
    expect(formatCoords(91, 0)).toBeNull();
    expect(formatCoords(0, -181)).toBeNull();
  });
});
