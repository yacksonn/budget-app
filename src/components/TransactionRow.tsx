"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { CategorySelect } from "@/components/CategorySelect";

export function TransactionRow({
  tx,
  categories,
  onEdit,
}: {
  tx: any;
  categories: any[];
  onEdit: (id: string, body: any) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(Boolean(tx.note));
  const [note, setNote] = useState(tx.note ?? "");

  // Plaid convention: positive amount = money out (expense).
  const isExpense = tx.amount > 0;

  function patch(body: any) {
    onEdit(tx.id, body);
  }

  return (
    <div className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">
            {tx.merchantName || tx.name}
          </p>
          {tx.pending && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              pending
            </span>
          )}
        </div>
        <p className="text-xs text-ink-muted">
          {formatDate(tx.date)} · {tx.account?.name}
          {tx.account?.mask ? ` ····${tx.account.mask}` : ""}
        </p>
        {noteOpen ? (
          <input
            className="input mt-2 max-w-md text-xs"
            placeholder="Add a note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (tx.note ?? "") && patch({ note })}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <button
            className="mt-1 text-xs text-brand-600 dark:text-brand-300 hover:underline"
            onClick={() => setNoteOpen(true)}
          >
            + note
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <CategorySelect
            categories={categories}
            value={tx.categoryId}
            onChange={(id) => patch({ categoryId: id })}
            className="!py-1.5 text-xs"
          />
        </div>
        <label
          className="flex items-center gap-1.5 text-xs text-ink-muted"
          title="Count this transaction toward the monthly spent total"
        >
          <input
            type="checkbox"
            checked={Boolean(tx.includedInSpending)}
            onChange={(e) => patch({ includedInSpending: e.target.checked })}
          />
          in spend
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted" title="Mark reviewed">
          <input
            type="checkbox"
            checked={tx.reviewed}
            onChange={(e) => patch({ reviewed: e.target.checked })}
          />
          reviewed
        </label>
        <div
          className={`w-28 text-right font-semibold tabular-nums ${
            isExpense ? "text-ink" : "text-green-600 dark:text-green-400"
          }`}
        >
          {isExpense ? "" : "+"}
          {formatCurrency(Math.abs(tx.amount), tx.currencyCode || "USD")}
        </div>
      </div>
    </div>
  );
}
