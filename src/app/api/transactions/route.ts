import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { monthRange } from "@/lib/format";
import type { Prisma } from "@prisma/client";

// Only the relation fields the UI renders (instead of full account/category rows).
const txSelect = {
  id: true,
  plaidTransactionId: true,
  accountId: true,
  date: true,
  name: true,
  merchantName: true,
  amount: true,
  plaidPrimary: true,
  plaidDetailed: true,
  currencyCode: true,
  pending: true,
  categoryId: true,
  note: true,
  reviewed: true,
  includedInSpending: true,
  createdAt: true,
  updatedAt: true,
  account: { select: { id: true, name: true, mask: true } },
  category: {
    select: {
      id: true,
      name: true,
      icon: true,
      color: true,
      group: true,
      parentId: true,
      parent: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.TransactionSelect;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const accountId = searchParams.get("accountId");
  const categoryId = searchParams.get("categoryId");
  const search = searchParams.get("search");
  const reviewed = searchParams.get("reviewed"); // "true" | "false" | null
  const limit = Number(searchParams.get("limit")) || undefined; // e.g. dashboard "recent"

  const where: Prisma.TransactionWhereInput = {};

  if (month) {
    const { start, end } = monthRange(month);
    where.date = { gte: start, lt: end };
  }
  if (accountId) where.accountId = accountId;
  if (categoryId === "none") {
    where.categoryId = null;
  } else if (categoryId) {
    // A parent category ("Food & Dining (all)") matches itself and all its subcategories.
    const match: Prisma.TransactionWhereInput = {
      category: { OR: [{ id: categoryId }, { parentId: categoryId }] },
    };
    // The seeded top-level "Uncategorized" bucket also covers rows with no category at all.
    const cat = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { name: true, parentId: true },
    });
    where.AND =
      cat?.name === "Uncategorized" && !cat.parentId
        ? [{ OR: [match, { categoryId: null }] }]
        : [match];
  }
  if (reviewed === "true") where.reviewed = true;
  if (reviewed === "false") where.reviewed = false;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { merchantName: { contains: search } },
      { note: { contains: search } },
    ];
  }

  const transactions = await prisma.transaction.findMany({
    where,
    select: txSelect,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({ transactions });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = body.id as string | undefined;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const data: Prisma.TransactionUpdateInput = {};
  if ("categoryId" in body) {
    data.category = body.categoryId
      ? { connect: { id: body.categoryId } }
      : { disconnect: true };
  }
  if ("note" in body) data.note = body.note ?? null;
  if ("reviewed" in body) data.reviewed = Boolean(body.reviewed);
  if ("includedInSpending" in body) data.includedInSpending = Boolean(body.includedInSpending);

  const updated = await prisma.transaction.update({
    where: { id },
    data,
    select: txSelect,
  });

  return NextResponse.json({ transaction: updated });
}
