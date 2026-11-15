export const AGENT_IDS = ["sales-couples", "wedding-day"] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export type AgentInfo = {
  id: AgentId;
  title: string;
  blurb: string;
  suggestions: string[];
};

export const AGENTS: readonly AgentInfo[] = [
  {
    id: "sales-couples",
    title: "Sales / Couples",
    blurb:
      "The pipeline, proposals, contracts, and the couple's plan. Built for Stefanie and the sales desk.",
    suggestions: [
      "Which couples have a proposal waiting?",
      "Is 19 June 2027 open?",
      "Estimate a Saturday wedding for 120 guests on 19 June 2027",
      "Send the Varga proposal",
    ],
  },
  {
    id: "wedding-day",
    title: "Wedding-day coordinator",
    blurb: "The day itself: the run of show, guests, vendors, weather, and messages to the house.",
    suggestions: [
      "What weddings are on the books through next summer?",
      "Show me the sheet for the next confirmed wedding",
      "What is the weather for that wedding?",
      "Send the kitchen briefing for the next wedding",
    ],
  },
] as const;

export function isAgentId(value: unknown): value is AgentId {
  return value === "sales-couples" || value === "wedding-day";
}

export function agentInfo(id: AgentId): AgentInfo {
  const found = AGENTS.find((agent) => agent.id === id);
  if (!found) {
    throw new Error(`Unknown agent ${id}`);
  }
  return found;
}
