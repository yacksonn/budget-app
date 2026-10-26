"use client";

import useSWR from "swr";
import { useState } from "react";
import { fetcher, apiSend, invalidate } from "@/lib/fetcher";
import { formatCurrency } from "@/lib/format";
import { PlaidLinkButton } from "@/components/PlaidLinkButton";

export default function AccountsPage() {
  const { data, isLoading } = useSWR("/api/accounts", fetcher);
  const [syncing, setSyncing] = useState(false);
  const [resyncing, setResyncing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const items = data?.items ?? [];
  const configured = data?.plaidConfigured;

  async function sync() {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await apiSend("/api/plaid/sync", "POST");
      const t = res.totals;
      setMsg(
        `Synced: ${t.added} added, ${t.modified} updated, ${t.removed} removed.` +
          (res.failed ? ` ${res.failed} institution(s) failed — see below.` : "")
      );
      await invalidate();
    } catch (e: any) {
      setMsg(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function resync(itemId: string) {
    setResyncing(itemId);
    try {
      await apiSend("/api/plaid/sync", "POST", { itemId });
    } catch {
      // per-item outcome is persisted on the item and shown in its status
    } finally {
      await invalidate();
      setResyncing(null);
    }
  }

  async function disconnect(itemId: string) {
    if (!confirm("Disconnect this institution and delete its transactions?")) return;
    await apiSend(`/api/accounts?itemId=${itemId}`, "DELETE");
    invalidate();
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
          <button
            className="btn-ghost inline-flex items-center gap-2"
            onClick={sync}
            disabled={syncing || !items.length}
          >
            {syncing && <Spinner />}
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <PlaidLinkButton onLinked={() => invalidate()} disabled={!configured} />
        </div>
      </div>

      {msg && <p className="text-sm text-ink-soft">{msg}</p>}

      {!isLoading && !configured && (
        <div className="card border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
          <h2 className="font-semibold text-amber-900 dark:text-amber-200">Plaid not configured</h2>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            Add your sandbox credentials to <code>.env</code>, then restart the dev server:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-amber-900/90 p-3 text-xs text-amber-50">{`PLAID_CLIENT_ID="your_client_id"
PLAID_SECRET="your_sandbox_secret"
PLAID_ENV="sandbox"`}</pre>
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
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
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">
                    {item.institutionName || "Institution"}
                  </h2>
                  <SyncStatus item={item} syncing={syncing || resyncing === item.id} />
                </div>
                <div className="flex items-center gap-3">
                  {item.lastSyncError && (
                    <PlaidLinkButton
                      itemId={item.id}
                      label={resyncing === item.id ? "Syncing…" : "Reconnect through Plaid"}
                      onLinked={() => resync(item.id)}
                      disabled={resyncing === item.id || syncing}
                      className="text-xs font-medium text-brand-600 dark:text-brand-300 hover:underline disabled:opacity-50"
                    />
                  )}
                  <button
                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                    onClick={() => disconnect(item.id)}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
              {item.lastSyncError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {item.lastSyncError}
                  {item.lastSyncErrorCode ? ` (${item.lastSyncErrorCode})` : ""}
                </p>
              )}
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

function Spinner() {
  return (
    <span
      aria-label="Syncing"
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

function SyncStatus({ item, syncing }: { item: any; syncing: boolean }) {
  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-300">
        <Spinner />
        Syncing…
      </span>
    );
  }
  if (item.lastSyncError) {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
        Sync failed
      </span>
    );
  }
  if (!item.lastSyncedAt) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        Not synced yet
      </span>
    );
  }
  return (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
      Synced {new Date(item.lastSyncedAt).toLocaleString()}
    </span>
  );
}
