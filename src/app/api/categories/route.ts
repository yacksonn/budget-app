import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { parent: true, _count: { select: { transactions: true } } },
  });
  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = (body.name as string | undefined)?.trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const parentId = (body.parentId as string | undefined) || null;
  let group = (body.group as string | undefined) || "EXPENSE";

  // Child categories inherit their parent's group.
  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId } });
    if (parent) group = parent.group;
  }

  const category = await prisma.category.create({
    data: {
      name,
      group,
      parentId,
      icon: (body.icon as string | undefined) || (parentId ? undefined : "🏷️"),
      color: (body.color as string | undefined) || "#6366f1",
      isCustom: true,
      sortOrder: 500,
    },
  });
  return NextResponse.json({ category });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = body.id as string | undefined;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if ("name" in body && body.name) data.name = String(body.name).trim();
  if ("group" in body && body.group) data.group = body.group;
  if ("icon" in body) data.icon = body.icon;
  if ("color" in body) data.color = body.color;

  const category = await prisma.category.update({ where: { id }, data });
  return NextResponse.json({ category });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { transactions: true, children: true } } },
  });
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!category.isCustom) {
    return NextResponse.json(
      { error: "Preset categories cannot be deleted." },
      { status: 400 }
    );
  }
  if (category._count.children > 0) {
    return NextResponse.json(
      { error: "Remove subcategories first." },
      { status: 400 }
    );
  }

  // Transactions in this category fall back to uncategorized.
  await prisma.transaction.updateMany({
    where: { categoryId: id },
    data: { categoryId: null },
  });
  await prisma.category.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
