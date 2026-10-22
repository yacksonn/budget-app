import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { prisma } from "@/lib/db";
import {
  plaidClient,
  plaidConfigured,
  PLAID_PRODUCTS,
  PLAID_COUNTRY_CODES,
} from "@/lib/plaid";

export async function POST(req: Request) {
  if (!plaidConfigured()) {
    return NextResponse.json(
      { error: "Plaid is not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to .env." },
      { status: 400 }
    );
  }

  // Optional itemId → Link "update mode" to repair an existing item's login.
  const body = await req.json().catch(() => ({}));
  const itemId = body.itemId as string | undefined;
  let accessToken: string | undefined;
  if (itemId) {
    const item = await prisma.plaidItem.findUnique({ where: { id: itemId } });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    accessToken = item.accessToken;
  }

  try {
    const res = await plaidClient.linkTokenCreate({
      user: { client_user_id: "budget-app-user" },
      client_name: "Budget App",
      // Update mode reuses the item's existing products, so `products` is omitted there.
      ...(accessToken
        ? { access_token: accessToken }
        : { products: PLAID_PRODUCTS as Products[] }),
      country_codes: PLAID_COUNTRY_CODES as CountryCode[],
      language: "en",
    });
    return NextResponse.json({ link_token: res.data.link_token });
  } catch (err: any) {
    const detail = err?.response?.data ?? err?.message ?? "unknown error";
    return NextResponse.json({ error: "Failed to create link token", detail }, { status: 500 });
  }
}
