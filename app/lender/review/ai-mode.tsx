"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Preference = { enabled: boolean; epoch: string };
export default function AiMode({ applicationId, userId }: { applicationId: string; userId?: string }) {
  const [preference, setPreference] = useState<Preference | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const scope = `${userId || ""}:${applicationId}`;
  const latestScope = useRef(scope); latestScope.current = scope;
  const url = `/api/ai/preference?applicationId=${encodeURIComponent(applicationId)}`;
  const load = useCallback(async () => {
    const response = await fetch(`/api/ai/status?applicationId=${encodeURIComponent(applicationId)}`, {cache:"no-store"});
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load your AI mode.");
    if (latestScope.current === scope && !saving.current) setPreference(body.preference);
  }, [applicationId, scope]);
  useEffect(() => {
    setPreference(null); setError("");
    if (!userId) return;
    let stopped = false;
    const refresh = () => {if (!stopped && !saving.current) void load().catch(e => {if (!stopped) setError(e instanceof Error ? e.message : "Could not load AI mode.");});};
    refresh(); window.addEventListener("focus",refresh);
    return () => {stopped=true;window.removeEventListener("focus",refresh);};
  }, [load, userId]);
  async function toggle() {
    if (!preference || saving.current) return;
    saving.current=true;setBusy(true);setError("");
    try {
      const response=await fetch(url,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:!preference.enabled,expectedEpoch:preference.epoch})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error || "Could not save your AI mode.");
      if(latestScope.current===scope)setPreference(body);
    } catch(e) {
      if(latestScope.current===scope)setError(e instanceof Error?e.message:"Could not save AI mode.");
    } finally {saving.current=false;setBusy(false);}
  }
  return <div className="ai-mode-control">
    <button type="button" role="switch" aria-label="AI mode" aria-checked={preference?.enabled === true} aria-describedby="ai-mode-help" disabled={!preference || busy} onClick={toggle}><span className="ai-mode-track" aria-hidden="true"><span /></span>AI mode{busy ? " · Saving…" : ""}</button>
    <details><summary aria-label="About AI mode">Info</summary><p id="ai-mode-help">Your personal setting across applications. It does not change anyone else’s AI mode or start a check. You can still explicitly use AI to verify a requirement when this is off. Checks use supported evidence with OpenRouter and its model provider.</p></details>
    {error && <span className="ai-mode-status" role="alert">{error}<button type="button" disabled={busy} onClick={() => load().then(()=>setError("")).catch(e=>setError(e instanceof Error?e.message:"Could not refresh AI mode."))}>Refresh</button></span>}
  </div>;
}
