import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { monthRange, shiftMonth, monthLabel } from "@/lib/format";

// Aggregation runs in Postgres; only small grouped rows come back. Month boundaries are
// still computed here (monthRange) and passed in, so bucketing matches the app exactly.
// `date` is a timestamp without time zone holding UTC, hence the ISO-string params.
const ts = (d: Date) => d.toISOString();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month) return NextResponse.json({ error: "Missing month" }, { status: 400 });

  // Window covering the last 6 months (for the trend chart) through the selected month.
  const firstTrendMonth = shiftMonth(month, -5);
  const windowStart = monthRange(firstTrendMonth).start;
  const windowEnd = monthRange(month).end;
  const { start, end } = monthRange(month);

  const [days, parents, accounts] = await Promise.all([
    // Per-day totals across the window. Spending follows the per-transaction
    // includedInSpending checkbox; income is money in, excluding transfers.
    prisma.$queryRaw<{ date: Date; spending: number; income: number }[]>`
      SELECT t."date",
        COALESCE(SUM(CASE WHEN t."includedInSpending" THEN t."amount" END), 0)::float8 AS spending,
        COALESCE(SUM(CASE WHEN t."amount" < 0 AND c."group" IS DISTINCT FROM 'TRANSFER'
                          THEN -t."amount" END), 0)::float8 AS income
      FROM "Transaction" t
      LEFT JOIN "Category" c ON c."id" = t."categoryId"
      WHERE t."date" >= ${ts(windowStart)}::timestamp(3) AND t."date" < ${ts(windowEnd)}::timestamp(3)
      GROUP BY t."date"`,
    // Selected month's spending by top-level category (a subcategory rolls up to its parent).
    prisma.$queryRaw<
      { id: string | null; name: string | null; icon: string | null; color: string | null; amount: number }[]
    >`
      SELECT
        CASE WHEN p."id" IS NOT NULL THEN p."id" ELSE c."id" END AS id,
        CASE WHEN p."id" IS NOT NULL THEN p."name" ELSE c."name" END AS name,
        CASE WHEN p."id" IS NOT NULL THEN p."icon" ELSE c."icon" END AS icon,
        CASE WHEN p."id" IS NOT NULL THEN p."color" ELSE c."color" END AS color,
        SUM(t."amount")::float8 AS amount
      FROM "Transaction" t
      LEFT JOIN "Category" c ON c."id" = t."categoryId"
      LEFT JOIN "Category" p ON p."id" = c."parentId"
      WHERE t."includedInSpending"
        AND t."date" >= ${ts(start)}::timestamp(3) AND t."date" < ${ts(end)}::timestamp(3)
      GROUP BY 1, 2, 3, 4
      ORDER BY amount DESC`,
    prisma.account.aggregate({ _sum: { currentBalance: true }, _count: true }),
  ]);

  // Build the 6 month keys.
  const trendMonths: string[] = [];
  for (let i = 5; i >= 0; i--) trendMonths.push(shiftMonth(month, -i));

  const trend = trendMonths.map((m) => {
    const { start, end } = monthRange(m);
    let income = 0;
    let spending = 0;
    for (const d of days) {
      if (d.date < start || d.date >= end) continue;
      spending += d.spending;
      income += d.income;
    }
    return { month: m, label: monthLabel(m), income, spending, net: income - spending };
  });

  // Current month = last trend bucket (same window and rules).
  const { income, spending } = trend[trend.length - 1];

  const byParent = parents.map((p) => ({
    id: p.id,
    name: p.name ?? "Uncategorized",
    icon: p.icon ?? "❓",
    color: p.color ?? "#cbd5e1",
    amount: p.amount,
  }));

  // Per-day spending for the selected month. Plaid dates are stored as UTC midnight,
  // so bucket by the UTC calendar date rather than local time.
  const spentByDay = new Map<string, number>();
  for (const d of days) {
    const key = d.date.toISOString().slice(0, 10);
    if (!key.startsWith(month)) continue;
    spentByDay.set(key, (spentByDay.get(key) ?? 0) + d.spending);
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

  return NextResponse.json({
    month,
    label: monthLabel(month),
    income,
    spending,
    net: income - spending,
    byParent,
    trend,
    daily,
    accountsBalance: accounts._sum.currentBalance ?? 0,
    accountCount: accounts._count,
  });
}
