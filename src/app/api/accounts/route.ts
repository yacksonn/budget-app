import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { plaidConfigured } from "@/lib/plaid";

export async function GET() {
  const items = await prisma.plaidItem.findMany({
    include: {
      accounts: {
        include: { _count: { select: { transactions: true } } },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ items, plaidConfigured: plaidConfigured() });
}

// DELETE /api/accounts?itemId=...  removes a connected institution and its data.
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId");
  if (!itemId) return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
  await prisma.plaidItem.delete({ where: { id: itemId } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
