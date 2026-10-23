import { Prisma, type PlaidItem } from "@prisma/client";
import { prisma } from "@/lib/db";
import { plaidClient } from "@/lib/plaid";
import type { Transaction as PlaidTransaction } from "plaid";
import { CC_PAYMENT_CATEGORY_NAME, classifyCreditCardPayments } from "@/lib/cc-payments";
import { defaultIncludedInSpending } from "@/lib/spending";
import { GROCERIES_CATEGORY_NAME, isGroceryMerchant } from "@/lib/merchant-rules";

// Lookup tables from Plaid's personal_finance_category to an internal categoryId. The
// `detailed` map takes precedence over `primary` so more specific categories (e.g. a
// credit-card payment vs. a generic loan payment) win. `groupById` lets us derive whether
// a mapped category is a transfer when setting a new transaction's spending-default.
type CategoryMap = {
  primary: Map<string, string>;
  detailed: Map<string, string>;
  groupById: Map<string, string>;
  groceriesId: string | null;
  ccPaymentId: string | null;
};
async function buildCategoryMap(): Promise<CategoryMap> {
  const cats = await prisma.category.findMany({
    select: { id: true, name: true, group: true, parentId: true, plaidPrimary: true, plaidDetailed: true },
  });
  const primary = new Map<string, string>();
  const detailed = new Map<string, string>();
  const groupById = new Map<string, string>();
  for (const c of cats) {
    if (c.plaidPrimary) primary.set(c.plaidPrimary, c.id);
    if (c.plaidDetailed) detailed.set(c.plaidDetailed, c.id);
    groupById.set(c.id, c.group);
  }
  const groceriesId =
    cats.find((c) => c.name === GROCERIES_CATEGORY_NAME && c.parentId)?.id ?? null;
  const ccPaymentId =
    cats.find((c) => c.name === CC_PAYMENT_CATEGORY_NAME && c.group === "TRANSFER")?.id ?? null;
  return { primary, detailed, groupById, groceriesId, ccPaymentId };
}

// Refresh account rows + balances for a Plaid item. Returns plaidAccountId -> Account.id.
async function refreshAccounts(itemDbId: string, accessToken: string) {
  const res = await plaidClient.accountsGet({ access_token: accessToken });
  const accounts = await Promise.all(
    res.data.accounts.map((a) => {
      const fields = {
        name: a.name,
        officialName: a.official_name ?? null,
        mask: a.mask ?? null,
        type: a.type ?? null,
        subtype: a.subtype ?? null,
        currentBalance: a.balances.current ?? null,
        availableBalance: a.balances.available ?? null,
        currencyCode: a.balances.iso_currency_code ?? "USD",
      };
      return prisma.account.upsert({
        where: { plaidAccountId: a.account_id },
        create: { plaidAccountId: a.account_id, itemId: itemDbId, ...fields },
        update: fields,
        select: { id: true, plaidAccountId: true },
      });
    })
  );
  return new Map(accounts.map((a) => [a.plaidAccountId, a.id]));
}

// Category the sync assigns to a new transaction.
function mapCategory(t: PlaidTransaction, categoryMap: CategoryMap): string | null {
  const primary = t.personal_finance_category?.primary ?? null;
  const detailed = t.personal_finance_category?.detailed ?? null;
  // Prefer the more specific `detailed` mapping (e.g. credit-card payment) over `primary`.
  // Merchant rules (e.g. Costco/Walmart → Groceries) override both.
  return (
    (categoryMap.groceriesId && isGroceryMerchant(t.name, t.merchant_name)
      ? categoryMap.groceriesId
      : undefined) ??
    (detailed ? categoryMap.detailed.get(detailed) : undefined) ??
    (primary ? categoryMap.primary.get(primary) : undefined) ??
    null
  );
}

// Upsert a page of Plaid transactions in a fixed number of queries: one lookup of which
// rows already exist, one createMany for new rows, one bulk UPDATE for existing rows.
// On update, the user's manual category / note / reviewed / spending flag are preserved;
// only the raw Plaid fields are refreshed (they inform recognition, not user intent).
async function upsertTransactions(
  txs: PlaidTransaction[],
  accountIds: Map<string, string>,
  categoryMap: CategoryMap
) {
  // Skip accounts that aren't tracked; last occurrence of a transaction wins.
  const byId = new Map<string, PlaidTransaction>();
  for (const t of txs) if (accountIds.has(t.account_id)) byId.set(t.transaction_id, t);
  if (!byId.size) return;

  const existing = await prisma.transaction.findMany({
    where: { plaidTransactionId: { in: [...byId.keys()] } },
    select: { plaidTransactionId: true },
  });
  const existingIds = new Set(existing.map((e) => e.plaidTransactionId));

  const toCreate: Prisma.TransactionCreateManyInput[] = [];
  const toUpdate: PlaidTransaction[] = [];
  for (const t of byId.values()) {
    if (existingIds.has(t.transaction_id)) {
      toUpdate.push(t);
      continue;
    }
    const categoryId = mapCategory(t, categoryMap);
    // Default the spending checkbox from the mapped category's group (unmapped → EXPENSE).
    const group = categoryId ? categoryMap.groupById.get(categoryId) : null;
    toCreate.push({
      plaidTransactionId: t.transaction_id,
      accountId: accountIds.get(t.account_id)!,
      date: new Date(t.date),
      name: t.name,
      merchantName: t.merchant_name ?? null,
      amount: t.amount,
      currencyCode: t.iso_currency_code ?? "USD",
      pending: t.pending ?? false,
      categoryId,
      plaidPrimary: t.personal_finance_category?.primary ?? null,
      plaidDetailed: t.personal_finance_category?.detailed ?? null,
      includedInSpending: defaultIncludedInSpending(t.amount, group),
    });
  }

  if (toCreate.length) {
    await prisma.transaction.createMany({ data: toCreate, skipDuplicates: true });
  }

  if (toUpdate.length) {
    const rows = toUpdate.map(
      (t) => Prisma.sql`(
        ${t.transaction_id},
        ${new Date(t.date).toISOString()}::timestamp(3),
        ${t.name},
        ${t.merchant_name ?? null}::text,
        ${t.amount}::double precision,
        ${t.iso_currency_code ?? "USD"}::text,
        ${t.pending ?? false}::boolean,
        ${t.personal_finance_category?.primary ?? null}::text,
        ${t.personal_finance_category?.detailed ?? null}::text
      )`
    );
    await prisma.$executeRaw`
      UPDATE "Transaction" AS t SET
        "date" = v."date",
        "name" = v."name",
        "merchantName" = v."merchantName",
        "amount" = v."amount",
        "currencyCode" = v."currencyCode",
        "pending" = v."pending",
        "plaidPrimary" = v."plaidPrimary",
        "plaidDetailed" = v."plaidDetailed",
        "updatedAt" = NOW()
      FROM (VALUES ${Prisma.join(rows)}) AS v(
        "plaidTransactionId", "date", "name", "merchantName", "amount",
        "currencyCode", "pending", "plaidPrimary", "plaidDetailed"
      )
      WHERE t."plaidTransactionId" = v."plaidTransactionId"`;
  }
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
// its sync status. Rethrows on failure. Pass `categoryMap` to reuse one across items.
export async function syncItem(item: PlaidItem, categoryMap?: CategoryMap): Promise<SyncCounts> {
  try {
    const { cursor, ...counts } = await runItemSync(item, categoryMap ?? (await buildCategoryMap()));
    await prisma.plaidItem.update({
      where: { id: item.id },
      data: { cursor, lastSyncedAt: new Date(), lastSyncError: null, lastSyncErrorCode: null },
    });
    return counts;
  } catch (err) {
    const { message, code } = describeError(err);
    await prisma.plaidItem
      .update({
        where: { id: item.id },
        data: { lastSyncError: message, lastSyncErrorCode: code },
      })
      .catch(() => undefined); // item may not exist
    throw err;
  }
}

async function runItemSync(
  item: PlaidItem,
  categoryMap: CategoryMap
): Promise<SyncCounts & { cursor: string | undefined }> {
  const accountIds = await refreshAccounts(item.id, item.accessToken);

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

    await upsertTransactions([...data.added, ...data.modified], accountIds, categoryMap);
    added += data.added.length;
    modified += data.modified.length;

    const removedIds = data.removed.flatMap((r) => (r.transaction_id ? [r.transaction_id] : []));
    if (removedIds.length) {
      await prisma.transaction.deleteMany({ where: { plaidTransactionId: { in: removedIds } } });
      removed += removedIds.length;
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  return { added, modified, removed, cursor };
}

export type ItemSyncResult =
  | ({ itemId: string; ok: true } & SyncCounts)
  | { itemId: string; ok: false; error: string; errorCode: string | null };

// Sync connected items in parallel (all items, or just `itemIds`). One item failing never
// blocks the others; each item's outcome is returned and persisted on the item.
export async function syncAllItems(itemIds?: string[]): Promise<ItemSyncResult[]> {
  const [items, categoryMap] = await Promise.all([
    prisma.plaidItem.findMany({ where: itemIds ? { id: { in: itemIds } } : undefined }),
    buildCategoryMap(),
  ]);
  const settled = await Promise.allSettled(items.map((item) => syncItem(item, categoryMap)));
  const results: ItemSyncResult[] = settled.map((s, i) => {
    const itemId = items[i].id;
    if (s.status === "fulfilled") return { itemId, ok: true, ...s.value };
    const { message, code } = describeError(s.reason);
    return { itemId, ok: false, error: message, errorCode: code };
  });
  // Sweep recently-synced transactions for credit-card payments that the direct category
  // mapping missed (e.g. rows tagged only by name), so they're excluded as transfers.
  // Nothing new or changed → nothing to reclassify.
  const changed = results.some((r) => r.ok && r.added + r.modified > 0);
  if (changed) {
    await classifyCreditCardPayments(prisma, {
      windowDays: 120,
      ccCategoryId: categoryMap.ccPaymentId ?? undefined,
    });
  }
  return results;
}
