export const PLATFORM_ROLES = [
  "admin",
  "manager",
  "event_coordinator",
  "chef",
  "server",
  "sommelier",
  "housekeeping",
  "maintenance",
  "reception",
  "accountant",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export type StaffFlags = {
  /** Grants the Sales / Couples agent. Not a platform role. */
  sales?: boolean;
};

export type StaffProfile = {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  flags: StaffFlags;
};

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === "string" && (PLATFORM_ROLES as readonly string[]).includes(value);
}
