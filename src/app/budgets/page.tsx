"use client";

import useSWR from "swr";
import { useState } from "react";
import { fetcher, apiSend } from "@/lib/fetcher";
import { formatCurrency, currentMonth } from "@/lib/format";
import { MonthPicker } from "@/components/MonthPicker";

function BudgetRow({
  category,
  actual,
  amount,
  month,
  onSaved,
}: {
  category: any;
  actual: number;
  amount: number;
  month: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(amount ? String(amount) : "");

  async function save() {
    const num = Number(value) || 0;
    if (num === amount) return;
    await apiSend("/api/budgets", "PUT", {
      month,
      categoryId: category.id,
      amount: num,
    });
    onSaved();
  }

  const pct = amount > 0 ? Math.min(100, (actual / amount) * 100) : 0;
  const over = amount > 0 && actual > amount;
  const remaining = amount - actual;

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="grid h-7 w-7 place-items-center rounded-lg text-sm"
            style={{ backgroundColor: (category.color ?? "#e2e8f0") + "22" }}
          >
            {category.icon}
          </span>
          <span className="text-sm font-medium">{category.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-24 text-right text-sm tabular-nums text-ink-soft">
            {formatCurrency(actual)}
          </span>
          <span className="text-ink-muted">/</span>
          <div className="relative w-28">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-muted">
              $
            </span>
            <input
              className="input !py-1.5 pl-5 text-right text-sm tabular-nums"
              inputMode="decimal"
              placeholder="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </div>
        </div>
      </div>
      {amount > 0 && (
        <div className="mt-2 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-soft">
            <div
              className={`h-full rounded-full ${over ? "bg-red-500" : "bg-brand-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span
            className={`w-32 text-right text-xs tabular-nums ${
              over ? "text-red-600 dark:text-red-400" : "text-ink-muted"
            }`}
          >
            {over
              ? `${formatCurrency(actual - amount)} over`
              : `${formatCurrency(remaining)} left`}
          </span>
        </div>
      )}
    </div>
  );
}

export default function BudgetsPage() {
  const [month, setMonth] = useState(currentMonth());
  const { data: catData } = useSWR("/api/categories", fetcher);
  const { data: summary } = useSWR(`/api/summary?month=${month}`, fetcher);
  const { data: budgetData, mutate } = useSWR(`/api/budgets?month=${month}`, fetcher);

  const categories = catData?.categories ?? [];
  const expenseParents = categories.filter(
    (c: any) => !c.parentId && c.group === "EXPENSE"
  );
  const budgets: any[] = budgetData?.budgets ?? [];
  const byParent: any[] = summary?.byParent ?? [];

  const budgetFor = (id: string) => budgets.find((b) => b.categoryId === id)?.amount ?? 0;
  const actualFor = (id: string) => byParent.find((p) => p.id === id)?.amount ?? 0;

  const income = summary?.income ?? 0;
  const totalBudgeted = expenseParents.reduce(
    (s: number, c: any) => s + budgetFor(c.id),
    0
  );
  const totalSpent = summary?.spending ?? 0;
  const leftToBudget = income - totalBudgeted;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Budgets</h1>
          <p className="text-sm text-ink-muted">Set a monthly target per category group.</p>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="label">Income</p>
          <p className="mt-1 text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(income)}</p>
        </div>
        <div className="card">
          <p className="label">Budgeted / Spent</p>
          <p className="mt-1 text-xl font-bold">
            {formatCurrency(totalBudgeted)}{" "}
            <span className="text-sm font-normal text-ink-muted">
              · {formatCurrency(totalSpent)} spent
            </span>
          </p>
        </div>
        <div className="card">
          <p className="label">Left to budget</p>
          <p
            className={`mt-1 text-xl font-bold ${
              leftToBudget < 0 ? "text-red-600 dark:text-red-400" : "text-ink"
            }`}
          >
            {formatCurrency(leftToBudget)}
          </p>
        </div>
      </div>

      <div className="card divide-y divide-surface-border">
        <div className="flex items-center justify-between pb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          <span>Category</span>
          <span>Spent / Budget</span>
        </div>
        {expenseParents.map((c: any) => (
          <BudgetRow
            key={c.id}
            category={c}
            actual={actualFor(c.id)}
            amount={budgetFor(c.id)}
            month={month}
            onSaved={() => mutate()}
          />
        ))}
      </div>
    </div>
  );
}
