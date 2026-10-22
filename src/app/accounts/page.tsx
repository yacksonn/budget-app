"use client";

import useSWR from "swr";
import { useState } from "react";
import { fetcher, apiSend } from "@/lib/fetcher";
import { formatCurrency } from "@/lib/format";
import { PlaidLinkButton } from "@/components/PlaidLinkButton";

export default function AccountsPage() {
  const { data, mutate, isLoading } = useSWR("/api/accounts", fetcher);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const items = data?.items ?? [];
  const configured = data?.plaidConfigured;

  async function sync() {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await apiSend("/api/plaid/sync", "POST");
      const t = res.totals;
      setMsg(`Synced: ${t.added} added, ${t.modified} updated, ${t.removed} removed.`);
      mutate();
    } catch (e: any) {
      setMsg(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect(itemId: string) {
    if (!confirm("Disconnect this institution and delete its transactions?")) return;
    await apiSend(`/api/accounts?itemId=${itemId}`, "DELETE");
    mutate();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-sm text-ink-muted">
            Connect banks through Plaid and sync transactions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={sync} disabled={syncing || !items.length}>
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <PlaidLinkButton onLinked={() => mutate()} disabled={!configured} />
        </div>
      </div>

      {msg && <p className="text-sm text-ink-soft">{msg}</p>}

      {!isLoading && !configured && (
        <div className="card border-amber-200 bg-amber-50">
          <h2 className="font-semibold text-amber-900">Plaid not configured</h2>
          <p className="mt-1 text-sm text-amber-800">
            Add your sandbox credentials to <code>.env</code>, then restart the dev server:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-amber-900/90 p-3 text-xs text-amber-50">{`PLAID_CLIENT_ID="your_client_id"
PLAID_SECRET="your_sandbox_secret"
PLAID_ENV="sandbox"`}</pre>
          <p className="mt-2 text-sm text-amber-800">
            Get free keys at{" "}
            <a
              className="underline"
              href="https://dashboard.plaid.com/"
              target="_blank"
              rel="noreferrer"
            >
              dashboard.plaid.com
            </a>
            . In sandbox, log in with <code>user_good</code> / <code>pass_good</code>.
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="card text-center">
          <p className="text-sm text-ink-muted">
            No accounts connected yet. Click <strong>Connect account</strong> to link a bank.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item: any) => (
            <div key={item.id} className="card">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">
                  {item.institutionName || "Institution"}
                </h2>
                <button
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => disconnect(item.id)}
                >
                  Disconnect
                </button>
              </div>
              <div className="mt-3 divide-y divide-surface-border">
                {item.accounts.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium">
                        {a.name}
                        {a.mask ? (
                          <span className="text-ink-muted"> ····{a.mask}</span>
                        ) : null}
                      </p>
                      <p className="text-xs capitalize text-ink-muted">
                        {a.subtype || a.type} · {a._count.transactions} transactions
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {formatCurrency(a.currentBalance ?? 0, a.currencyCode || "USD")}
                      </p>
                      {a.availableBalance != null && (
                        <p className="text-xs text-ink-muted">
                          {formatCurrency(a.availableBalance, a.currencyCode || "USD")} available
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
