import type { StaffProfile } from "@ristonchi/shared";
import type { Store } from "../store/types";
import type { AuthAdapter, AuthSession } from "./types";
import { HttpError } from "../errors";

/** Fictional desk accounts for local development. Stefanie is the sales lead the product is built for. */
export const DEMO_STAFF: readonly StaffProfile[] = [
  {
    id: "staff_stefanie",
    email: "stefanie@ristonchi.com",
    name: "Stefanie",
    role: "manager",
    flags: { sales: true },
  },
  {
    id: "staff_coordinator",
    email: "coordinator@ristonchi.com",
    name: "Wedding desk",
    role: "event_coordinator",
    flags: {},
  },
  {
    id: "staff_admin",
    email: "admin@ristonchi.com",
    name: "Venue admin",
    role: "admin",
    flags: {},
  },
  {
    id: "staff_kitchen",
    email: "kitchen@ristonchi.com",
    name: "Kitchen",
    role: "chef",
    flags: {},
  },
];

export const DEFAULT_DEMO_PASSWORD = "ristonchi-demo";

function sameSecret(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export class MockAuth implements AuthAdapter {
  constructor(
    private readonly store: Store,
    private readonly password: string,
  ) {}

  async login(email: string, password: string): Promise<AuthSession> {
    const staff = DEMO_STAFF.find(
      (person) => person.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!staff || !sameSecret(password, this.password)) {
      throw new HttpError(401, "Email or password is not recognised.");
    }
    const token = crypto.randomUUID();
    const session: AuthSession = {
      token,
      platformToken: `mock:${staff.id}`,
      staff,
    };
    await this.store.saveSession({ ...session, createdAt: new Date().toISOString() });
    return session;
  }

  async authenticate(token: string): Promise<AuthSession | null> {
    const session = await this.store.getSession(token);
    if (!session) return null;
    return {
      token: session.token,
      platformToken: session.platformToken,
      staff: session.staff,
    };
  }

  async logout(token: string): Promise<void> {
    await this.store.deleteSession(token);
  }
}
