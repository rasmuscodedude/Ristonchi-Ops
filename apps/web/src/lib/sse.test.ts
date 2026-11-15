import { describe, expect, it } from "vitest";
import { pushSse } from "./sse";

describe("pushSse", () => {
  it("reassembles frames that arrive in pieces", () => {
    const first = pushSse("", 'event: token\ndata: {"text":"Hel');
    expect(first.frames).toEqual([]);
    const second = pushSse(first.rest, 'lo"}\n\nevent: done\ndata: {"ok":true}\n\n');
    expect(second.frames.map((frame) => frame.event)).toEqual(["token", "done"]);
    expect(JSON.parse(second.frames[0]!.data)).toEqual({ text: "Hello" });
    expect(second.rest).toBe("");
  });
});
