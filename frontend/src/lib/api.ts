const BASE_URL = (import.meta.env.PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

export type Track = {
  uri: string;
  name: string;
  artists: string[];
  image_url: string | null;
  spotify_url: string | null;
};

export type Addition = {
  id: number;
  track_uri: string;
  track_name: string | null;
  artists: string[] | null;
  image_url: string | null;
  spotify_url: string | null;
  username: string;
  added_at: string;
};

export class ApiError extends Error {
  status: number;
  retryAfter?: number;

  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "Could not reach the API.");
  }

  if (!response.ok) {
    let message = response.statusText || "Request failed";
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") message = body.detail;
    } catch {
      // response was not JSON
    }
    const retry = Number(response.headers.get("Retry-After"));
    throw new ApiError(
      response.status,
      message,
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function searchTracks(query: string, signal: AbortSignal): Promise<Track[]> {
  const params = new URLSearchParams({ q: query, limit: "10" });
  return request<Track[]>(`/search?${params.toString()}`, { signal });
}

export function listAdditions(offset = 0, limit = 50): Promise<Addition[]> {
  const params = new URLSearchParams({ skip: String(offset), limit: String(limit) });
  return request<Addition[]>(`/additions?${params.toString()}`);
}

export function getStats(): Promise<{ count: number }> {
  return request<{ count: number }>("/additions/stats");
}

export function createAddition(trackUri: string, username: string): Promise<Addition> {
  return request<Addition>("/additions", {
    method: "POST",
    body: JSON.stringify({ track_uri: trackUri, username }),
  });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 0:
        return "Could not reach the API. Is the backend running?";
      case 403:
        return "Spotify refused the write. The app must be authorized by the playlist owner.";
      case 404:
        return "Spotify could not find that track.";
      case 409:
        return "That track is already in the playlist.";
      case 422:
        return "Check the track and your name, then try again.";
      case 429:
      case 503:
        return error.retryAfter
          ? `Spotify is busy. Try again in ${error.retryAfter}s.`
          : "Spotify is busy. Try again shortly.";
      default:
        return `Something went wrong (${error.status}). Try again.`;
    }
  }
  return "Something went wrong. Try again.";
}
