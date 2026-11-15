import type { AuditEntry } from "@ristonchi/shared";
import { useEffect, useState } from "react";
import { titleCaseTool } from "../brand";
import { ApiError, api } from "../lib/api";

export function AuditScreen({ token }: { token: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ entries: AuditEntry[] }>("/api/audit", token)
      .then((body) => setEntries(body.entries))
      .catch((cause) =>
        setError(cause instanceof ApiError ? cause.message : "Could not load the log."),
      );
  }, [token]);

  return (
    <main className="shell">
      <p className="kicker">Admin</p>
      <h1>Audit</h1>
      <p className="lede">
        Every tool the assistants touched, who asked, and whether a person approved it.
      </p>
      {error ? <p className="error">{error}</p> : null}
      <div className="audit">
        {entries.map((entry) => (
          <article key={entry.id} className="audit-row">
            <div>
              <div className="who">{entry.staffName}</div>
              <div className="meta">{new Date(entry.at).toLocaleString()}</div>
            </div>
            <div>
              <div>{titleCaseTool(entry.tool)}</div>
              <div className="meta">{entry.agentId}</div>
            </div>
            <div className="meta">{JSON.stringify(entry.args)}</div>
            <div className={`status-${entry.status}`}>
              {entry.status}
              {entry.approved === true
                ? ", approved"
                : entry.approved === false
                  ? ", not approved"
                  : ""}
            </div>
          </article>
        ))}
        {!entries.length && !error ? <p className="empty">Nothing has been called yet.</p> : null}
      </div>
    </main>
  );
}
