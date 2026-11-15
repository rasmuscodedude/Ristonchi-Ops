/**
 * Fictional weddings for local development.
 * Nothing in this file is a real couple, a live price, or a real guest.
 * Stefanie is named because the sales agent is hers. The other people are samples.
 */

export type Reservation = {
  id: number;
  confirmation_number: string;
  first_name: string;
  last_name: string;
  partner_first_name: string;
  partner_last_name: string;
  email: string;
  phone: string;
  country: string;
  event_type: string;
  guest_count: number;
  event_date: string | null;
  status: string;
  owner: string;
  additional_notes: string;
  customer_id: number;
};

export type Proposal = {
  id: number;
  reservation_id: number;
  title: string;
  status: "draft" | "scheduled" | "sent" | "accepted";
  intro: string;
  has_pricing: boolean;
  pricing_note: string;
};

export type Contract = {
  id: number;
  reservation_id: number;
  proposal_id: number | null;
  title: string;
  status: "draft" | "sent" | "signed";
  envelope: "not_sent" | "waiting" | "viewed" | "signed";
};

export type OutboxMessage = {
  id: number;
  reservation_id: number;
  to_email: string;
  subject: string;
  status: "held" | "queued" | "sent" | "discarded";
  body_text: string;
};

export type FollowUp = {
  id: number;
  reservation_id: number;
  due: string;
  reason: string;
  status: "open" | "stopped";
};

export type PlanItem = {
  id: number;
  reservation_id: number;
  title: string;
  status: "open" | "done";
};

export type Guest = {
  id: number;
  reservation_id: number;
  name: string;
  notes: string;
};

export type GuestRequest = {
  id: number;
  reservation_id: number;
  request: string;
  status: "open" | "done" | "declined";
};

export type Vendor = {
  id: number;
  reservation_id: number;
  vendor_name: string;
  role: string;
  status: "invited" | "confirmed";
};

export type Task = {
  id: number;
  reservation_id: number | null;
  title: string;
  department: string;
  status: "open" | "done";
};

export type Incident = {
  id: number;
  reservation_id: number | null;
  title: string;
  raw_description: string;
  department: string;
  location: string;
  status: "open" | "investigating" | "closed";
};

export type Memory = {
  id: number;
  reservation_id: number;
  memory: string;
};

export type CalendarBlock = {
  date: string;
  status: "blocked" | "closed" | "available" | "held";
  reason: string;
};

export type VenueData = {
  nextId: number;
  reservations: Reservation[];
  proposals: Proposal[];
  contracts: Contract[];
  outbox: OutboxMessage[];
  followUps: FollowUp[];
  planItems: PlanItem[];
  guests: Guest[];
  guestRequests: GuestRequest[];
  vendors: Vendor[];
  tasks: Task[];
  incidents: Incident[];
  memories: Memory[];
  blocks: CalendarBlock[];
  briefings: Array<{ id: number; reservation_id: number; department: string; body: string }>;
  debriefs: Array<{ reservation_id: number; notes: string; status: string }>;
  sample: true;
};

export function createVenueData(): VenueData {
  return {
    nextId: 2000,
    sample: true,
    reservations: [
      {
        id: 1042,
        confirmation_number: "R-1042",
        first_name: "Elena",
        last_name: "Varga",
        partner_first_name: "Tomas",
        partner_last_name: "Ricci",
        email: "elena.varga@example.com",
        phone: "+46 70 000 1042",
        country: "Sweden",
        event_type: "wedding",
        guest_count: 120,
        event_date: "2027-06-19",
        status: "qualified",
        owner: "Stefanie",
        additional_notes:
          "Draft proposal 501 has sample pricing and has not been sent. Sample record.",
        customer_id: 42,
      },
      {
        id: 1043,
        confirmation_number: "R-1043",
        first_name: "Chiara",
        last_name: "Neri",
        partner_first_name: "Paolo",
        partner_last_name: "Greco",
        email: "chiara.neri@example.com",
        phone: "+39 333 000 1043",
        country: "Italy",
        event_type: "wedding",
        guest_count: 90,
        event_date: "2027-09-11",
        status: "contract_sent",
        owner: "Stefanie",
        additional_notes: "Contract is with them. Sample record.",
        customer_id: 43,
      },
      {
        id: 1044,
        confirmation_number: "R-1044",
        first_name: "Samira",
        last_name: "Haddad",
        partner_first_name: "Jonah",
        partner_last_name: "Adler",
        email: "samira.haddad@example.com",
        phone: "+1 415 555 0144",
        country: "United States",
        event_type: "wedding",
        guest_count: 80,
        event_date: null,
        status: "inquiry",
        owner: "Stefanie",
        additional_notes: "Summer 2027, dates flexible. Sample record.",
        customer_id: 44,
      },
      {
        id: 1045,
        confirmation_number: "R-1045",
        first_name: "Ingrid",
        last_name: "Holm",
        partner_first_name: "Lars",
        partner_last_name: "Berg",
        email: "ingrid.holm@example.com",
        phone: "+45 20 00 10 45",
        country: "Denmark",
        event_type: "wedding",
        guest_count: 70,
        event_date: "2027-04-17",
        status: "confirmed",
        owner: "Wedding desk",
        additional_notes: "First confirmed wedding after the winter closure. Sample record.",
        customer_id: 45,
      },
    ],
    proposals: [
      {
        id: 501,
        reservation_id: 1042,
        title: "Varga and Ricci, 19 June 2027",
        status: "draft",
        intro: "A draft for staff review. Sample text, not a live proposal.",
        has_pricing: true,
        pricing_note: "Staff entered the sample Saturday peak package and dinner for 120 guests.",
      },
      {
        id: 502,
        reservation_id: 1043,
        title: "Neri and Greco, 11 September 2027",
        status: "sent",
        intro: "Already sent in this sample.",
        has_pricing: true,
        pricing_note: "Sample pricing was completed before send.",
      },
    ],
    contracts: [
      {
        id: 301,
        reservation_id: 1043,
        proposal_id: 502,
        title: "Contract, Neri and Greco",
        status: "sent",
        envelope: "waiting",
      },
    ],
    outbox: [
      {
        id: 801,
        reservation_id: 1044,
        to_email: "samira.haddad@example.com",
        subject: "A note from Castello di Ristonchi",
        status: "held",
        body_text: "Held sample email. It has not been sent.",
      },
    ],
    followUps: [
      {
        id: 901,
        reservation_id: 1044,
        due: "2026-11-20",
        reason: "Ask which June or September weekends they want us to check.",
        status: "open",
      },
    ],
    planItems: [
      { id: 701, reservation_id: 1045, title: "Confirm the menu tasting date", status: "open" },
      {
        id: 702,
        reservation_id: 1042,
        title: "Complete proposal pricing in the editor",
        status: "done",
      },
    ],
    guests: [
      { id: 601, reservation_id: 1045, name: "Sample guest A", notes: "Vegetarian" },
      { id: 602, reservation_id: 1045, name: "Sample guest B", notes: "" },
    ],
    guestRequests: [
      {
        id: 611,
        reservation_id: 1045,
        request: "A quiet room for a grandparent after dinner",
        status: "open",
      },
    ],
    vendors: [
      {
        id: 621,
        reservation_id: 1045,
        vendor_name: "Sample flowers",
        role: "Florals",
        status: "confirmed",
      },
    ],
    tasks: [
      {
        id: 631,
        reservation_id: 1045,
        title: "Walk the lemon garden layout",
        department: "coordination",
        status: "open",
      },
    ],
    incidents: [
      {
        id: 641,
        reservation_id: null,
        title: "Scuffed chair",
        raw_description:
          "One ceremony chair arrived with a scuffed leg. Sample incident, already closed.",
        department: "housekeeping",
        location: "Store room",
        status: "closed",
      },
    ],
    memories: [
      {
        id: 651,
        reservation_id: 1042,
        memory: "They met in Florence and want the vows outdoors if the weather holds.",
      },
    ],
    blocks: [{ date: "2027-06-20", status: "held", reason: "Sample hold, not a booking." }],
    briefings: [],
    debriefs: [],
  };
}

export function venueClosed(isoDate: string): boolean {
  const monthDay = isoDate.slice(5);
  return monthDay >= "11-14" || monthDay <= "03-31";
}

export const SAMPLE_PRICE_LIST = {
  sample: true,
  version: "sample-2026",
  note: "Fictional prices for the local mock. Live prices come from Norberto.",
  currency: "EUR",
  closed_season: "14 November through 31 March",
  packages: [
    { id: "saturday-peak", name: "Saturday exclusive use, May June September", price_eur: 22000 },
    {
      id: "saturday-shoulder",
      name: "Saturday exclusive use, other open months",
      price_eur: 18000,
    },
    { id: "friday-exclusive", name: "Friday exclusive use", price_eur: 15000 },
    { id: "dinner", name: "Seated dinner, per guest", price_eur: 145 },
    { id: "aperitivo", name: "Welcome aperitivo, per guest", price_eur: 28 },
  ],
};
