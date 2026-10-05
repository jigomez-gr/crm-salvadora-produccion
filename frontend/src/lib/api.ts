const BASE_URL =
  typeof window !== "undefined"
    ? ""
    : (process.env.INTERNAL_API_URL ||
       process.env.NEXT_PUBLIC_API_URL ||
       "http://127.0.0.1:3001");

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
  const isFormData =
    typeof FormData !== "undefined" && options?.body instanceof FormData;

  const headers: Record<string, string> = {};
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (options?.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      for (const [key, value] of options.headers) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, options.headers);
    }
  }

  if (isFormData) {
    delete headers["Content-Type"];
    delete headers["content-type"];
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    // Send/receive the httpOnly auth cookie cross-origin or same-origin.
    credentials: "include",
    ...options,
    headers,
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
