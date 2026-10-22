"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { apiSend } from "@/lib/fetcher";

export function PlaidLinkButton({
  onLinked,
  label = "Connect account",
  disabled = false,
}: {
  onLinked: () => void;
  label?: string;
  disabled?: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSuccess = useCallback(
    async (publicToken: string | null, metadata: any) => {
      if (!publicToken) return;
      setBusy(true);
      setError(null);
      try {
        await apiSend("/api/plaid/exchange", "POST", {
          public_token: publicToken,
          institution_name: metadata?.institution?.name ?? null,
          institution_id: metadata?.institution?.institution_id ?? null,
        });
        setToken(null);
        onLinked();
      } catch (e: any) {
        setError(e.message || "Failed to link account");
      } finally {
        setBusy(false);
      }
    },
    [onLinked]
  );

  const { open, ready } = usePlaidLink({ token: token ?? "", onSuccess });

  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend("/api/plaid/create-link-token", "POST");
      setToken(res.link_token);
    } catch (e: any) {
      setError(e.message || "Failed to start Plaid Link");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn-primary" onClick={start} disabled={disabled || busy}>
        {busy ? "Working…" : label}
      </button>
      {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
