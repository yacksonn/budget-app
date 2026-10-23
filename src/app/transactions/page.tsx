"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { fetcher, invalidate } from "@/lib/fetcher";
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
  // Query the server only after typing pauses, not on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: catData } = useSWR("/api/categories", fetcher);
  const { data: acctData } = useSWR("/api/accounts", fetcher);
  const categories = catData?.categories ?? [];
  const accounts = useMemo(
    () => (acctData?.items ?? []).flatMap((i: any) => i.accounts),
    [acctData]
  );

  const params = new URLSearchParams({ month });
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (accountId) params.set("accountId", accountId);
  if (categoryId) params.set("categoryId", categoryId);
  if (onlyUnreviewed) params.set("reviewed", "false");

  const listKey = `/api/transactions?${params.toString()}`;
  const { data, mutate, isLoading } = useSWR(listKey, fetcher);
  const transactions = data?.transactions ?? [];
  const filtered = Boolean(search || accountId || categoryId || onlyUnreviewed);

  // Patch the edited row into the cached list instead of refetching the whole month. With a
  // filter active the row may no longer match, so refetch then. Other views that depend on
  // transactions (summary, dashboard's recent list, category counts) are invalidated.
  function onChanged(updated: any, body: any) {
    if (filtered) {
      mutate();
    } else {
      mutate(
        (d: any) =>
          d && { ...d, transactions: d.transactions.map((t: any) => (t.id === updated.id ? updated : t)) },
        { revalidate: false }
      );
    }
    const prefixes = ["/api/summary", "/api/transactions"];
    if ("categoryId" in body) prefixes.push("/api/categories");
    invalidate(prefixes, listKey);
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
        <div className="grid gap-3 md:grid-cols-4">
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
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
