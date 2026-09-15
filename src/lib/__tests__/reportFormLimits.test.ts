/**
 * The report form collects free text with no cap, so a pasted note only failed
 * at the server, after the round trip. The API caps a note and a suggested
 * value at 1,000 characters (api/internal/usecase/submission/create.go), and
 * for "missing" and "closed" reports the note IS the suggested value.
 */
import fs from "fs";
import path from "path";
import {
  MAX_COORDINATE_CHARACTERS,
  MAX_NOTE_CHARACTERS,
  MAX_PHONE_CHARACTERS,
} from "../submissionsApi";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const SCREEN = path.resolve(__dirname, "../../screens/stations/ReportStationScreen.tsx");
const source = fs.readFileSync(SCREEN, "utf8");

describe("the report form caps what it collects", () => {
  it("matches the API's own note limit", () => {
    expect(MAX_NOTE_CHARACTERS).toBe(1000);
    expect(MAX_PHONE_CHARACTERS).toBeGreaterThan(0);
    expect(MAX_COORDINATE_CHARACTERS).toBeGreaterThan(0);
  });

  it("caps the note", () => {
    expect(source).toContain("maxLength={MAX_NOTE_CHARACTERS}");
  });

  it("caps the phone number", () => {
    expect(source).toContain("maxLength={MAX_PHONE_CHARACTERS}");
  });

  it("caps both coordinates", () => {
    expect(source.match(/maxLength=\{MAX_COORDINATE_CHARACTERS\}/g)).toHaveLength(2);
  });

  it("takes every cap from the one place that defines them", () => {
    expect(source).not.toMatch(/maxLength=\{\d/);
  });
});
