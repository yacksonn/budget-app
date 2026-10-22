"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { fetcher } from "@/lib/fetcher";
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

  const { data: catData } = useSWR("/api/categories", fetcher);
  const { data: acctData } = useSWR("/api/accounts", fetcher);
  const categories = catData?.categories ?? [];
  const accounts = useMemo(
    () => (acctData?.items ?? []).flatMap((i: any) => i.accounts),
    [acctData]
  );

  const params = new URLSearchParams({ month });
  if (search) params.set("search", search);
  if (accountId) params.set("accountId", accountId);
  if (categoryId) params.set("categoryId", categoryId);
  if (onlyUnreviewed) params.set("reviewed", "false");

  const { data, mutate, isLoading } = useSWR(
    `/api/transactions?${params.toString()}`,
    fetcher
  );
  const transactions = data?.transactions ?? [];
  const filtered = Boolean(search || accountId || categoryId || onlyUnreviewed);

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
                onChanged={() => mutate()}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
