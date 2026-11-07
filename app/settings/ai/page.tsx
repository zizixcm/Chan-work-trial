"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function AiSettings() {
  const [configuration, setConfiguration] = useState<{ configured: boolean; model: string }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/ai/connection", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error();
        setConfiguration(await response.json());
      })
      .catch(() => setMessage("Could not load connection settings. Refresh to retry."));
  }, []);
  async function check() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/ai/connection", {
        method: "POST", headers: { "X-Portal-AI-Check": "1" },
      });
      const body = await response.json();
      setMessage(response.ok ? `Connected. Model response: ${body.message}` : body.error);
    } catch {
      setMessage("Connection interrupted. You can try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main style={{ maxWidth: 720, margin: "64px auto", padding: 24, lineHeight: 1.7 }}>
      <Link href="/">← Back to application</Link>
      <h1>AI connection</h1>
      <p>Mastra connects to OpenRouter using your server-side API key.</p>
      <p>Key: {configuration ? (configuration.configured ? "Configured (hidden)" : "Not configured") : "Loading…"}</p>
      <p>Model: {configuration?.model || "Loading…"}</p>
      <p>This check sends a fixed sample message and may use a small amount of OpenRouter credit. It does not send uploaded files or enable borrower document analysis.</p>
      <button type="button" onClick={check} disabled={busy || !configuration?.configured} style={{ padding: "10px 18px", marginTop: 16 }}>
        {busy ? "Checking connection…" : "Check connection"}
      </button>
      <p role="status" aria-live="polite">{message}</p>
    </main>
  );
}
