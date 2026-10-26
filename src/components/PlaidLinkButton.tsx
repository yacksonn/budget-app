"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { apiSend } from "@/lib/fetcher";

// Pass `itemId` to open Link in update mode (repair an existing item's login) instead of
// linking a new institution.
export function PlaidLinkButton({
  onLinked,
  label = "Connect account",
  disabled = false,
  itemId,
  className = "btn-primary",
}: {
  onLinked: () => void;
  label?: string;
  disabled?: boolean;
  itemId?: string;
  className?: string;
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
        // Update mode keeps the existing access token, so there's nothing to exchange.
        if (!itemId) {
          await apiSend("/api/plaid/exchange", "POST", {
            public_token: publicToken,
            institution_name: metadata?.institution?.name ?? null,
            institution_id: metadata?.institution?.institution_id ?? null,
          });
        }
        setToken(null);
        onLinked();
      } catch (e: any) {
        setError(e.message || "Failed to link account");
      } finally {
        setBusy(false);
      }
    },
    [onLinked, itemId]
  );

  const { open, ready } = usePlaidLink({
    token: token ?? "",
    onSuccess,
    // Closing Link without finishing must re-enable the button.
    onExit: () => {
      setToken(null);
      setBusy(false);
    },
  });

  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend(
        "/api/plaid/create-link-token",
        "POST",
        itemId ? { itemId } : undefined
      );
      setToken(res.link_token);
    } catch (e: any) {
      setError(e.message || "Failed to start Plaid Link");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button className={className} onClick={start} disabled={disabled || busy}>
        {busy ? "Working…" : label}
      </button>
      {error && <p className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
