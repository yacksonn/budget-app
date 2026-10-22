"use client";

import { monthLabel, shiftMonth, currentMonth } from "@/lib/format";

export function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  const isCurrent = month === currentMonth();
  return (
    <div className="flex items-center gap-2">
      <button
        className="btn-ghost !px-2.5"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Previous month"
      >
        ‹
      </button>
      <div className="min-w-[9.5rem] text-center text-sm font-semibold text-ink">
        {monthLabel(month)}
      </div>
      <button
        className="btn-ghost !px-2.5"
        onClick={() => onChange(shiftMonth(month, 1))}
        aria-label="Next month"
      >
        ›
      </button>
      {!isCurrent && (
        <button className="btn-ghost text-xs" onClick={() => onChange(currentMonth())}>
          Today
        </button>
      )}
    </div>
  );
}
