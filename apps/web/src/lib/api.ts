import type { ChatEvent, HealthResponse } from "@ristonchi/shared";
import { pushSse } from "./sse";

function url(path: string): string {
  const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  token: string | null,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(url(path), { ...init, headers });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T);
  if (!response.ok) {
    throw new ApiError(response.status, (payload as { error?: string }).error || "Request failed.");
  }
  return payload;
}

export async function stream(
  path: string,
  token: string,
  body: unknown,
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  const response = await fetch(url(path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    const text = await response.text();
    let message = "Request failed.";
    try {
      message = (JSON.parse(text) as { error?: string }).error || message;
    } catch {
      message = text || message;
    }
    throw new ApiError(response.status, message);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const pushed = pushSse(buffer, decoder.decode(value, { stream: true }));
    buffer = pushed.rest;
    for (const frame of pushed.frames) onEvent(JSON.parse(frame.data) as ChatEvent);
  }
}

export function loadHealth(): Promise<HealthResponse> {
  return api<HealthResponse>("/api/health", null);
}
