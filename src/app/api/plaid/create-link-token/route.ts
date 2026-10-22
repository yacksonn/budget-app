import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import {
  plaidClient,
  plaidConfigured,
  PLAID_PRODUCTS,
  PLAID_COUNTRY_CODES,
} from "@/lib/plaid";

export async function POST() {
  if (!plaidConfigured()) {
    return NextResponse.json(
      { error: "Plaid is not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to .env." },
      { status: 400 }
    );
  }

  try {
    const res = await plaidClient.linkTokenCreate({
      user: { client_user_id: "budget-app-user" },
      client_name: "Budget App",
      products: PLAID_PRODUCTS as Products[],
      country_codes: PLAID_COUNTRY_CODES as CountryCode[],
      language: "en",
    });
    return NextResponse.json({ link_token: res.data.link_token });
  } catch (err: any) {
    const detail = err?.response?.data ?? err?.message ?? "unknown error";
    return NextResponse.json({ error: "Failed to create link token", detail }, { status: 500 });
  }
}
