import { NextResponse } from "next/server";
import { plaidConfigured } from "@/lib/plaid";
import { syncAllItems } from "@/lib/sync";

export async function POST() {
  if (!plaidConfigured()) {
    return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });
  }
  try {
    const results = await syncAllItems();
    const totals = results.reduce(
      (acc, r) => ({
        added: acc.added + r.added,
        modified: acc.modified + r.modified,
        removed: acc.removed + r.removed,
      }),
      { added: 0, modified: 0, removed: 0 }
    );
    return NextResponse.json({ ok: true, totals, results });
  } catch (err: any) {
    const detail = err?.response?.data ?? err?.message ?? "unknown error";
    return NextResponse.json({ error: "Sync failed", detail }, { status: 500 });
  }
}
