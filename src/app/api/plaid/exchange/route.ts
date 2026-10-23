import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { plaidClient, plaidConfigured } from "@/lib/plaid";
import { syncItem } from "@/lib/sync";

export async function POST(req: Request) {
  if (!plaidConfigured()) {
    return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const publicToken = body.public_token as string | undefined;
  const institutionName = (body.institution_name as string | undefined) ?? null;
  const institutionId = (body.institution_id as string | undefined) ?? null;

  if (!publicToken) {
    return NextResponse.json({ error: "Missing public_token" }, { status: 400 });
  }

  try {
    const exchange = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const item = await prisma.plaidItem.upsert({
      where: { itemId },
      create: { itemId, accessToken, institutionName, institutionId },
      update: { accessToken, institutionName, institutionId },
    });

    // Pull accounts + initial transactions right away.
    const result = await syncItem(item);

    return NextResponse.json({ ok: true, itemId: item.id, ...result });
  } catch (err: any) {
    const detail = err?.response?.data ?? err?.message ?? "unknown error";
    return NextResponse.json({ error: "Failed to exchange token", detail }, { status: 500 });
  }
}
