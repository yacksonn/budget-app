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

  const current = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { children: true } } },
  });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if ("name" in body && body.name) data.name = String(body.name).trim();
  if ("group" in body && body.group) data.group = body.group;
  if ("icon" in body) data.icon = body.icon;
  if ("color" in body) data.color = body.color;

  // Moving: `parentId` null/"" makes it top-level; otherwise it goes under that parent.
  if ("parentId" in body) {
    const parentId = (body.parentId as string | null) || null;
    if (parentId) {
      if (parentId === id) {
        return NextResponse.json({ error: "A category can't be its own parent." }, { status: 400 });
      }
      if (current._count.children > 0) {
        return NextResponse.json(
          { error: "Move this category's subcategories out before nesting it." },
          { status: 400 }
        );
      }
      const parent = await prisma.category.findUnique({ where: { id: parentId } });
      if (!parent || parent.parentId) {
        return NextResponse.json({ error: "Parent must be a top-level category." }, { status: 400 });
      }
      // Subcategories inherit their parent's group.
      data.group = parent.group;
    }
    data.parentId = parentId;
  }

  const isTopLevel = !("parentId" in data ? data.parentId : current.parentId);
  try {
    const [category] = await prisma.$transaction([
      prisma.category.update({ where: { id }, data }),
      // A top-level group change carries down to its subcategories.
      ...(isTopLevel && data.group
        ? [prisma.category.updateMany({ where: { parentId: id }, data: { group: data.group as string } })]
        : []),
    ]);
    return NextResponse.json({ category });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "A category with that name already exists there." },
        { status: 409 }
      );
    }
    throw e;
  }
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
  if (category._count.children > 0) {
    return NextResponse.json(
      { error: "Move or delete its subcategories first." },
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
