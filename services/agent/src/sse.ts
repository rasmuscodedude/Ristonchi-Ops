import type { ChatEvent } from "@ristonchi/shared";

export function encodeSse(event: ChatEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function sseResponse(events: AsyncGenerator<ChatEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(encodeSse(event)));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Something went wrong.";
        controller.enqueue(encoder.encode(encodeSse({ type: "error", message })));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

export function parseSse(body: string): ChatEvent[] {
  const events: ChatEvent[] = [];
  for (const block of body.split("\n\n")) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) continue;
    events.push(JSON.parse(data) as ChatEvent);
  }
  return events;
}
