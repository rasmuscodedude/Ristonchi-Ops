import type { StaffProfile } from "@ristonchi/shared";

export type AuthSession = {
  token: string;
  platformToken: string;
  staff: StaffProfile;
};

export interface AuthAdapter {
  login(email: string, password: string): Promise<AuthSession>;
  authenticate(token: string): Promise<AuthSession | null>;
  logout(token: string): Promise<void>;
}
