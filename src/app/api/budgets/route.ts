import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/budgets?month=YYYY-MM  -> budgets for the month
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month) return NextResponse.json({ error: "Missing month" }, { status: 400 });

  const budgets = await prisma.budget.findMany({ where: { month } });
  return NextResponse.json({ budgets });
}

// PUT /api/budgets  body: { month, categoryId, amount }
// amount <= 0 removes the budget row.
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const month = body.month as string | undefined;
  const categoryId = body.categoryId as string | undefined;
  const amount = Number(body.amount);

  if (!month || !categoryId || Number.isNaN(amount)) {
    return NextResponse.json({ error: "month, categoryId and amount are required" }, { status: 400 });
  }

  if (amount <= 0) {
    await prisma.budget
      .delete({ where: { month_categoryId: { month, categoryId } } })
      .catch(() => undefined);
    return NextResponse.json({ ok: true, removed: true });
  }

  const budget = await prisma.budget.upsert({
    where: { month_categoryId: { month, categoryId } },
    create: { month, categoryId, amount },
    update: { amount },
  });
  return NextResponse.json({ budget });
}
