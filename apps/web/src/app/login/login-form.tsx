"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { api, errorMessage } from "@/lib/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("engineer@vectrix.pt");
  const [password, setPassword] = useState("VectrixDemo!2026");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api<{ user: unknown }>("/api/auth/login", {
        method: "POST",
        json: { email, password },
      });
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <div className="login-error" role="alert">
          <span
            aria-hidden="true"
            className="mono"
            style={{ fontWeight: 700, fontSize: 10, paddingTop: 1 }}
          >
            !
          </span>
          <span>{error}</span>
        </div>
      )}
      <div className="login-field">
        <label className="field-label" htmlFor="email">
          Work email
        </label>
        <input
          id="email"
          className="field"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          spellCheck={false}
        />
      </div>
      <div className="login-field">
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="field"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      <button className="btn btn-primary login-submit" type="submit" disabled={pending}>
        {pending ? (
          <>
            <LoaderCircle size={15} className="spin" aria-hidden="true" />
            Signing in…
          </>
        ) : (
          <>
            Enter workspace
            <ArrowRight size={15} aria-hidden="true" />
          </>
        )}
      </button>
      <style>{`.spin{animation:spin 900ms linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </form>
  );
}
