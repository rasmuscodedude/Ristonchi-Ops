import { isPlatformRole, type StaffProfile } from "@ristonchi/shared";
import { HttpError } from "../errors";
import type { AuthAdapter, AuthSession } from "./types";

/**
 * Norberto staff login. The contract is documented in NORBERT.md.
 * The returned token is both the app session and the token sent to the MCP server.
 */
export class PlatformAuth implements AuthAdapter {
  constructor(private readonly baseUrl: string) {}

  async login(email: string, password: string): Promise<AuthSession> {
    const response = await fetch(new URL("/auth/staff/login", this.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401) {
      throw new HttpError(401, "Email or password is not recognised.");
    }
    if (!response.ok) {
      throw new HttpError(502, "Norberto login is unavailable.");
    }
    const body = (await response.json()) as { token?: unknown; staff?: unknown };
    return this.sessionFrom(body.token, body.staff);
  }

  async authenticate(token: string): Promise<AuthSession | null> {
    const response = await fetch(new URL("/auth/staff/me", this.baseUrl), {
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new HttpError(502, "Norberto could not confirm this session.");
    const body = (await response.json()) as { staff?: unknown; token?: unknown };
    return this.sessionFrom(token, body.staff);
  }

  async logout(): Promise<void> {
    // The platform token is the session. Dropping it locally is enough until Norberto
    // documents a revoke endpoint.
  }

  private sessionFrom(token: unknown, staff: unknown): AuthSession {
    if (typeof token !== "string" || token.length === 0) {
      throw new HttpError(502, "Norberto login did not return a token.");
    }
    return { token, platformToken: token, staff: parseStaff(staff) };
  }
}

export function parseStaff(value: unknown): StaffProfile {
  if (!value || typeof value !== "object") {
    throw new HttpError(502, "Norberto login did not return a staff profile.");
  }
  const record = value as Record<string, unknown>;
  const flags = (record.flags ?? {}) as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.email !== "string" ||
    typeof record.name !== "string"
  ) {
    throw new HttpError(502, "Norberto staff profile is missing id, email, or name.");
  }
  if (!isPlatformRole(record.role)) {
    throw new HttpError(502, "Norberto staff profile has an unknown role.");
  }
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    role: record.role,
    flags: { sales: flags.sales === true },
  };
}
