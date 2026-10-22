import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { monthRange, shiftMonth, monthLabel } from "@/lib/format";

// Transfers are excluded from income/spending totals.
const isTransfer = (group?: string | null) => group === "TRANSFER";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month) return NextResponse.json({ error: "Missing month" }, { status: 400 });

  // Window covering the last 6 months (for the trend chart) through the selected month.
  const firstTrendMonth = shiftMonth(month, -5);
  const windowStart = monthRange(firstTrendMonth).start;
  const windowEnd = monthRange(month).end;

  const txs = await prisma.transaction.findMany({
    where: { date: { gte: windowStart, lt: windowEnd } },
    include: { category: { include: { parent: true } } },
  });

  // Build the 6 month keys.
  const trendMonths: string[] = [];
  for (let i = 5; i >= 0; i--) trendMonths.push(shiftMonth(month, -i));

  const trend = trendMonths.map((m) => {
    const { start, end } = monthRange(m);
    let income = 0;
    let spending = 0;
    for (const t of txs) {
      if (t.date < start || t.date >= end) continue;
      // Spending follows the per-transaction includedInSpending checkbox.
      if (t.includedInSpending) spending += t.amount;
      // Income is unaffected by the checkbox: money in, excluding transfers.
      if (!isTransfer(t.category?.group) && t.amount < 0) income += -t.amount;
    }
    return { month: m, label: monthLabel(m), income, spending, net: income - spending };
  });

  // Current-month detail.
  const { start, end } = monthRange(month);
  let income = 0;
  let spending = 0;
  const byParentMap = new Map<
    string,
    { id: string | null; name: string; icon: string | null; color: string | null; amount: number }
  >();

  for (const t of txs) {
    if (t.date < start || t.date >= end) continue;

    // Spending + category breakdown follow the includedInSpending checkbox.
    if (t.includedInSpending) {
      spending += t.amount;
      const parent = t.category?.parent ?? t.category ?? null;
      const key = parent?.id ?? "uncategorized";
      const cur = byParentMap.get(key) ?? {
        id: parent?.id ?? null,
        name: parent?.name ?? "Uncategorized",
        icon: parent?.icon ?? "❓",
        color: parent?.color ?? "#cbd5e1",
        amount: 0,
      };
      cur.amount += t.amount;
      byParentMap.set(key, cur);
    }

    // Income is unaffected by the checkbox: money in, excluding transfers.
    if (!isTransfer(t.category?.group) && t.amount < 0) income += -t.amount;
  }

  const byParent = Array.from(byParentMap.values()).sort((a, b) => b.amount - a.amount);

  // Per-day spending for the selected month. Plaid dates are stored as UTC midnight,
  // so bucket by the UTC calendar date rather than local time.
  const spentByDay = new Map<string, number>();
  for (const t of txs) {
    if (!t.includedInSpending) continue;
    const key = t.date.toISOString().slice(0, 10);
    if (!key.startsWith(month)) continue;
    spentByDay.set(key, (spentByDay.get(key) ?? 0) + t.amount);
  }

  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;

  let cumulative = 0;
  const daily: { day: number; date: string; spent: number | null; cumulative: number | null }[] =
    [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    // Leave future days empty so the lines stop at today in the current month.
    if (date > todayKey) {
      daily.push({ day: d, date, spent: null, cumulative: null });
      continue;
    }
    const spent = spentByDay.get(date) ?? 0;
    cumulative += spent;
    daily.push({ day: d, date, spent, cumulative });
  }

  const accounts = await prisma.account.findMany();
  const accountsBalance = accounts.reduce((s, a) => s + (a.currentBalance ?? 0), 0);

  return NextResponse.json({
    month,
    label: monthLabel(month),
    income,
    spending,
    net: income - spending,
    byParent,
    trend,
    daily,
    accountsBalance,
    accountCount: accounts.length,
  });
}
