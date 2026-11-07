"use client";
import { useCallback, useEffect, useState } from "react";
import type { LenderSnapshot } from "@/lib/model";
export function useApplication() {
  const [data, setData] = useState<LenderSnapshot | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const applicationId = new URLSearchParams(window.location.search).get("applicationId");
      const r = await fetch(`/api/lender${applicationId ? `?applicationId=${encodeURIComponent(applicationId)}` : ""}`, { cache: "no-store" });
      if (r.status === 401) { location.assign("/login"); return; }
      const b = await r.json();
      if (!r.ok) { setData(null); throw new Error(b.error); }
      setData(b);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load application.");
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { data, setData, error, refresh };
}
