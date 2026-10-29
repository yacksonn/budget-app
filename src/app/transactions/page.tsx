"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { fetcher } from "@/lib/fetcher";
import { enqueue, setQueueListener } from "@/lib/write-queue";
import { currentMonth } from "@/lib/format";
import { MonthPicker } from "@/components/MonthPicker";
import { TransactionRow } from "@/components/TransactionRow";
import { CategorySelect } from "@/components/CategorySelect";

export default function TransactionsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>("");
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [minAmount, setMinAmount] = useState("");

  const { data: catData } = useSWR("/api/categories", fetcher);
  const { data: acctData } = useSWR("/api/accounts", fetcher);
  const categories = catData?.categories ?? [];
  const accounts = useMemo(
    () => (acctData?.items ?? []).flatMap((i: any) => i.accounts),
    [acctData]
  );

  // Fetch the whole month once; every filter runs on the cached list, so changing a filter
  // (or editing a row so it no longer matches) never refetches.
  const listKey = `/api/transactions?${new URLSearchParams({ month })}`;
  const { data, mutate, isLoading } = useSWR(listKey, fetcher);
  const allTransactions = data?.transactions ?? [];

  const q = search.trim().toLowerCase();
  const selectedCat = categories.find((c: any) => c.id === categoryId);
  // The seeded top-level "Uncategorized" bucket also covers rows with no category at all.
  const matchUncategorized = selectedCat?.name === "Uncategorized" && !selectedCat.parentId;
  const min = parseFloat(minAmount);
  const transactions = allTransactions.filter(
    (t: any) =>
      (!onlyUnreviewed || !t.reviewed) &&
      (!(min > 0) || Math.abs(t.amount) > min) &&
      (!accountId || t.accountId === accountId) &&
      // A parent category ("Food & Dining (all)") matches itself and all its subcategories.
      (!categoryId ||
        t.categoryId === categoryId ||
        t.category?.parentId === categoryId ||
        (matchUncategorized && !t.categoryId)) &&
      (!q ||
        [t.name, t.merchantName, t.note].some((s) => s?.toLowerCase().includes(q)))
  );
  const filtered = Boolean(search || accountId || categoryId || onlyUnreviewed || minAmount);

  const [error, setError] = useState<string | null>(null);

  // When the write queue drains it refreshes dependent views (summary, dashboard, category
  // counts). This list already shows the edits, so it's skipped unless a write failed
  // (refetch rolls back the failed change).
  useEffect(() => {
    setQueueListener({
      onError: (id) => {
        const tx = allTransactions.find((t: any) => t.id === id);
        setError(`Couldn't save changes to ${tx ? tx.merchantName || tx.name : "a transaction"}.`);
      },
      skipKey: () => listKey,
    });
  });
  useEffect(() => () => setQueueListener(null), []);

  // Apply the edit to the cached list right away; the DB write is queued.
  function onEdit(id: string, body: any) {
    const patch = { ...body };
    if ("categoryId" in body) {
      const c = categories.find((c: any) => c.id === body.categoryId);
      patch.category = c
        ? { ...c, parent: categories.find((p: any) => p.id === c.parentId) ?? null }
        : null;
    }
    mutate(
      (d: any) =>
        d && { ...d, transactions: d.transactions.map((t: any) => (t.id === id ? { ...t, ...patch } : t)) },
      { revalidate: false }
    );
    enqueue(id, body);
  }

  const spent = transactions
    .filter((t: any) => t.includedInSpending)
    .reduce((s: number, t: any) => s + t.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-sm text-ink-muted">
            {transactions.length} transactions · ${spent.toFixed(2)} spent
          </p>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      <div className="card space-y-3">
        <div className="grid gap-3 md:grid-cols-5">
          <input
            className="input"
            placeholder="Search name, merchant, note…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">All accounts</option>
            {accounts.map((a: any) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.mask ? ` ····${a.mask}` : ""}
              </option>
            ))}
          </select>
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={(id) => setCategoryId(id ?? "")}
            noneLabel="All categories"
          />
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="Amount above $…"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={onlyUnreviewed}
              onChange={(e) => setOnlyUnreviewed(e.target.checked)}
            />
            Only unreviewed
          </label>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button className="text-xs hover:underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
        ) : transactions.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            {filtered
              ? "No transactions match these filters this month."
              : "No transactions for this month. Connect an account and sync on the Accounts page."}
          </p>
        ) : (
          <div className="divide-y divide-surface-border">
            {transactions.map((tx: any) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                categories={categories}
                onEdit={onEdit}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
