import { apiPost } from "./apiClient";
import { getDeviceHash } from "./deviceHash";

/**
 * What a report is about. Sent verbatim as the API's `type`, which is free
 * text on the wire and in the database — these strings ARE the contract, so
 * renaming one silently changes what admins see in the review queue.
 */
export type SubmissionType =
  | "wrong_phone"
  | "wrong_location"
  | "missing"
  | "closed";

/** What the report screen has collected, before it becomes a submission. */
export type ReportDraft = {
  phone: string;
  latitude: string;
  longitude: string;
  note: string;
};

/**
 * Which of the draft's fields a given report type actually uses.
 *
 * Drives both what the screen shows and what it validates, from one place —
 * the screen used to render every field for every type, so "Station closed"
 * asked for a corrected phone number and corrected coordinates, neither of
 * which means anything for a station that has shut down.
 */
export function fieldsFor(type: SubmissionType): {
  phone: boolean;
  coords: boolean;
  /** True when the free-text note carries the correction itself. */
  noteRequired: boolean;
} {
  switch (type) {
    case "wrong_phone":
      return { phone: true, coords: false, noteRequired: false };
    case "wrong_location":
      return { phone: false, coords: true, noteRequired: false };
    case "missing":
    case "closed":
      // Nothing to correct to a value — the report IS the description. The
      // API requires a non-empty `suggested_value` regardless, so the note
      // stops being optional here and becomes the submission itself.
      return { phone: false, coords: false, noteRequired: true };
  }
}

/**
 * Caps for what the report form collects. The API refuses a suggested value or
 * a note over 1,000 characters, and for "missing" and "closed" reports the note
 * IS the suggested value, so one limit covers both.
 */
export const MAX_NOTE_CHARACTERS = 1000;

/** Room for "+233 (0)30 266 6576". The format itself stays unchecked. */
export const MAX_PHONE_CHARACTERS = 24;

/** Room for "-0.123456789" and then some. */
export const MAX_COORDINATE_CHARACTERS = 16;

const COORD_PATTERN = /^-?\d+(\.\d+)?$/;

function coordinate(raw: string, limit: number): number | null {
  const trimmed = raw.trim();
  // Tested before Number(), which happily accepts "", "0x1f", "1e5" and
  // " 12 " — none of which anyone typed into a latitude field on purpose.
  if (!COORD_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

/**
 * The single string the API stores as `suggested_value`, or `null` when the
 * draft does not yet say enough to be worth sending.
 *
 * `null` is what disables Submit. The endpoint rejects an empty
 * `suggested_value` with a 400, so without this the screen's only feedback for
 * an incomplete report would be a server error after a round trip — on a
 * network where that round trip may take the full eight seconds and then fail
 * for an unrelated reason.
 */
export function suggestedValueFor(
  type: SubmissionType,
  draft: ReportDraft,
): string | null {
  const fields = fieldsFor(type);

  if (fields.phone) {
    // Not validated as a Ghanaian number: the whole point of the report is
    // that the number on file is wrong, and a format guess strict enough to
    // be useful would reject the corrections most worth having.
    const phone = draft.phone.trim();
    return phone.length > 0 ? phone : null;
  }

  if (fields.coords) {
    const lat = coordinate(draft.latitude, 90);
    const lng = coordinate(draft.longitude, 180);
    if (lat === null || lng === null) return null;
    return `${lat},${lng}`;
  }

  const note = draft.note.trim();
  return note.length > 0 ? note : null;
}

/** Wire shape. Snake_case, mirroring `dto.CreateSubmissionRequest`. */
type CreateSubmissionRequest = {
  station_id: string | null;
  type: SubmissionType;
  suggested_value: string;
  note: string;
  device_hash: string;
};

/**
 * Posts one correction to the pending review queue.
 *
 * Throws `ApiError` on a non-2xx (429 when rate limited, 400 when the server
 * disagrees about the payload) and a plain Error on timeout or no network. The
 * caller is expected to keep the user's typing on screen either way — a report
 * is several fields of effort, and losing it to a dropped connection is how
 * someone decides not to bother a second time.
 */
export async function submitStationReport(input: {
  stationId: string | null;
  type: SubmissionType;
  suggestedValue: string;
  note: string;
}): Promise<void> {
  const deviceHash = await getDeviceHash();

  const body: CreateSubmissionRequest = {
    station_id: input.stationId,
    type: input.type,
    suggested_value: input.suggestedValue,
    note: input.note.trim(),
    device_hash: deviceHash,
  };

  // "/v1/..." like `fetchAllStations` — the version prefix is part of the
  // path, not of API_BASE_URL, which points at the host root.
  await apiPost<{ message: string }>("/v1/submissions", body, {
    "X-Device-Hash": deviceHash,
  });
}
