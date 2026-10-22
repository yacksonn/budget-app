import { prisma } from "@/lib/db";
import { plaidClient } from "@/lib/plaid";
import type { Transaction as PlaidTransaction } from "plaid";
import { classifyCreditCardPayments } from "@/lib/cc-payments";
import { defaultIncludedInSpending } from "@/lib/spending";

// Lookup tables from Plaid's personal_finance_category to an internal categoryId. The
// `detailed` map takes precedence over `primary` so more specific categories (e.g. a
// credit-card payment vs. a generic loan payment) win. `groupById` lets us derive whether
// a mapped category is a transfer when setting a new transaction's spending-default.
type CategoryMap = {
  primary: Map<string, string>;
  detailed: Map<string, string>;
  groupById: Map<string, string>;
};
async function buildCategoryMap(): Promise<CategoryMap> {
  const cats = await prisma.category.findMany();
  const primary = new Map<string, string>();
  const detailed = new Map<string, string>();
  const groupById = new Map<string, string>();
  for (const c of cats) {
    if (c.plaidPrimary) primary.set(c.plaidPrimary, c.id);
    if (c.plaidDetailed) detailed.set(c.plaidDetailed, c.id);
    groupById.set(c.id, c.group);
  }
  return { primary, detailed, groupById };
}

// Refresh account rows + balances for a Plaid item.
async function refreshAccounts(itemDbId: string, accessToken: string) {
  const res = await plaidClient.accountsGet({ access_token: accessToken });
  for (const a of res.data.accounts) {
    await prisma.account.upsert({
      where: { plaidAccountId: a.account_id },
      create: {
        plaidAccountId: a.account_id,
        itemId: itemDbId,
        name: a.name,
        officialName: a.official_name ?? null,
        mask: a.mask ?? null,
        type: a.type ?? null,
        subtype: a.subtype ?? null,
        currentBalance: a.balances.current ?? null,
        availableBalance: a.balances.available ?? null,
        currencyCode: a.balances.iso_currency_code ?? "USD",
      },
      update: {
        name: a.name,
        officialName: a.official_name ?? null,
        mask: a.mask ?? null,
        type: a.type ?? null,
        subtype: a.subtype ?? null,
        currentBalance: a.balances.current ?? null,
        availableBalance: a.balances.available ?? null,
        currencyCode: a.balances.iso_currency_code ?? "USD",
      },
    });
  }
}

async function upsertTransaction(
  t: PlaidTransaction,
  categoryMap: CategoryMap
) {
  const account = await prisma.account.findUnique({
    where: { plaidAccountId: t.account_id },
  });
  if (!account) return; // account not tracked yet

  const primary = t.personal_finance_category?.primary ?? null;
  const detailed = t.personal_finance_category?.detailed ?? null;
  // Prefer the more specific `detailed` mapping (e.g. credit-card payment) over `primary`.
  const mappedCategoryId =
    (detailed ? categoryMap.detailed.get(detailed) : undefined) ??
    (primary ? categoryMap.primary.get(primary) : undefined) ??
    null;

  // Default the spending checkbox from the mapped category's group (unmapped → EXPENSE).
  const mappedGroup = mappedCategoryId ? categoryMap.groupById.get(mappedCategoryId) : null;
  const included = defaultIncludedInSpending(t.amount, mappedGroup);

  await prisma.transaction.upsert({
    where: { plaidTransactionId: t.transaction_id },
    create: {
      plaidTransactionId: t.transaction_id,
      accountId: account.id,
      date: new Date(t.date),
      name: t.name,
      merchantName: t.merchant_name ?? null,
      amount: t.amount,
      currencyCode: t.iso_currency_code ?? "USD",
      pending: t.pending ?? false,
      categoryId: mappedCategoryId,
      plaidPrimary: primary,
      plaidDetailed: detailed,
      includedInSpending: included,
    },
    // On update, preserve the user's manual category / note / reviewed flag, but keep the
    // raw Plaid category fields fresh (they inform recognition, not user intent).
    update: {
      date: new Date(t.date),
      name: t.name,
      merchantName: t.merchant_name ?? null,
      amount: t.amount,
      currencyCode: t.iso_currency_code ?? "USD",
      pending: t.pending ?? false,
      plaidPrimary: primary,
      plaidDetailed: detailed,
    },
  });
}

type SyncCounts = { added: number; modified: number; removed: number };

// Pull a readable message + Plaid error_code out of a thrown error (Plaid errors are axios errors).
function describeError(err: any): { message: string; code: string | null } {
  const data = err?.response?.data;
  return {
    message: data?.display_message || data?.error_message || err?.message || "Unknown error",
    code: data?.error_code ?? null,
  };
}

// Incrementally sync one Plaid item, recording the outcome on the item so the UI can show
// its sync status. Rethrows on failure.
export async function syncItem(itemDbId: string): Promise<SyncCounts> {
  try {
    const counts = await runItemSync(itemDbId);
    await prisma.plaidItem.update({
      where: { id: itemDbId },
      data: { lastSyncedAt: new Date(), lastSyncError: null, lastSyncErrorCode: null },
    });
    return counts;
  } catch (err) {
    const { message, code } = describeError(err);
    await prisma.plaidItem
      .update({
        where: { id: itemDbId },
        data: { lastSyncError: message, lastSyncErrorCode: code },
      })
      .catch(() => undefined); // item may not exist
    throw err;
  }
}

async function runItemSync(itemDbId: string): Promise<SyncCounts> {
  const item = await prisma.plaidItem.findUnique({ where: { id: itemDbId } });
  if (!item) throw new Error("Item not found");

  await refreshAccounts(item.id, item.accessToken);
  const categoryMap = await buildCategoryMap();

  let cursor = item.cursor ?? undefined;
  let added = 0;
  let modified = 0;
  let removed = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await plaidClient.transactionsSync({
      access_token: item.accessToken,
      cursor,
    });
    const data = res.data;

    for (const t of data.added) {
      await upsertTransaction(t, categoryMap);
      added++;
    }
    for (const t of data.modified) {
      await upsertTransaction(t, categoryMap);
      modified++;
    }
    for (const r of data.removed) {
      if (r.transaction_id) {
        await prisma.transaction
          .delete({ where: { plaidTransactionId: r.transaction_id } })
          .catch(() => undefined);
        removed++;
      }
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  await prisma.plaidItem.update({
    where: { id: item.id },
    data: { cursor },
  });

  return { added, modified, removed };
}

export type ItemSyncResult =
  | ({ itemId: string; ok: true } & SyncCounts)
  | { itemId: string; ok: false; error: string; errorCode: string | null };

// Sync connected items in parallel (all items, or just `itemIds`). One item failing never
// blocks the others; each item's outcome is returned and persisted on the item.
export async function syncAllItems(itemIds?: string[]): Promise<ItemSyncResult[]> {
  const items = await prisma.plaidItem.findMany({
    where: itemIds ? { id: { in: itemIds } } : undefined,
  });
  const settled = await Promise.allSettled(items.map((item) => syncItem(item.id)));
  const results: ItemSyncResult[] = settled.map((s, i) => {
    const itemId = items[i].id;
    if (s.status === "fulfilled") return { itemId, ok: true, ...s.value };
    const { message, code } = describeError(s.reason);
    return { itemId, ok: false, error: message, errorCode: code };
  });
  // Sweep recently-synced transactions for credit-card payments that the direct category
  // mapping missed (e.g. rows tagged only by name), so they're excluded as transfers.
  await classifyCreditCardPayments(prisma, { windowDays: 120 });
  return results;
}
