import { describe, expect, it } from "vitest";
import { AGENT_TOOLS } from "../policy";
import { TOOL_DEFINITIONS } from "../tools";
import { createVenueData } from "./mock-data";
import { MockPlatform, mockHandlesEveryAllowlistedTool } from "./mock";

describe("mock platform", () => {
  it("implements every allowlisted tool", () => {
    expect(mockHandlesEveryAllowlistedTool()).toEqual([]);
    const names = new Set([...AGENT_TOOLS["sales-couples"], ...AGENT_TOOLS["wedding-day"]]);
    for (const name of names) expect(TOOL_DEFINITIONS[name], name).toBeDefined();
  });

  it("refuses a high-confirm delete until confirm=true", async () => {
    const data = createVenueData();
    const platform = new MockPlatform(data);
    const blocked = await platform.callTool({
      name: "delete_reservation",
      args: { reservation_id: 1042 },
      platformToken: "mock",
    });
    expect(blocked).toMatchObject({ error: "confirm_required" });
    expect(data.reservations.some((row) => row.id === 1042)).toBe(true);

    const done = await platform.callTool({
      name: "delete_reservation",
      args: { reservation_id: 1042, confirm: true },
      platformToken: "mock",
    });
    expect(done).toMatchObject({ deleted: 1042 });
    expect(data.reservations.some((row) => row.id === 1042)).toBe(false);
  });
});
