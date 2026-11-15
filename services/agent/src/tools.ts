export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: JsonSchema;
};

const loose = (properties: Record<string, unknown>, required: string[] = []): JsonSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: true,
});

const integer = (description: string) => ({ type: "integer", description });
const text = (description: string) => ({ type: "string", description });

const reservationId = integer("Reservation id");
const proposalId = integer("Proposal id");

/** Bundled schemas for mock mode and as a fallback. Live MCP schemas replace these when connected. */
export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  list_reservations: {
    name: "list_reservations",
    description:
      "List reservations. Filter with status and search (name or email). Never assume a person exists.",
    parameters: loose({
      limit: integer("Maximum rows, default 20"),
      status: text(
        "inquiry, proposal_sent, proposal_accepted, qualified, preferred_dates, follow_ups, short_call, contract_sent, payment_hold, confirmed, completed, declined, cancelled",
      ),
      search: text("Case-insensitive name or email"),
    }),
  },
  get_reservation_details: {
    name: "get_reservation_details",
    description: "Read one reservation, including notes and contact details.",
    parameters: loose({ reservation_id: reservationId }, ["reservation_id"]),
  },
  get_reservation_pipeline_history: {
    name: "get_reservation_pipeline_history",
    description: "Read how a reservation moved through the pipeline.",
    parameters: loose({ reservation_id: reservationId }, ["reservation_id"]),
  },
  list_customers: {
    name: "list_customers",
    description: "List customer records.",
    parameters: loose({ search: text("Name or email"), limit: integer("Maximum rows") }),
  },
  get_customer: {
    name: "get_customer",
    description: "Read one customer.",
    parameters: loose({ customer_id: integer("Customer id") }, ["customer_id"]),
  },
  get_customer_history: {
    name: "get_customer_history",
    description: "Read a customer's past events and messages.",
    parameters: loose({ customer_id: integer("Customer id") }, ["customer_id"]),
  },
  list_proposals: {
    name: "list_proposals",
    description: "List proposals. Filter by reservation or status.",
    parameters: loose({
      reservation_id: reservationId,
      status: text("draft, scheduled, sent, accepted"),
    }),
  },
  get_proposal: {
    name: "get_proposal",
    description: "Read one proposal, including whether it has pricing.",
    parameters: loose({ proposal_id: proposalId }, ["proposal_id"]),
  },
  list_contracts: {
    name: "list_contracts",
    description: "List contracts.",
    parameters: loose({ reservation_id: reservationId }),
  },
  get_contract: {
    name: "get_contract",
    description: "Read one contract.",
    parameters: loose({ contract_id: integer("Contract id") }, ["contract_id"]),
  },
  get_envelope_status: {
    name: "get_envelope_status",
    description: "Read whether a contract envelope is waiting, viewed, or signed.",
    parameters: loose({ contract_id: integer("Contract id") }, ["contract_id"]),
  },
  list_follow_ups: {
    name: "list_follow_ups",
    description: "List open follow-ups.",
    parameters: loose({ reservation_id: reservationId }),
  },
  list_outbox_messages: {
    name: "list_outbox_messages",
    description: "List emails waiting in the couple outbox.",
    parameters: loose({ status: text("held, queued, sent") }),
  },
  outbox_summary: {
    name: "outbox_summary",
    description: "Count outbox messages by status.",
    parameters: loose({}),
  },
  check_availability: {
    name: "check_availability",
    description:
      "Check whether a date or range is open. This is the only source for a date's status. The castle is closed from 14 November through 31 March.",
    parameters: loose(
      {
        date: text("YYYY-MM-DD"),
        end_date: text("Optional end date YYYY-MM-DD"),
      },
      ["date"],
    ),
  },
  list_venue_availability: {
    name: "list_venue_availability",
    description: "List calendar blocks and open dates in a month.",
    parameters: loose({ month: text("YYYY-MM") }),
  },
  get_funnel_analytics: {
    name: "get_funnel_analytics",
    description: "Read pipeline counts. Do not invent conversion rates.",
    parameters: loose({}),
  },
  get_couple_profile: {
    name: "get_couple_profile",
    description: "Read the couple profile stored for a reservation.",
    parameters: loose({ reservation_id: reservationId }, ["reservation_id"]),
  },
  get_plan_overview: {
    name: "get_plan_overview",
    description: "Read the planning checklist for a reservation.",
    parameters: loose({ reservation_id: reservationId }, ["reservation_id"]),
  },
  get_price_list: {
    name: "get_price_list",
    description:
      "Read the live price list: packages and per-guest prices in whole euros. Null means on request.",
    parameters: loose({}),
  },
  estimate_pricing: {
    name: "estimate_pricing",
    description:
      "Estimate from the live price list for an event type, guest count, and date. Returns no number when the date is in the closed season.",
    parameters: loose(
      {
        event_type: text("wedding, corporate, or private"),
        guest_count: integer("Number of guests"),
        date: text("YYYY-MM-DD"),
      },
      ["event_type", "guest_count", "date"],
    ),
  },
  list_forms: {
    name: "list_forms",
    description: "List intake forms that can be assigned to a couple.",
    parameters: loose({}),
  },
  get_form: {
    name: "get_form",
    description: "Read one form.",
    parameters: loose({ form_id: integer("Form id") }, ["form_id"]),
  },
  search_knowledge: {
    name: "search_knowledge",
    description: "Search the venue knowledge base. Quote only what the articles say.",
    parameters: loose({ query: text("Search text") }, ["query"]),
  },
  create_reservation: {
    name: "create_reservation",
    description:
      "Create a reservation. Requires first_name and email. Does not email the couple when silent is true.",
    parameters: loose(
      {
        first_name: text("Given name"),
        last_name: text("Family name"),
        email: text("Email"),
        phone: text("Phone"),
        event_type: text("wedding, corporate, or private"),
        guest_count: integer("Guest count"),
        event_date: text("YYYY-MM-DD"),
        partner_first_name: text("Partner given name"),
        partner_last_name: text("Partner family name"),
        additional_notes: text("Notes already given by the couple or staff"),
        silent: { type: "boolean", description: "True skips couple emails. Default true." },
      },
      ["first_name", "email"],
    ),
  },
  update_reservation: {
    name: "update_reservation",
    description: "Change only the reservation fields you pass.",
    parameters: loose({ reservation_id: reservationId }, ["reservation_id"]),
  },
  update_reservation_status: {
    name: "update_reservation_status",
    description: "Move a reservation to a new pipeline status.",
    parameters: loose(
      {
        reservation_id: reservationId,
        new_status: text("A pipeline stage"),
      },
      ["reservation_id", "new_status"],
    ),
  },
  create_proposal: {
    name: "create_proposal",
    description: "Create a draft proposal. Prices are left blank for staff to complete.",
    parameters: loose(
      {
        reservation_id: reservationId,
        title: text("Proposal title"),
        intro: text("Intro text for the couple"),
      },
      ["reservation_id"],
    ),
  },
  reissue_proposal: {
    name: "reissue_proposal",
    description: "Make a fresh draft from an existing proposal. Sends nothing.",
    parameters: loose({ proposal_id: proposalId }, ["proposal_id"]),
  },
  cancel_proposal_send: {
    name: "cancel_proposal_send",
    description: "Cancel a scheduled proposal send that has not left yet.",
    parameters: loose({ proposal_id: proposalId }, ["proposal_id"]),
  },
  send_contract_for_signature: {
    name: "send_contract_for_signature",
    description: "Send a draft contract to the couple for their signature.",
    parameters: loose({ contract_id: integer("Contract id") }, ["contract_id"]),
  },
  send_custom_email: {
    name: "send_custom_email",
    description: "Send a custom email. The body must only contain facts already read.",
    parameters: loose(
      {
        to_email: text("Recipient"),
        subject: text("Subject"),
        body_html: text("HTML body"),
        body_text: text("Plain text body"),
      },
      ["to_email", "subject", "body_html"],
    ),
  },
  send_email: {
    name: "send_email",
    description: "Send a pre-approved template email.",
    parameters: loose(
      {
        to_email: text("Recipient"),
        template_type: text("Template id such as welcome or reminder"),
        variables: { type: "object", description: "Merge fields already read from the platform" },
      },
      ["to_email", "template_type"],
    ),
  },
  stop_follow_up: {
    name: "stop_follow_up",
    description: "Stop one follow-up sequence.",
    parameters: loose({ follow_up_id: integer("Follow-up id") }, ["follow_up_id"]),
  },
  add_couple_memory: {
    name: "add_couple_memory",
    description: "Save a note on the couple. Only store what staff or the couple actually said.",
    parameters: loose(
      {
        reservation_id: reservationId,
        memory: text("The note"),
      },
      ["reservation_id", "memory"],
    ),
  },
  add_plan_item: {
    name: "add_plan_item",
    description: "Add a planning item.",
    parameters: loose(
      {
        reservation_id: reservationId,
        title: text("Item title"),
      },
      ["reservation_id", "title"],
    ),
  },
  complete_plan_item: {
    name: "complete_plan_item",
    description: "Mark a planning item done.",
    parameters: loose({ plan_item_id: integer("Plan item id") }, ["plan_item_id"]),
  },
  assign_form: {
    name: "assign_form",
    description: "Assign a form to a reservation.",
    parameters: loose(
      {
        reservation_id: reservationId,
        form_id: integer("Form id"),
      },
      ["reservation_id", "form_id"],
    ),
  },
  set_availability_block: {
    name: "set_availability_block",
    description: "Mark a date blocked, closed, or available on the venue calendar.",
    parameters: loose(
      {
        date: text("YYYY-MM-DD"),
        status: text("blocked, closed, or available"),
      },
      ["date"],
    ),
  },
  generate_proposal_draft: {
    name: "generate_proposal_draft",
    description: "Write proposal text for staff to review. Saves nothing and sends nothing.",
    parameters: loose(
      {
        reservation_id: reservationId,
        notes: text("Context already gathered from reads"),
      },
      ["reservation_id"],
    ),
  },
  send_proposal: {
    name: "send_proposal",
    description:
      "Send a draft proposal to the couple. Refuses a proposal with no pricing. mode is schedule (default) or now.",
    parameters: loose(
      {
        proposal_id: proposalId,
        mode: text("schedule or now"),
      },
      ["proposal_id"],
    ),
  },
  create_contract: {
    name: "create_contract",
    description: "Create a draft contract. Signing is the couple's action and never happens here.",
    parameters: loose(
      {
        title: text("Contract title"),
        reservation_id: reservationId,
        proposal_id: proposalId,
        content_html: text("Contract body"),
      },
      ["title"],
    ),
  },
  release_outbox_message: {
    name: "release_outbox_message",
    description: "Release one held outbox message so it can send.",
    parameters: loose({ message_id: integer("Outbox message id") }, ["message_id"]),
  },
  discard_outbox_message: {
    name: "discard_outbox_message",
    description: "Discard one outbox message so it never sends.",
    parameters: loose({ message_id: integer("Outbox message id") }, ["message_id"]),
  },
  delete_reservation: {
    name: "delete_reservation",
    description: "Permanently delete one reservation and its dependent rows.",
    parameters: loose({ reservation_id: reservationId }, ["reservation_id"]),
  },
  list_upcoming_events: {
    name: "list_upcoming_events",
    description: "List confirmed events in the next N days, with open task counts.",
    parameters: loose({ days: integer("Look-ahead window, default 14") }),
  },
  get_event_sheet: {
    name: "get_event_sheet",
    description: "Read the run of show for one event.",
    parameters: loose({ reservation_id: reservationId }, ["reservation_id"]),
  },
  event_health: {
    name: "event_health",
    description: "Read open issues for one event.",
    parameters: loose({ reservation_id: reservationId }, ["reservation_id"]),
  },
  experience_control_tower: {
    name: "experience_control_tower",
    description: "Read the control tower summary for coming events.",
    parameters: loose({ days: integer("Look-ahead window") }),
  },
  list_control_tower_alerts: {
    name: "list_control_tower_alerts",
    description: "List open control-tower alerts.",
    parameters: loose({}),
  },
  list_event_vendors: {
    name: "list_event_vendors",
    description: "List vendors on an event.",
    parameters: loose({ reservation_id: reservationId }, ["reservation_id"]),
  },
  list_guests: {
    name: "list_guests",
    description: "List guests for an event.",
    parameters: loose({ reservation_id: reservationId }),
  },
  list_guest_requests: {
    name: "list_guest_requests",
    description: "List guest requests.",
    parameters: loose({ reservation_id: reservationId }),
  },
  get_event_weather: {
    name: "get_event_weather",
    description: "Read the forecast stored for an event.",
    parameters: loose({ reservation_id: reservationId }, ["reservation_id"]),
  },
  get_venue_weather: {
    name: "get_venue_weather",
    description: "Read the venue forecast for a date.",
    parameters: loose({ date: text("YYYY-MM-DD") }, ["date"]),
  },
  preview_department_briefing: {
    name: "preview_department_briefing",
    description: "Preview a department briefing. Sends nothing.",
    parameters: loose(
      {
        reservation_id: reservationId,
        department: text("kitchen, service, coordination, reception, housekeeping, or maintenance"),
      },
      ["reservation_id", "department"],
    ),
  },
  list_shifts: {
    name: "list_shifts",
    description: "List staff shifts.",
    parameters: loose({ date: text("YYYY-MM-DD") }),
  },
  list_staff: {
    name: "list_staff",
    description: "List staff on the house roster.",
    parameters: loose({}),
  },
  list_tasks: {
    name: "list_tasks",
    description: "List operational tasks.",
    parameters: loose({ reservation_id: reservationId, status: text("open or done") }),
  },
  list_incidents: {
    name: "list_incidents",
    description: "List incident reports.",
    parameters: loose({ reservation_id: reservationId }),
  },
  get_event_debrief: {
    name: "get_event_debrief",
    description: "Read the debrief for a finished event.",
    parameters: loose({ reservation_id: reservationId }, ["reservation_id"]),
  },
  event_preparation: {
    name: "event_preparation",
    description: "Start the preparation checklist for an event.",
    parameters: loose({ reservation_id: reservationId }, ["reservation_id"]),
  },
  invite_vendor: {
    name: "invite_vendor",
    description: "Invite a vendor onto an event.",
    parameters: loose(
      {
        reservation_id: reservationId,
        vendor_name: text("Vendor name"),
        role: text("What they are doing"),
      },
      ["reservation_id", "vendor_name"],
    ),
  },
  update_event_vendor: {
    name: "update_event_vendor",
    description: "Update a vendor on an event.",
    parameters: loose({ vendor_id: integer("Vendor row id") }, ["vendor_id"]),
  },
  update_guest: {
    name: "update_guest",
    description: "Update a guest.",
    parameters: loose({ guest_id: integer("Guest id") }, ["guest_id"]),
  },
  create_guest_request: {
    name: "create_guest_request",
    description: "Record a guest request that was actually made.",
    parameters: loose(
      {
        reservation_id: reservationId,
        request: text("What was asked"),
      },
      ["reservation_id", "request"],
    ),
  },
  update_guest_request_status: {
    name: "update_guest_request_status",
    description: "Update the status of a guest request.",
    parameters: loose(
      {
        request_id: integer("Request id"),
        status: text("open, done, or declined"),
      },
      ["request_id", "status"],
    ),
  },
  send_department_briefing: {
    name: "send_department_briefing",
    description: "Send a briefing to a department. Preview it first and reuse that text.",
    parameters: loose(
      {
        reservation_id: reservationId,
        department: text("Department"),
        body: text("Briefing text from the preview, plus only facts already read"),
      },
      ["reservation_id", "department"],
    ),
  },
  create_incident: {
    name: "create_incident",
    description:
      "Save an incident in the reporter's words. Never invent a severity, a person, or an action.",
    parameters: loose(
      {
        raw_description: text("What happened, in the reporter's words"),
        title: text("Short subject"),
        reservation_id: reservationId,
        department: text("coordination, reception, kitchen, service, housekeeping, or maintenance"),
        location: text("Where"),
      },
      ["raw_description"],
    ),
  },
  update_incident_status: {
    name: "update_incident_status",
    description: "Update an incident's status.",
    parameters: loose(
      {
        incident_id: integer("Incident id"),
        status: text("open, investigating, or closed"),
      },
      ["incident_id", "status"],
    ),
  },
  create_task: {
    name: "create_task",
    description: "Create an operational task.",
    parameters: loose(
      {
        title: text("Task"),
        reservation_id: reservationId,
        department: text("Department"),
      },
      ["title"],
    ),
  },
  update_task: {
    name: "update_task",
    description: "Update a task.",
    parameters: loose({ task_id: integer("Task id") }, ["task_id"]),
  },
  update_task_status: {
    name: "update_task_status",
    description: "Mark a task open or done.",
    parameters: loose(
      {
        task_id: integer("Task id"),
        status: text("open or done"),
      },
      ["task_id", "status"],
    ),
  },
  prepare_event_debrief: {
    name: "prepare_event_debrief",
    description: "Open a debrief from notes staff actually gave.",
    parameters: loose(
      {
        reservation_id: reservationId,
        notes: text("What staff reported"),
      },
      ["reservation_id"],
    ),
  },
};

export function schemaForModel(schema: JsonSchema): JsonSchema {
  const properties = { ...schema.properties };
  delete properties.confirm;
  const required = (schema.required ?? []).filter((key) => key !== "confirm");
  return { ...schema, properties, required };
}
