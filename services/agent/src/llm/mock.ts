import { toolKind } from "../policy";
import type { LlmCompletion, LlmMessage, LlmProvider, LlmToolCall } from "./types";

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

/**
 * A deterministic stand-in so the app can be tried without a model key.
 * It only quotes fields that came back from a tool.
 */
export class MockLlm implements LlmProvider {
  async complete(input: {
    messages: LlmMessage[];
    tools: { name: string }[];
  }): Promise<LlmCompletion> {
    const names = new Set(input.tools.map((tool) => tool.name));
    const last = input.messages.at(-1);
    const user = [...input.messages].reverse().find((message) => message.role === "user");
    const text = user && user.role === "user" ? user.content : "";

    if (last?.role === "tool" && toolKind(last.name) !== "read") {
      return { text: summarise(last.name, last.content), toolCalls: [] };
    }

    const next = plan(text, names, input.messages);
    if (next) return { text: "", toolCalls: [next] };
    if (last?.role === "tool") return { text: summarise(last.name, last.content), toolCalls: [] };
    if (/send/i.test(text) && /proposal/i.test(text) && names.has("send_proposal")) {
      return {
        text: "I do not have a draft proposal to send. Nothing was sent.",
        toolCalls: [],
      };
    }
    return {
      text: names.has("list_reservations")
        ? "I can look up a couple, check a date, estimate from the price list, or prepare a proposal. I will not invent a price or a date."
        : "I can look up the coming weddings, the run of show, the weather, or prepare a briefing. I will only use what Norberto returns.",
      toolCalls: [],
    };
  }
}

function plan(text: string, names: Set<string>, messages: LlmMessage[]): LlmToolCall | null {
  const has = (name: string) => names.has(name) && !called(messages, name);

  if (/send/i.test(text) && /proposal/i.test(text) && names.has("send_proposal")) {
    if (!called(messages, "list_proposals") && !called(messages, "get_proposal")) {
      return call("list_proposals", { status: "draft" });
    }
    const proposalId = findProposalId(messages, text);
    if (proposalId && !called(messages, "send_proposal")) {
      return call("send_proposal", {
        proposal_id: proposalId,
        mode: /now/i.test(text) ? "now" : "schedule",
      });
    }
  }

  if (/delete/i.test(text) && has("delete_reservation")) {
    const id = mentionedId(text);
    if (id) return call("delete_reservation", { reservation_id: id, confirm: true });
  }

  if (/block|hold/i.test(text) && /date/i.test(text) && has("set_availability_block")) {
    const date = findDate(text);
    if (date) return call("set_availability_block", { date, status: "blocked" });
  }

  if (/estimate|price|how much|cost/i.test(text) && names.has("estimate_pricing")) {
    const date = findDate(text);
    const guests = Number(text.match(/(\d+)\s+guests/i)?.[1] ?? "");
    if (date && guests && has("estimate_pricing")) {
      return call("estimate_pricing", { event_type: "wedding", guest_count: guests, date });
    }
    if (has("get_price_list")) return call("get_price_list", {});
  }

  if (/open|available/i.test(text) && has("check_availability")) {
    const date = findDate(text);
    if (date) return call("check_availability", { date });
  }

  if (
    /proposal/i.test(text) &&
    /which|who|waiting|draft/i.test(text) &&
    !/send/i.test(text) &&
    names.has("list_proposals")
  ) {
    if (!called(messages, "list_proposals")) return call("list_proposals", { status: "draft" });
    return null;
  }

  if (/which|who|pipeline|couples|reservations/i.test(text) && has("list_reservations")) {
    const status = /inquir/i.test(text) ? "inquiry" : undefined;
    return call("list_reservations", status ? { status, limit: 20 } : { limit: 20 });
  }

  if (
    /briefing|kitchen|tell the/i.test(text) &&
    (names.has("preview_department_briefing") || names.has("send_department_briefing"))
  ) {
    const department = /service/i.test(text) ? "service" : "kitchen";
    let reservationId = mentionedId(text) ?? findEventId(messages);
    if (!reservationId && has("list_upcoming_events")) {
      return call("list_upcoming_events", { days: 250 });
    }
    reservationId = mentionedId(text) ?? findEventId(messages);
    if (reservationId && has("preview_department_briefing")) {
      return call("preview_department_briefing", { reservation_id: reservationId, department });
    }
    if (reservationId && /send|tell/i.test(text) && has("send_department_briefing")) {
      const preview = findPreview(messages);
      return call("send_department_briefing", {
        reservation_id: reservationId,
        department,
        body: preview ?? "",
      });
    }
  }

  if (/sheet|run of show|timeline/i.test(text) && names.has("get_event_sheet")) {
    const reservationId = mentionedId(text) ?? findEventId(messages);
    if (!reservationId && has("list_upcoming_events"))
      return call("list_upcoming_events", { days: 250 });
    if (reservationId && has("get_event_sheet"))
      return call("get_event_sheet", { reservation_id: reservationId });
  }

  if (/weather/i.test(text)) {
    const reservationId = mentionedId(text) ?? findEventId(messages);
    if (reservationId && has("get_event_weather"))
      return call("get_event_weather", { reservation_id: reservationId });
    if (!reservationId && has("list_upcoming_events"))
      return call("list_upcoming_events", { days: 250 });
    const date = findDate(text);
    if (date && has("get_venue_weather")) return call("get_venue_weather", { date });
  }

  if (
    /incident|broke|broken|happened/i.test(text) &&
    has("create_incident") &&
    text.trim().length >= 10
  ) {
    return call("create_incident", { raw_description: text.trim(), department: "coordination" });
  }

  if (
    /on the books|upcoming|next summer|coming up|weddings/i.test(text) &&
    has("list_upcoming_events")
  ) {
    const days = /summer|books|season|through/i.test(text) ? 250 : 14;
    return call("list_upcoming_events", { days });
  }

  return null;
}

function call(name: string, args: Record<string, unknown>): LlmToolCall {
  return { id: crypto.randomUUID(), name, arguments: args };
}

function called(messages: LlmMessage[], name: string): boolean {
  return messages.some((message) => message.role === "tool" && message.name === name);
}

function parse(content: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(content) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function findProposalId(messages: LlmMessage[], text: string): number | undefined {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
  let fallback: number | undefined;
  for (const message of messages) {
    if (message.role !== "tool") continue;
    const payload = parse(message.content);
    const list = Array.isArray(payload?.proposals)
      ? payload.proposals
      : payload?.proposal
        ? [payload.proposal]
        : [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const proposal = item as {
        id?: number;
        title?: string;
        status?: string;
        has_pricing?: boolean;
      };
      if (typeof proposal.id !== "number") continue;
      const title = (proposal.title ?? "").toLowerCase();
      if (words.some((word) => title.includes(word))) return proposal.id;
      if (fallback === undefined && proposal.status === "draft" && proposal.has_pricing)
        fallback = proposal.id;
    }
  }
  return fallback;
}

function findEventId(messages: LlmMessage[]): number | undefined {
  for (const message of messages) {
    if (message.role !== "tool") continue;
    const payload = parse(message.content);
    const events = payload?.events;
    if (!Array.isArray(events) || !events.length) continue;
    const first = events[0] as { reservation_id?: number };
    if (typeof first?.reservation_id === "number") return first.reservation_id;
  }
  return undefined;
}

function findPreview(messages: LlmMessage[]): string | undefined {
  for (const message of [...messages].reverse()) {
    if (message.role !== "tool" || message.name !== "preview_department_briefing") continue;
    const payload = parse(message.content);
    if (typeof payload?.body === "string") return payload.body;
  }
  return undefined;
}

function mentionedId(text: string): number | undefined {
  const match = text.match(/\b(\d{3,6})\b/);
  return match ? Number(match[1]) : undefined;
}

function findDate(text: string): string | undefined {
  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const long = text.match(
    /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
  );
  if (!long) return undefined;
  const month = MONTHS[long[2]!.toLowerCase()];
  return `${long[3]}-${month}-${long[1]!.padStart(2, "0")}`;
}

function summarise(name: string, content: string): string {
  const payload = parse(content);
  if (!payload) return "I could not read what Norberto returned.";
  if (typeof payload.error === "string") return `Norberto did not do that. ${payload.error}`;
  if (payload.rejected === true) return "Understood. I left it unchanged.";

  if (name === "list_reservations" && Array.isArray(payload.reservations)) {
    if (!payload.reservations.length) return "No reservations match.";
    return payload.reservations
      .map((item) => {
        const row = item as {
          first_name?: string;
          last_name?: string;
          email?: string;
          status?: string;
          event_date?: string | null;
          id?: number;
        };
        const date = row.event_date ? `, date ${row.event_date}` : ", no date yet";
        return `${row.first_name ?? ""} ${row.last_name ?? ""} (${row.email ?? "no email"}) is ${row.status}${date}. Reservation ${row.id}.`;
      })
      .join("\n");
  }

  if (name === "list_proposals" && Array.isArray(payload.proposals)) {
    if (!payload.proposals.length) return "There is no proposal in that state.";
    return payload.proposals
      .map((item) => {
        const row = item as { id?: number; title?: string; status?: string; has_pricing?: boolean };
        const pricing = row.has_pricing ? "pricing is filled in" : "pricing is still blank";
        return `Proposal ${row.id}, ${row.title}, status ${row.status}, ${pricing}.`;
      })
      .join("\n");
  }

  if (name === "check_availability") {
    if (payload.available === true) return `${payload.date} is open in the calendar.`;
    return `${payload.date} is ${payload.status}. ${typeof payload.reason === "string" ? payload.reason : ""}`.trim();
  }

  if (name === "estimate_pricing") {
    if (payload.estimate === null || payload.available === false) {
      return typeof payload.reason === "string"
        ? payload.reason
        : "There is no estimate for that date.";
    }
    const lines = Array.isArray(payload.lines)
      ? payload.lines
          .map((item) => {
            const line = item as { item?: string; price_eur?: number };
            return `${line.item}: ${line.price_eur}€`;
          })
          .join("\n")
      : "";
    return `${lines}\nTotal ${payload.total_eur}€, from price list ${payload.price_list_version}.`;
  }

  if (name === "get_price_list" && Array.isArray(payload.packages)) {
    return payload.packages
      .map((item) => {
        const row = item as { name?: string; price_eur?: number };
        return `${row.name}: ${row.price_eur}€`;
      })
      .join("\n");
  }

  if (name === "list_upcoming_events" && Array.isArray(payload.events)) {
    if (!payload.events.length) {
      return `No confirmed weddings in the next ${payload.days} days. The castle is closed from 14 November through 31 March.`;
    }
    return payload.events
      .map((item) => {
        const row = item as {
          couple?: string;
          event_date?: string;
          guest_count?: number;
          open_tasks?: number;
          reservation_id?: number;
        };
        return `${row.couple} on ${row.event_date}, ${row.guest_count} guests, ${row.open_tasks} open tasks. Reservation ${row.reservation_id}.`;
      })
      .join("\n");
  }

  if (name === "get_event_sheet") {
    const timeline = Array.isArray(payload.timeline)
      ? payload.timeline
          .map((item) => {
            const row = item as { time?: string; item?: string };
            return `${row.time} ${row.item}`;
          })
          .join("\n")
      : "";
    return `${payload.couple} on ${payload.event_date}, ${payload.guest_count} guests.\n${timeline}`;
  }

  if (name === "preview_department_briefing" && typeof payload.body === "string") {
    return `Preview only, not sent:\n${payload.body}`;
  }

  if (name === "send_department_briefing") return "The briefing is sent.";
  if (name === "send_proposal")
    return `Proposal ${payload.proposal_id} is now ${payload.status} (${payload.mode}).`;
  if (name === "set_availability_block") return `${payload.date} is marked ${payload.status}.`;
  if (name === "create_incident") return "The incident is saved in the words you gave me.";
  if (name === "delete_reservation") return `Reservation ${payload.deleted} is deleted.`;

  return `Done. Norberto returned ${name}.`;
}
