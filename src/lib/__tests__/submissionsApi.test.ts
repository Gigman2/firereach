// These are pure functions, but they share a module with the submit call,
// which reaches AsyncStorage for the device hash.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import {
  fieldsFor,
  suggestedValueFor,
  type ReportDraft,
  type SubmissionType,
} from "../submissionsApi";

const draft = (over: Partial<ReportDraft> = {}): ReportDraft => ({
  phone: "",
  latitude: "",
  longitude: "",
  note: "",
  ...over,
});

const ALL_TYPES: SubmissionType[] = [
  "wrong_phone",
  "wrong_location",
  "missing",
  "closed",
];

describe("fieldsFor", () => {
  it("asks for a phone only when the phone is what is wrong", () => {
    expect(fieldsFor("wrong_phone").phone).toBe(true);
    expect(fieldsFor("wrong_location").phone).toBe(false);
    expect(fieldsFor("missing").phone).toBe(false);
    expect(fieldsFor("closed").phone).toBe(false);
  });

  it("asks for coordinates only when the location is what is wrong", () => {
    expect(fieldsFor("wrong_location").coords).toBe(true);
    expect(fieldsFor("wrong_phone").coords).toBe(false);
  });

  it("requires the note for the types that have no value to correct to", () => {
    expect(fieldsFor("missing").noteRequired).toBe(true);
    expect(fieldsFor("closed").noteRequired).toBe(true);
    expect(fieldsFor("wrong_phone").noteRequired).toBe(false);
  });
});

describe("suggestedValueFor", () => {
  it("returns null for an empty draft, whatever the type", () => {
    // The API rejects an empty suggested_value with a 400, so every type must
    // have something that can be missing.
    for (const type of ALL_TYPES) {
      expect(suggestedValueFor(type, draft())).toBeNull();
    }
  });

  it("uses the phone, trimmed", () => {
    expect(
      suggestedValueFor("wrong_phone", draft({ phone: "  0302666576 " })),
    ).toBe("0302666576");
  });

  it("does not reject an oddly formatted phone number", () => {
    // The report exists because the number on file is wrong; a format guess
    // strict enough to be useful would reject the best corrections.
    expect(
      suggestedValueFor("wrong_phone", draft({ phone: "030 266 6576 ext 4" })),
    ).toBe("030 266 6576 ext 4");
  });

  it("joins valid coordinates", () => {
    expect(
      suggestedValueFor(
        "wrong_location",
        draft({ latitude: "5.6091", longitude: "-0.2112" }),
      ),
    ).toBe("5.6091,-0.2112");
  });

  it("needs both coordinates, not one", () => {
    expect(
      suggestedValueFor("wrong_location", draft({ latitude: "5.6091" })),
    ).toBeNull();
    expect(
      suggestedValueFor("wrong_location", draft({ longitude: "-0.2112" })),
    ).toBeNull();
  });

  it("rejects coordinates outside the possible range", () => {
    expect(
      suggestedValueFor(
        "wrong_location",
        draft({ latitude: "91", longitude: "0" }),
      ),
    ).toBeNull();
    expect(
      suggestedValueFor(
        "wrong_location",
        draft({ latitude: "0", longitude: "181" }),
      ),
    ).toBeNull();
  });

  it("rejects things Number() would have accepted", () => {
    // "" is 0, "0x1f" is 31, and " 12 " is 12. None was typed on purpose.
    for (const latitude of ["", "0x1f", "1e2", "5.", "abc", "5,6"]) {
      expect(
        suggestedValueFor("wrong_location", draft({ latitude, longitude: "0" })),
      ).toBeNull();
    }
  });

  it("accepts a negative and a zero coordinate", () => {
    expect(
      suggestedValueFor(
        "wrong_location",
        draft({ latitude: "0", longitude: "-0.2112" }),
      ),
    ).toBe("0,-0.2112");
  });

  it("uses the note for the types that carry the report in it", () => {
    for (const type of ["missing", "closed"] as SubmissionType[]) {
      expect(
        suggestedValueFor(type, draft({ note: "  Burnt down in 2024  " })),
      ).toBe("Burnt down in 2024");
      expect(suggestedValueFor(type, draft({ note: "   " }))).toBeNull();
    }
  });

  it("ignores fields the type does not use", () => {
    // A phone typed under "wrong_phone", then switched to "closed", must not
    // be submitted as the description of a closure.
    expect(
      suggestedValueFor("closed", draft({ phone: "0302666576" })),
    ).toBeNull();
  });
});
