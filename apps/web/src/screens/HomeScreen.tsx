import type { AgentInfo, ConversationSummary, StaffProfile } from "@ristonchi/shared";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function HomeScreen({
  token,
  staff,
  onOpen,
}: {
  token: string;
  staff: StaffProfile;
  onOpen: (agentId: AgentInfo["id"], conversationId?: string) => void;
}) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  useEffect(() => {
    api<{ agents: AgentInfo[] }>("/api/agents", token).then((body) => setAgents(body.agents));
    api<{ conversations: ConversationSummary[] }>("/api/conversations", token).then((body) =>
      setConversations(body.conversations),
    );
  }, [token]);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="kicker">{staff.role.replaceAll("_", " ")}</p>
          <h1>Good day, {staff.name}.</h1>
        </div>
        <p className="lede">
          Choose the desk you are working. Each assistant can only touch the part of Norberto your
          role allows, and it will stop before it changes anything.
        </p>
      </section>
      {agents.length ? (
        <div className="cards">
          {agents.map((agent) => (
            <button key={agent.id} className="card" onClick={() => onOpen(agent.id)}>
              <p className="kicker">Agent</p>
              <h2>{agent.title}</h2>
              <p>{agent.blurb}</p>
            </button>
          ))}
        </div>
      ) : (
        <p className="empty">Your role does not have an assistant yet.</p>
      )}
      {conversations.length ? (
        <section>
          <h2 style={{ margin: "36px 0 12px" }}>Recent</h2>
          <div className="cards">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className="card"
                onClick={() => onOpen(conversation.agentId, conversation.id)}
              >
                <p className="kicker">
                  {conversation.agentId === "sales-couples" ? "Sales" : "Wedding day"}
                </p>
                <p>{conversation.title}</p>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
