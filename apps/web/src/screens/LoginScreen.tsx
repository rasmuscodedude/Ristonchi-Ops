import { APP_NAME, type HealthResponse } from "@ristonchi/shared";
import { useEffect, useState, type FormEvent } from "react";
import { Mark } from "../brand";
import { ApiError, api, loadHealth } from "../lib/api";

export function LoginScreen({ onSignIn }: { onSignIn: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    loadHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = await api<{ token: string }>("/api/auth/login", null, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onSignIn(body.token);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The desk is not answering.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="card login-card" onSubmit={(event) => void submit(event)}>
        <Mark />
        <p className="kicker">Castello di Ristonchi</p>
        <h1>{APP_NAME.replace(" Staff", "")}</h1>
        <p className="lede">For the people who host the day. Sign in with your Norberto account.</p>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error ? <p className="error">{error}</p> : null}
        <p>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Signing in" : "Sign in"}
          </button>
        </p>
        {health?.demo ? (
          <div className="demo">
            <p>This desk is on sample data. The shared password is {health.demo.password}.</p>
            <ul>
              {health.demo.accounts.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(health.demo?.password ?? "");
                    }}
                  >
                    {account.name}
                  </button>{" "}
                  {account.note}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </form>
    </main>
  );
}
