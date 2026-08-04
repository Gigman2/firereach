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
