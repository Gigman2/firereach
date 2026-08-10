import { API_BASE_URL, API_TIMEOUT_MS } from "./apiConfig";

/** A non-2xx response. Network and timeout failures surface as plain Errors. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Built by hand rather than with URL/URLSearchParams: React Native's URL
 * polyfill is incomplete and searchParams is unreliable on Hermes.
 */
function buildUrl(
  path: string,
  params?: Record<string, string | number>
): string {
  const base = API_BASE_URL.replace(/\/+$/, "");
  if (!params) return `${base}${path}`;

  const query = Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    )
    .join("&");

  return query ? `${base}${path}?${query}` : `${base}${path}`;
}

/**
 * The server's own explanation of a failure, when it gave one.
 *
 * Every non-2xx from this API carries `{"error": "..."}`. A caller that only
 * ever saw "failed with status 400" would have to guess which of the required
 * fields it got wrong, and so would anyone reading the logs.
 */
async function failureMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" && body.error ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number>
): Promise<T> {
  // AbortController rather than AbortSignal.timeout, which Hermes does not
  // reliably implement.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(buildUrl(path, params), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ApiError(
        response.status,
        `GET ${path} failed with status ${response.status}`
      );
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bounded by the same `API_TIMEOUT_MS` as `apiGet`, for the same reason: on
 * this network a request that is going to fail should fail while the user is
 * still looking at the screen that sent it.
 *
 * `headers` exists for `X-Device-Hash`, which the submissions endpoint keys
 * its rate limiting on — per-device rather than per-IP, so everyone sharing a
 * carrier NAT does not share one budget.
 */
export async function apiPost<T>(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(buildUrl(path), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ApiError(
        response.status,
        await failureMessage(
          response,
          `POST ${path} failed with status ${response.status}`,
        ),
      );
    }

    // Tolerates an empty body. This endpoint answers 201 with a message, but a
    // caller that ignores the response should not be broken by a 204 later.
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(timer);
  }
}
