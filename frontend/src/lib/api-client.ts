const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000"
).replace(/\/+$/, "");

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.detail ?? `API request failed (${response.status})`, response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
