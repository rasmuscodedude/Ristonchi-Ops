import { APP_NAME, type AgentId, type StaffProfile } from "@ristonchi/shared";
import { useCallback, useEffect, useState } from "react";
import { Mark } from "./brand";
import { api, loadHealth } from "./lib/api";
import { AuditScreen } from "./screens/AuditScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";

type Route =
  | { name: "home" }
  | { name: "audit" }
  | { name: "chat"; agentId: AgentId; conversationId?: string };

const TOKEN_KEY = "ristonchi.token";

function parseRoute(path: string): Route {
  if (path.startsWith("/audit")) return { name: "audit" };
  const match = path.match(/^\/c\/(sales-couples|wedding-day)(?:\/([^/]+))?$/);
  if (match) {
    return {
      name: "chat",
      agentId: match[1] as AgentId,
      conversationId: match[2],
    };
  }
  return { name: "home" };
}

export function App() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [route, setRoute] = useState<Route>(() => parseRoute(location.pathname));
  const [demo, setDemo] = useState(false);

  const go = useCallback((path: string) => {
    history.pushState({}, "", path);
    setRoute(parseRoute(path));
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    loadHealth()
      .then((health) => setDemo(health.platformMode === "mock"))
      .catch(() => setDemo(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    api<{ staff: StaffProfile }>("/api/me", token)
      .then((body) => setStaff(body.staff))
      .catch(() => {
        sessionStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setStaff(null);
      });
  }, [token]);

  function signIn(next: string) {
    sessionStorage.setItem(TOKEN_KEY, next);
    setToken(next);
    go("/");
  }

  async function signOut() {
    if (token) await api("/api/auth/logout", token, { method: "POST" }).catch(() => undefined);
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setStaff(null);
    go("/");
  }

  if (!token || !staff) {
    return <LoginScreen onSignIn={signIn} />;
  }

  return (
    <div className="app">
      {demo ? (
        <p className="banner">
          Sample data. These are not real couples, and the prices are not live.
        </p>
      ) : null}
      <header className="topbar">
        <button className="brand" onClick={() => go("/")}>
          <Mark />
          <div className="brand-name">
            {APP_NAME.replace(" Staff", "")} <span>Staff</span>
          </div>
        </button>
        <nav className="nav">
          <button aria-current={route.name === "home" ? "page" : undefined} onClick={() => go("/")}>
            Agents
          </button>
          {staff.role === "admin" ? (
            <button
              aria-current={route.name === "audit" ? "page" : undefined}
              onClick={() => go("/audit")}
            >
              Audit
            </button>
          ) : null}
          <button onClick={() => void signOut()}>Sign out</button>
        </nav>
      </header>
      {route.name === "home" ? (
        <HomeScreen
          token={token}
          staff={staff}
          onOpen={(agentId, conversationId) =>
            go(conversationId ? `/c/${agentId}/${conversationId}` : `/c/${agentId}`)
          }
        />
      ) : null}
      {route.name === "chat" ? (
        <ChatScreen
          token={token}
          agentId={route.agentId}
          conversationId={route.conversationId}
          onConversation={(id) => {
            history.replaceState({}, "", `/c/${route.agentId}/${id}`);
            setRoute({ name: "chat", agentId: route.agentId, conversationId: id });
          }}
        />
      ) : null}
      {route.name === "audit" ? <AuditScreen token={token} /> : null}
    </div>
  );
}
