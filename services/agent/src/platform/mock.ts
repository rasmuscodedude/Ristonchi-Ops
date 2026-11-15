import { AGENT_TOOLS } from "../policy";
import { createVenueData, SAMPLE_PRICE_LIST, venueClosed, type VenueData } from "./mock-data";
import type { PlatformAdapter, PlatformToolCall } from "./types";

type Handler = (data: VenueData, args: Record<string, unknown>) => unknown;

function intArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function strArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireId(args: Record<string, unknown>, key: string): number | { error: string } {
  const id = intArg(args, key);
  if (id === undefined) return { error: `${key} is required.` };
  return id;
}

function confirmOrStop(args: Record<string, unknown>): { error: string; message: string } | null {
  if (args.confirm !== true) {
    return {
      error: "confirm_required",
      message: "This action needs confirm=true, and only after a person has approved it.",
    };
  }
  return null;
}

function reservation(data: VenueData, id: number) {
  return data.reservations.find((row) => row.id === id) ?? null;
}

function weekday(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

function couple(row: {
  first_name: string;
  last_name: string;
  partner_first_name: string;
  partner_last_name: string;
}) {
  return `${row.first_name} ${row.last_name} and ${row.partner_first_name} ${row.partner_last_name}`;
}

const handlers: Record<string, Handler> = {
  list_reservations: (data, args) => {
    const status = strArg(args, "status");
    const search = strArg(args, "search")?.toLowerCase();
    const limit = intArg(args, "limit") ?? 20;
    const rows = data.reservations.filter((row) => {
      if (status && row.status !== status) return false;
      if (!search) return true;
      const hay =
        `${row.first_name} ${row.last_name} ${row.partner_first_name} ${row.partner_last_name} ${row.email}`.toLowerCase();
      return hay.includes(search);
    });
    return { sample: true, reservations: rows.slice(0, limit) };
  },
  get_reservation_details: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const row = reservation(data, id);
    return row ? { sample: true, reservation: row } : { error: "Reservation not found." };
  },
  get_reservation_pipeline_history: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const row = reservation(data, id);
    if (!row) return { error: "Reservation not found." };
    return {
      sample: true,
      reservation_id: id,
      history: [
        { status: "inquiry", at: "2026-09-02" },
        { status: row.status, at: "2026-10-14" },
      ],
    };
  },
  list_customers: (data, args) => {
    const search = strArg(args, "search")?.toLowerCase();
    const customers = data.reservations
      .filter((row) => {
        if (!search) return true;
        return `${row.first_name} ${row.last_name} ${row.email}`.toLowerCase().includes(search);
      })
      .map((row) => ({
        id: row.customer_id,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        country: row.country,
      }));
    return { sample: true, customers };
  },
  get_customer: (data, args) => {
    const id = requireId(args, "customer_id");
    if (typeof id !== "number") return id;
    const row = data.reservations.find((item) => item.customer_id === id);
    return row
      ? {
          sample: true,
          customer: { id, name: `${row.first_name} ${row.last_name}`, email: row.email },
        }
      : { error: "Customer not found." };
  },
  get_customer_history: (data, args) => {
    const id = requireId(args, "customer_id");
    if (typeof id !== "number") return id;
    const rows = data.reservations.filter((item) => item.customer_id === id);
    return { sample: true, customer_id: id, reservations: rows };
  },
  list_proposals: (data, args) => {
    const reservationId = intArg(args, "reservation_id");
    const status = strArg(args, "status");
    const proposals = data.proposals.filter((row) => {
      if (reservationId !== undefined && row.reservation_id !== reservationId) return false;
      if (status && row.status !== status) return false;
      return true;
    });
    return { sample: true, proposals };
  },
  get_proposal: (data, args) => {
    const id = requireId(args, "proposal_id");
    if (typeof id !== "number") return id;
    const row = data.proposals.find((item) => item.id === id);
    return row ? { sample: true, proposal: row } : { error: "Proposal not found." };
  },
  list_contracts: (data, args) => {
    const reservationId = intArg(args, "reservation_id");
    return {
      sample: true,
      contracts: data.contracts.filter(
        (row) => reservationId === undefined || row.reservation_id === reservationId,
      ),
    };
  },
  get_contract: (data, args) => {
    const id = requireId(args, "contract_id");
    if (typeof id !== "number") return id;
    const row = data.contracts.find((item) => item.id === id);
    return row ? { sample: true, contract: row } : { error: "Contract not found." };
  },
  get_envelope_status: (data, args) => {
    const id = requireId(args, "contract_id");
    if (typeof id !== "number") return id;
    const row = data.contracts.find((item) => item.id === id);
    return row
      ? { sample: true, contract_id: id, envelope: row.envelope }
      : { error: "Contract not found." };
  },
  list_follow_ups: (data, args) => {
    const reservationId = intArg(args, "reservation_id");
    return {
      sample: true,
      follow_ups: data.followUps.filter(
        (row) =>
          row.status === "open" &&
          (reservationId === undefined || row.reservation_id === reservationId),
      ),
    };
  },
  list_outbox_messages: (data, args) => {
    const status = strArg(args, "status");
    return {
      sample: true,
      messages: data.outbox.filter((row) => !status || row.status === status),
    };
  },
  outbox_summary: (data) => {
    const counts: Record<string, number> = {};
    for (const row of data.outbox) counts[row.status] = (counts[row.status] ?? 0) + 1;
    return { sample: true, counts };
  },
  check_availability: (data, args) => {
    const date = strArg(args, "date");
    if (!date) return { error: "date is required." };
    if (venueClosed(date)) {
      return {
        sample: true,
        date,
        status: "closed",
        available: false,
        reason: "The castle is closed from 14 November through 31 March.",
      };
    }
    const block = data.blocks.find((row) => row.date === date);
    const booked = data.reservations.find(
      (row) =>
        row.event_date === date &&
        ["confirmed", "contract_sent", "payment_hold"].includes(row.status),
    );
    if (booked) {
      return { sample: true, date, status: "booked", available: false, reservation_id: booked.id };
    }
    if (block && block.status !== "available") {
      return { sample: true, date, status: block.status, available: false, reason: block.reason };
    }
    return { sample: true, date, status: "open", available: true };
  },
  list_venue_availability: (data, args) => {
    const month = strArg(args, "month");
    return {
      sample: true,
      month: month ?? null,
      blocks: data.blocks.filter((row) => !month || row.date.startsWith(month)),
      closed_season: "14 November through 31 March",
    };
  },
  get_funnel_analytics: (data) => {
    const counts: Record<string, number> = {};
    for (const row of data.reservations) counts[row.status] = (counts[row.status] ?? 0) + 1;
    return { sample: true, counts, reservations: data.reservations.length };
  },
  get_couple_profile: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const row = reservation(data, id);
    if (!row) return { error: "Reservation not found." };
    return {
      sample: true,
      reservation_id: id,
      couple: couple(row),
      memories: data.memories.filter((item) => item.reservation_id === id),
    };
  },
  get_plan_overview: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    return {
      sample: true,
      reservation_id: id,
      items: data.planItems.filter((item) => item.reservation_id === id),
    };
  },
  get_price_list: () => SAMPLE_PRICE_LIST,
  estimate_pricing: (_data, args) => {
    const date = strArg(args, "date");
    const guests = intArg(args, "guest_count");
    const eventType = strArg(args, "event_type") ?? "wedding";
    if (!date || guests === undefined)
      return { error: "event_type, guest_count, and date are required." };
    if (venueClosed(date)) {
      return {
        sample: true,
        date,
        event_type: eventType,
        available: false,
        estimate: null,
        reason: "The castle is closed from 14 November through 31 March, so there is no estimate.",
      };
    }
    const day = weekday(date);
    const month = Number(date.slice(5, 7));
    const peak = month === 5 || month === 6 || month === 9;
    const venue = day === 6 ? (peak ? 22000 : 18000) : day === 5 ? 15000 : 18000;
    const dinner = 145 * guests;
    const aperitivo = 28 * guests;
    const lines = [
      {
        item:
          day === 6
            ? peak
              ? "Saturday exclusive use, peak"
              : "Saturday exclusive use"
            : day === 5
              ? "Friday exclusive use"
              : "Weekday exclusive use",
        price_eur: venue,
      },
      { item: `Seated dinner for ${guests}`, price_eur: dinner },
      { item: `Welcome aperitivo for ${guests}`, price_eur: aperitivo },
    ];
    return {
      sample: true,
      date,
      event_type: eventType,
      guest_count: guests,
      available: true,
      lines,
      total_eur: lines.reduce((sum, line) => sum + line.price_eur, 0),
      price_list_version: SAMPLE_PRICE_LIST.version,
    };
  },
  list_forms: () => ({
    sample: true,
    forms: [
      { id: 11, name: "Planning questionnaire" },
      { id: 12, name: "Menu tasting" },
    ],
  }),
  get_form: (_data, args) => {
    const id = requireId(args, "form_id");
    if (typeof id !== "number") return id;
    if (id === 11)
      return {
        sample: true,
        form: { id, name: "Planning questionnaire", fields: ["guest count", "rituals"] },
      };
    if (id === 12)
      return { sample: true, form: { id, name: "Menu tasting", fields: ["dietary notes"] } };
    return { error: "Form not found." };
  },
  search_knowledge: (_data, args) => {
    const query = (strArg(args, "query") ?? "").toLowerCase();
    const articles = [
      {
        id: "winter",
        title: "Winter closure",
        body: "The castle is closed from 14 November through 31 March. Do not offer those dates.",
      },
      {
        id: "wording",
        title: "How we write to couples",
        body: "Write money as 1,000€. Say first payment, never deposit. Do not use em dashes. Never promise a date is available.",
      },
      {
        id: "proposals",
        title: "Sending a proposal",
        body: "A proposal with no pricing cannot be sent. schedule queues it for the next Italian working-hours slot. now sends at once.",
      },
    ];
    const hits = articles.filter(
      (article) =>
        !query ||
        `${article.title} ${article.body}`.toLowerCase().includes(query) ||
        query.split(/\s+/).some((word) => article.body.toLowerCase().includes(word)),
    );
    return { sample: true, articles: hits };
  },
  create_reservation: (data, args) => {
    const first = strArg(args, "first_name");
    const email = strArg(args, "email");
    if (!first || !email) return { error: "first_name and email are required." };
    const id = data.nextId++;
    const row = {
      id,
      confirmation_number: `R-${id}`,
      first_name: first,
      last_name: strArg(args, "last_name") ?? "",
      partner_first_name: strArg(args, "partner_first_name") ?? "",
      partner_last_name: strArg(args, "partner_last_name") ?? "",
      email,
      phone: strArg(args, "phone") ?? "",
      country: strArg(args, "country") ?? "",
      event_type: strArg(args, "event_type") ?? "wedding",
      guest_count: intArg(args, "guest_count") ?? 0,
      event_date: strArg(args, "event_date") ?? null,
      status: "inquiry",
      owner: "Stefanie",
      additional_notes: strArg(args, "additional_notes") ?? "",
      customer_id: data.nextId++,
    };
    data.reservations.push(row);
    return { sample: true, reservation: row, silent: args.silent !== false };
  },
  update_reservation: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const row = reservation(data, id);
    if (!row) return { error: "Reservation not found." };
    for (const key of [
      "first_name",
      "last_name",
      "email",
      "phone",
      "additional_notes",
      "status",
      "event_date",
    ] as const) {
      const value = strArg(args, key);
      if (value && key in row) (row as Record<string, unknown>)[key] = value;
    }
    const guests = intArg(args, "guest_count");
    if (guests !== undefined) row.guest_count = guests;
    return { sample: true, reservation: row };
  },
  update_reservation_status: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const next = strArg(args, "new_status");
    if (!next) return { error: "new_status is required." };
    const row = reservation(data, id);
    if (!row) return { error: "Reservation not found." };
    row.status = next;
    return { sample: true, reservation_id: id, status: next };
  },
  create_proposal: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const row = reservation(data, id);
    if (!row) return { error: "Reservation not found." };
    const proposal = {
      id: data.nextId++,
      reservation_id: id,
      title: strArg(args, "title") ?? `${couple(row)} at Castello di Ristonchi`,
      status: "draft" as const,
      intro:
        strArg(args, "intro") ?? `Hello ${row.first_name}, here is a draft for your celebration.`,
      has_pricing: false,
      pricing_note: "Prices are blank until staff complete them in the proposal editor.",
    };
    data.proposals.push(proposal);
    return { sample: true, proposal };
  },
  reissue_proposal: (data, args) => {
    const id = requireId(args, "proposal_id");
    if (typeof id !== "number") return id;
    const existing = data.proposals.find((item) => item.id === id);
    if (!existing) return { error: "Proposal not found." };
    const copy = { ...existing, id: data.nextId++, status: "draft" as const, has_pricing: false };
    data.proposals.push(copy);
    return { sample: true, proposal: copy };
  },
  cancel_proposal_send: (data, args) => {
    const id = requireId(args, "proposal_id");
    if (typeof id !== "number") return id;
    const row = data.proposals.find((item) => item.id === id);
    if (!row) return { error: "Proposal not found." };
    if (row.status === "sent") return { error: "This proposal has already been sent." };
    row.status = "draft";
    return { sample: true, proposal_id: id, status: row.status };
  },
  send_contract_for_signature: (data, args) => {
    const id = requireId(args, "contract_id");
    if (typeof id !== "number") return id;
    const row = data.contracts.find((item) => item.id === id);
    if (!row) return { error: "Contract not found." };
    row.status = "sent";
    row.envelope = "waiting";
    return { sample: true, contract_id: id, envelope: row.envelope };
  },
  send_custom_email: (data, args) => {
    const to = strArg(args, "to_email");
    const subject = strArg(args, "subject");
    const body = strArg(args, "body_html");
    if (!to || !subject || !body)
      return { error: "to_email, subject, and body_html are required." };
    const message = {
      id: data.nextId++,
      reservation_id: intArg(args, "reservation_id") ?? 0,
      to_email: to,
      subject,
      status: "sent" as const,
      body_text: strArg(args, "body_text") ?? body,
    };
    data.outbox.push(message);
    return { sample: true, message };
  },
  send_email: (data, args) => {
    const to = strArg(args, "to_email");
    const template = strArg(args, "template_type");
    if (!to || !template) return { error: "to_email and template_type are required." };
    const message = {
      id: data.nextId++,
      reservation_id: 0,
      to_email: to,
      subject: template,
      status: "sent" as const,
      body_text: `Template ${template}`,
    };
    data.outbox.push(message);
    return { sample: true, message };
  },
  stop_follow_up: (data, args) => {
    const id = requireId(args, "follow_up_id");
    if (typeof id !== "number") return id;
    const row = data.followUps.find((item) => item.id === id);
    if (!row) return { error: "Follow-up not found." };
    row.status = "stopped";
    return { sample: true, follow_up: row };
  },
  add_couple_memory: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const memory = strArg(args, "memory");
    if (!memory) return { error: "memory is required." };
    const row = { id: data.nextId++, reservation_id: id, memory };
    data.memories.push(row);
    return { sample: true, memory: row };
  },
  add_plan_item: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const title = strArg(args, "title");
    if (!title) return { error: "title is required." };
    const row = { id: data.nextId++, reservation_id: id, title, status: "open" as const };
    data.planItems.push(row);
    return { sample: true, item: row };
  },
  complete_plan_item: (data, args) => {
    const id = requireId(args, "plan_item_id");
    if (typeof id !== "number") return id;
    const row = data.planItems.find((item) => item.id === id);
    if (!row) return { error: "Plan item not found." };
    row.status = "done";
    return { sample: true, item: row };
  },
  assign_form: (_data, args) => {
    const reservationId = requireId(args, "reservation_id");
    const formId = requireId(args, "form_id");
    if (typeof reservationId !== "number") return reservationId;
    if (typeof formId !== "number") return formId;
    return { sample: true, reservation_id: reservationId, form_id: formId, assigned: true };
  },
  set_availability_block: (data, args) => {
    const date = strArg(args, "date");
    if (!date) return { error: "date is required." };
    const status = (strArg(args, "status") ?? "blocked") as "blocked" | "closed" | "available";
    const existing = data.blocks.find((row) => row.date === date);
    if (existing) existing.status = status;
    else data.blocks.push({ date, status, reason: "Set by staff." });
    return { sample: true, date, status };
  },
  generate_proposal_draft: (data, args) => {
    const blocked = confirmOrStop(args);
    if (blocked) return blocked;
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const row = reservation(data, id);
    if (!row) return { error: "Reservation not found." };
    return {
      sample: true,
      saved: false,
      sent: false,
      reservation_id: id,
      draft: `Hello ${row.first_name}, this draft is for staff review and has not been saved or sent. Guest count on the reservation is ${row.guest_count}. Date on the reservation is ${row.event_date ?? "not set"}. Prices stay out of this draft until a price-list read is pasted in by staff.`,
    };
  },
  send_proposal: (data, args) => {
    const blocked = confirmOrStop(args);
    if (blocked) return blocked;
    const id = requireId(args, "proposal_id");
    if (typeof id !== "number") return id;
    const row = data.proposals.find((item) => item.id === id);
    if (!row) return { error: "Proposal not found." };
    if (!row.has_pricing) return { error: "Refusing to send a proposal with no pricing." };
    const mode = strArg(args, "mode") ?? "schedule";
    row.status = mode === "now" ? "sent" : "scheduled";
    return { sample: true, proposal_id: id, status: row.status, mode };
  },
  create_contract: (data, args) => {
    const blocked = confirmOrStop(args);
    if (blocked) return blocked;
    const title = strArg(args, "title");
    if (!title) return { error: "title is required." };
    const row = {
      id: data.nextId++,
      reservation_id: intArg(args, "reservation_id") ?? 0,
      proposal_id: intArg(args, "proposal_id") ?? null,
      title,
      status: "draft" as const,
      envelope: "not_sent" as const,
    };
    data.contracts.push(row);
    return { sample: true, contract: row };
  },
  release_outbox_message: (data, args) => {
    const blocked = confirmOrStop(args);
    if (blocked) return blocked;
    const id = requireId(args, "message_id");
    if (typeof id !== "number") return id;
    const row = data.outbox.find((item) => item.id === id);
    if (!row) return { error: "Message not found." };
    row.status = "queued";
    return { sample: true, message: row };
  },
  discard_outbox_message: (data, args) => {
    const blocked = confirmOrStop(args);
    if (blocked) return blocked;
    const id = requireId(args, "message_id");
    if (typeof id !== "number") return id;
    const row = data.outbox.find((item) => item.id === id);
    if (!row) return { error: "Message not found." };
    row.status = "discarded";
    return { sample: true, message: row };
  },
  delete_reservation: (data, args) => {
    const blocked = confirmOrStop(args);
    if (blocked) return blocked;
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const before = data.reservations.length;
    data.reservations = data.reservations.filter((row) => row.id !== id);
    if (data.reservations.length === before) return { error: "Reservation not found." };
    return { sample: true, deleted: id };
  },
  list_upcoming_events: (data, args) => {
    const days = intArg(args, "days") ?? 14;
    const start = Date.parse("2026-11-15T00:00:00Z");
    const end = start + days * 86_400_000;
    const events = data.reservations
      .filter((row) => row.status === "confirmed" && row.event_date)
      .map((row) => {
        const when = Date.parse(`${row.event_date}T00:00:00Z`);
        const openTasks = data.tasks.filter(
          (task) => task.reservation_id === row.id && task.status === "open",
        ).length;
        return {
          reservation_id: row.id,
          couple: couple(row),
          event_date: row.event_date,
          guest_count: row.guest_count,
          days_out: Math.round((when - start) / 86_400_000),
          open_tasks: openTasks,
          include: when >= start && when <= end,
        };
      })
      .filter((row) => row.include)
      .map((row) => {
        const { include, ...rest } = row;
        void include;
        return rest;
      });
    return { sample: true, days, events, today: "2026-11-15" };
  },
  get_event_sheet: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const row = reservation(data, id);
    if (!row) return { error: "Reservation not found." };
    return {
      sample: true,
      reservation_id: id,
      couple: couple(row),
      event_date: row.event_date,
      guest_count: row.guest_count,
      timeline: [
        { time: "16:00", item: "Guest arrival in the courtyard" },
        { time: "17:00", item: "Ceremony in the lemon garden" },
        { time: "20:00", item: "Dinner in the hall" },
      ],
    };
  },
  event_health: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const openTasks = data.tasks.filter(
      (task) => task.reservation_id === id && task.status === "open",
    );
    const openRequests = data.guestRequests.filter(
      (item) => item.reservation_id === id && item.status === "open",
    );
    return { sample: true, reservation_id: id, open_tasks: openTasks, open_requests: openRequests };
  },
  experience_control_tower: (data, args) => {
    const upcoming = handlers.list_upcoming_events(data, { days: intArg(args, "days") ?? 200 });
    return { sample: true, upcoming, alerts: data.tasks.filter((task) => task.status === "open") };
  },
  list_control_tower_alerts: (data) => ({
    sample: true,
    alerts: data.tasks
      .filter((task) => task.status === "open")
      .map((task) => ({ task_id: task.id, title: task.title })),
  }),
  list_event_vendors: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    return { sample: true, vendors: data.vendors.filter((row) => row.reservation_id === id) };
  },
  list_guests: (data, args) => {
    const id = intArg(args, "reservation_id");
    return {
      sample: true,
      guests: data.guests.filter((row) => id === undefined || row.reservation_id === id),
    };
  },
  list_guest_requests: (data, args) => {
    const id = intArg(args, "reservation_id");
    return {
      sample: true,
      requests: data.guestRequests.filter((row) => id === undefined || row.reservation_id === id),
    };
  },
  get_event_weather: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const row = reservation(data, id);
    if (!row?.event_date) return { error: "No event date to forecast." };
    return handlers.get_venue_weather(data, { date: row.event_date });
  },
  get_venue_weather: (_data, args) => {
    const date = strArg(args, "date");
    if (!date) return { error: "date is required." };
    return {
      sample: true,
      source: "sample forecast, not a live feed",
      date,
      summary: "Mild, a light afternoon breeze, around 18°C. Sample forecast.",
    };
  },
  preview_department_briefing: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const department = strArg(args, "department");
    if (!department) return { error: "department is required." };
    const row = reservation(data, id);
    if (!row) return { error: "Reservation not found." };
    const body = `${department} briefing for ${couple(row)} on ${row.event_date ?? "a date still to set"}. ${row.guest_count} guests. Ceremony at 17:00 in the lemon garden, dinner at 20:00. Sample preview, not sent.`;
    return { sample: true, sent: false, reservation_id: id, department, body };
  },
  list_shifts: () => ({
    sample: true,
    shifts: [
      { date: "2027-04-17", department: "kitchen", who: "Kitchen lead" },
      { date: "2027-04-17", department: "service", who: "Service lead" },
      { date: "2027-04-17", department: "coordination", who: "Wedding desk" },
    ],
  }),
  list_staff: () => ({
    sample: true,
    staff: [
      { name: "Stefanie", department: "sales" },
      { name: "Wedding desk", department: "coordination" },
      { name: "Kitchen", department: "kitchen" },
    ],
  }),
  list_tasks: (data, args) => {
    const id = intArg(args, "reservation_id");
    const status = strArg(args, "status");
    return {
      sample: true,
      tasks: data.tasks.filter((row) => {
        if (id !== undefined && row.reservation_id !== id) return false;
        if (status && row.status !== status) return false;
        return true;
      }),
    };
  },
  list_incidents: (data, args) => {
    const id = intArg(args, "reservation_id");
    return {
      sample: true,
      incidents: data.incidents.filter((row) => id === undefined || row.reservation_id === id),
    };
  },
  get_event_debrief: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const row = data.debriefs.find((item) => item.reservation_id === id);
    return row ? { sample: true, debrief: row } : { sample: true, debrief: null };
  },
  event_preparation: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    if (!reservation(data, id)) return { error: "Reservation not found." };
    const existing = data.planItems.some(
      (item) => item.reservation_id === id && item.title === "Preparation opened",
    );
    if (!existing) {
      data.planItems.push({
        id: data.nextId++,
        reservation_id: id,
        title: "Preparation opened",
        status: "open",
      });
    }
    return { sample: true, reservation_id: id, started: true };
  },
  invite_vendor: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const name = strArg(args, "vendor_name");
    if (!name) return { error: "vendor_name is required." };
    const row = {
      id: data.nextId++,
      reservation_id: id,
      vendor_name: name,
      role: strArg(args, "role") ?? "Vendor",
      status: "invited" as const,
    };
    data.vendors.push(row);
    return { sample: true, vendor: row };
  },
  update_event_vendor: (data, args) => {
    const id = requireId(args, "vendor_id");
    if (typeof id !== "number") return id;
    const row = data.vendors.find((item) => item.id === id);
    if (!row) return { error: "Vendor not found." };
    const role = strArg(args, "role");
    const status = strArg(args, "status");
    if (role) row.role = role;
    if (status === "confirmed" || status === "invited") row.status = status;
    return { sample: true, vendor: row };
  },
  update_guest: (data, args) => {
    const id = requireId(args, "guest_id");
    if (typeof id !== "number") return id;
    const row = data.guests.find((item) => item.id === id);
    if (!row) return { error: "Guest not found." };
    const notes = strArg(args, "notes");
    if (notes) row.notes = notes;
    return { sample: true, guest: row };
  },
  create_guest_request: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const request = strArg(args, "request");
    if (!request) return { error: "request is required." };
    const row = { id: data.nextId++, reservation_id: id, request, status: "open" as const };
    data.guestRequests.push(row);
    return { sample: true, request: row };
  },
  update_guest_request_status: (data, args) => {
    const id = requireId(args, "request_id");
    if (typeof id !== "number") return id;
    const row = data.guestRequests.find((item) => item.id === id);
    if (!row) return { error: "Request not found." };
    const status = strArg(args, "status");
    if (status === "open" || status === "done" || status === "declined") row.status = status;
    return { sample: true, request: row };
  },
  send_department_briefing: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const department = strArg(args, "department");
    if (!department) return { error: "department is required." };
    const body = strArg(args, "body") ?? `Briefing for ${department}.`;
    const row = { id: data.nextId++, reservation_id: id, department, body };
    data.briefings.push(row);
    return { sample: true, briefing: row, sent: true };
  },
  create_incident: (data, args) => {
    const raw = strArg(args, "raw_description");
    if (!raw || raw.length < 10)
      return { error: "raw_description must be at least 10 characters." };
    const row = {
      id: data.nextId++,
      reservation_id: intArg(args, "reservation_id") ?? null,
      title: strArg(args, "title") ?? raw.slice(0, 80),
      raw_description: raw,
      department: strArg(args, "department") ?? "coordination",
      location: strArg(args, "location") ?? "",
      status: "open" as const,
    };
    data.incidents.push(row);
    return { sample: true, incident: row };
  },
  update_incident_status: (data, args) => {
    const id = requireId(args, "incident_id");
    if (typeof id !== "number") return id;
    const row = data.incidents.find((item) => item.id === id);
    if (!row) return { error: "Incident not found." };
    const status = strArg(args, "status");
    if (status === "open" || status === "investigating" || status === "closed") row.status = status;
    return { sample: true, incident: row };
  },
  create_task: (data, args) => {
    const title = strArg(args, "title");
    if (!title) return { error: "title is required." };
    const row = {
      id: data.nextId++,
      reservation_id: intArg(args, "reservation_id") ?? null,
      title,
      department: strArg(args, "department") ?? "coordination",
      status: "open" as const,
    };
    data.tasks.push(row);
    return { sample: true, task: row };
  },
  update_task: (data, args) => {
    const id = requireId(args, "task_id");
    if (typeof id !== "number") return id;
    const row = data.tasks.find((item) => item.id === id);
    if (!row) return { error: "Task not found." };
    const title = strArg(args, "title");
    if (title) row.title = title;
    return { sample: true, task: row };
  },
  update_task_status: (data, args) => {
    const id = requireId(args, "task_id");
    if (typeof id !== "number") return id;
    const row = data.tasks.find((item) => item.id === id);
    if (!row) return { error: "Task not found." };
    const status = strArg(args, "status");
    if (status === "open" || status === "done") row.status = status;
    return { sample: true, task: row };
  },
  prepare_event_debrief: (data, args) => {
    const id = requireId(args, "reservation_id");
    if (typeof id !== "number") return id;
    const notes = strArg(args, "notes") ?? "";
    const row = { reservation_id: id, notes, status: "draft" };
    data.debriefs.push(row);
    return { sample: true, debrief: row };
  },
};

export function mockHandlesEveryAllowlistedTool(): string[] {
  const missing: string[] = [];
  for (const name of new Set([...AGENT_TOOLS["sales-couples"], ...AGENT_TOOLS["wedding-day"]])) {
    if (!handlers[name]) missing.push(name);
  }
  return missing;
}

export class MockPlatform implements PlatformAdapter {
  readonly data: VenueData;

  constructor(data: VenueData = createVenueData()) {
    this.data = data;
  }

  async callTool(input: PlatformToolCall): Promise<unknown> {
    const handler = handlers[input.name];
    if (!handler) {
      return { error: `The mock has no fixture for ${input.name}.` };
    }
    return handler(this.data, input.args);
  }

  async listSchemas(_platformToken: string): Promise<null> {
    return null;
  }
}
