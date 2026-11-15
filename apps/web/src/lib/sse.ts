export type SseFrame = { event: string; data: string };

export function pushSse(buffer: string, chunk: string): { frames: SseFrame[]; rest: string } {
  const text = buffer + chunk;
  const parts = text.split("\n\n");
  const rest = parts.pop() ?? "";
  const frames: SseFrame[] = [];
  for (const part of parts) {
    const frame = parseBlock(part);
    if (frame.data) frames.push(frame);
  }
  return { frames, rest };
}

function parseBlock(block: string): SseFrame {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  return { event, data: data.join("\n") };
}
