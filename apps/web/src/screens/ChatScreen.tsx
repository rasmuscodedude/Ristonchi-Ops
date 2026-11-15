import {
  agentInfo,
  type AgentId,
  type ChatEvent,
  type ConversationResponse,
} from "@ristonchi/shared";
import { useEffect, useRef, useState } from "react";
import { titleCaseTool } from "../brand";
import { ApiError, api, stream } from "../lib/api";

type Item =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "tool"; id: string; tool: string; result: unknown }
  | {
      kind: "approval";
      id: string;
      approvalId: string;
      tool: string;
      args: Record<string, unknown>;
      highConfirm: boolean;
      priorRead: boolean;
      status: string;
    };

let localId = 0;
const nextId = () => `local-${localId++}`;

export function ChatScreen({
  token,
  agentId,
  conversationId,
  onConversation,
}: {
  token: string;
  agentId: AgentId;
  conversationId?: string;
  onConversation: (id: string) => void;
}) {
  const agent = agentInfo(agentId);
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState(conversationId);
  const scroller = useRef<HTMLDivElement>(null);
  const loadedId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!conversationId) {
      loadedId.current = undefined;
      setActiveId(undefined);
      setItems([]);
      return;
    }
    if (loadedId.current === conversationId) {
      setActiveId(conversationId);
      return;
    }
    loadedId.current = conversationId;
    setActiveId(conversationId);
    api<ConversationResponse>(`/api/conversations/${conversationId}`, token)
      .then((body) => setItems(body.items.map(toItem)))
      .catch((cause) =>
        setError(cause instanceof ApiError ? cause.message : "Could not open this conversation."),
      );
  }, [conversationId, token]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [items, busy]);

  function apply(event: ChatEvent) {
    if (event.type === "meta") {
      loadedId.current = event.conversationId;
      setActiveId(event.conversationId);
      onConversation(event.conversationId);
    } else if (event.type === "token") {
      setItems((current) => appendToken(current, event.text));
    } else if (event.type === "tool_result") {
      setItems((current) => [
        ...current,
        { kind: "tool", id: event.callId, tool: event.tool, result: event.result },
      ]);
    } else if (event.type === "approval_required") {
      setItems((current) => [
        ...current,
        {
          kind: "approval",
          id: event.approvalId,
          approvalId: event.approvalId,
          tool: event.tool,
          args: event.args,
          highConfirm: event.highConfirm,
          priorRead: event.priorRead,
          status: "pending",
        },
      ]);
    } else if (event.type === "notice") {
      setItems((current) => appendToken(current, event.text));
    } else if (event.type === "error") {
      setError(event.message);
    }
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setError("");
    setBusy(true);
    setItems((current) => [...current, { kind: "user", id: nextId(), text: message }]);
    try {
      await stream("/api/chat", token, { agentId, conversationId: activeId, message }, apply);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The assistant stopped.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(approvalId: string, decision: "approve" | "reject") {
    setBusy(true);
    setError("");
    setItems((current) =>
      current.map((item) =>
        item.kind === "approval" && item.approvalId === approvalId
          ? { ...item, status: decision === "approve" ? "executing" : "rejected" }
          : item,
      ),
    );
    try {
      await stream(`/api/approvals/${approvalId}`, token, { decision }, (event) => {
        if (event.type === "tool_result") {
          setItems((current) =>
            current.map((item) =>
              item.kind === "approval" && item.approvalId === approvalId
                ? { ...item, status: "executed" }
                : item,
            ),
          );
        }
        apply(event);
      });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The approval could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      <div className="transcript" ref={scroller}>
        <p className="kicker">{agent.title}</p>
        {!items.length ? (
          <div>
            <h1>{agent.title}</h1>
            <p className="lede">{agent.blurb}</p>
            <div className="suggestions">
              {agent.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="chip"
                  onClick={() => void send(suggestion)}
                  disabled={busy}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {items.map((item) => {
          if (item.kind === "user")
            return (
              <div key={item.id} className="bubble user">
                {item.text}
              </div>
            );
          if (item.kind === "assistant")
            return (
              <div key={item.id} className="bubble assistant">
                {item.text}
              </div>
            );
          if (item.kind === "tool") {
            return (
              <details key={item.id} className="tool">
                <summary>Norberto: {titleCaseTool(item.tool)}</summary>
                <pre>{JSON.stringify(item.result, null, 2)}</pre>
              </details>
            );
          }
          return (
            <article key={item.id} className="approval">
              <header>
                <p className="eyebrow">
                  {item.status === "pending" ? "Needs your approval" : item.status}
                </p>
                <strong>{titleCaseTool(item.tool)}</strong>
              </header>
              {item.highConfirm ? (
                <p className="high">
                  High-confirm. Nothing is sent until you approve, and only then does Norberto
                  receive confirm.
                </p>
              ) : (
                <p>This changes Norberto. It does not run until you approve.</p>
              )}
              {!item.priorRead ? (
                <p className="warn">
                  No live read has happened yet in this conversation. Check every fact before you
                  approve.
                </p>
              ) : null}
              <dl>
                {Object.entries(item.args).map(([key, value]) => (
                  <span key={key} style={{ display: "contents" }}>
                    <dt>{key}</dt>
                    <dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd>
                  </span>
                ))}
              </dl>
              {item.status === "pending" ? (
                <div className="actions">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void decide(item.approvalId, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    className="quiet"
                    disabled={busy}
                    onClick={() => void decide(item.approvalId, "reject")}
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <p className="resolved">
                  {item.status === "rejected" ? "Rejected. Nothing was changed." : "Recorded."}
                </p>
              )}
            </article>
          );
        })}
        {error ? <p className="error">{error}</p> : null}
      </div>
      <div className="composer">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <textarea
            aria-label="Message"
            placeholder="Ask about a couple, a date, or the day"
            value={draft}
            rows={2}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          <button className="primary" type="submit" disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

function toItem(item: ConversationResponse["items"][number]): Item {
  if (item.kind === "user") return { kind: "user", id: item.id, text: item.text };
  if (item.kind === "assistant") return { kind: "assistant", id: item.id, text: item.text };
  if (item.kind === "tool")
    return { kind: "tool", id: item.id, tool: item.tool, result: item.result };
  return {
    kind: "approval",
    id: item.id,
    approvalId: item.approvalId,
    tool: item.tool,
    args: item.args,
    highConfirm: item.highConfirm,
    priorRead: item.priorRead,
    status: item.status,
  };
}

function appendToken(items: Item[], text: string): Item[] {
  const last = items.at(-1);
  if (last?.kind === "assistant") {
    return [...items.slice(0, -1), { ...last, text: last.text + text }];
  }
  return [...items, { kind: "assistant", id: nextId(), text }];
}
