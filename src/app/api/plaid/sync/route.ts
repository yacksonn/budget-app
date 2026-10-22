import { NextResponse } from "next/server";
import { plaidConfigured } from "@/lib/plaid";
import { syncAllItems } from "@/lib/sync";

// POST /api/plaid/sync            syncs every item
// POST /api/plaid/sync {itemId}   resyncs a single item
export async function POST(req: Request) {
  if (!plaidConfigured()) {
    return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const itemId = body.itemId as string | undefined;
  try {
    const results = await syncAllItems(itemId ? [itemId] : undefined);
    const totals = results.reduce(
      (acc, r) =>
        r.ok
          ? {
              added: acc.added + r.added,
              modified: acc.modified + r.modified,
              removed: acc.removed + r.removed,
            }
          : acc,
      { added: 0, modified: 0, removed: 0 }
    );
    const failed = results.filter((r) => !r.ok).length;
    return NextResponse.json({ ok: failed === 0, totals, failed, results });
  } catch (err: any) {
    const detail = err?.response?.data ?? err?.message ?? "unknown error";
    return NextResponse.json({ error: "Sync failed", detail }, { status: 500 });
  }
}
