const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Error thrown by apiFetch on a non-2xx response. Carries the HTTP status and
// the backend's message so callers (e.g. the login form) can show it.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    // Send/receive the httpOnly auth cookie cross-origin (:3000 → :3001).
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) {
        message = Array.isArray(body.message)
          ? body.message.join(", ")
          : body.message;
      }
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  // Handle empty bodies (e.g. 204 No Content from DELETE) without throwing.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}
