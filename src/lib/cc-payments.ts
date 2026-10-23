import type { PrismaClient } from "@prisma/client";

// Plaid's detailed personal_finance_category for a credit-card payment. This is the
// definitive signal — its primary counterpart (LOAN_PAYMENTS) is shared with real loans.
export const CC_PAYMENT_DETAILED = "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT";
const LOAN_PAYMENTS_PRIMARY = "LOAN_PAYMENTS";

// The preset TRANSFER subcategory that credit-card payments land in.
export const CC_PAYMENT_CATEGORY_NAME = "Credit Card Payment";

// Conservative, credit-card-specific name patterns. Used ONLY as a fallback for rows that
// have no stored Plaid detailed category (e.g. historical transactions synced before this
// feature). Deliberately does NOT match bare "autopay"/"bill pay", which also describe
// utility, insurance, and subscription charges we must keep counting as spending.
const CC_PAYMENT_NAME = new RegExp(
  [
    "payment\\s*-?\\s*thank\\s*you", // "AUTOPAY PAYMENT - THANK YOU", "PAYMENT THANK YOU"
    "thank\\s*you\\s*-?\\s*payment",
    "credit\\s*card\\s*payment",
    "\\bcc\\s*pay(?:ment)?\\b",
    "credit\\s*crd[^a-z]*(?:auto)?(?:pay|pmt|pymt|epay)", // "CHASE CREDIT CRD EPAY"
    "\\be-?pay(?:ment)?\\b", // "AMEX EPAYMENT", "DISCOVER E-PAYMENT"
    "cardmember\\s*serv", // "CARDMEMBER SERV WEB PYMT"
    // ACH card-payment originators: match specific payment tokens after "DES:", but NOT a
    // bare "DES:PAYMENT" (that also covers e.g. church/vendor ACH debits we must keep).
    "des:\\s*(?:auto\\s?pay|e-?payment|epay|pmt|cc\\s?pmt)\\b",
    // Bilt card payments arrive as "BILT CARD DES:HOUSING" / "BILT CARD DES:PMT" — an
    // unusual descriptor. The originator "BILT CARD DES:" is the payment leg (the actual
    // rent is a separate charge named "Bilt Housing Payment" on the card, which stays spend).
    "\\bbilt\\s*card\\s+des:",
  ].join("|"),
  "i"
);

export type CandidateTx = {
  plaidPrimary?: string | null;
  plaidDetailed?: string | null;
  name: string;
  accountType?: string | null;
  amount: number;
};

/**
 * Decide whether a transaction is a credit-card payment (an internal transfer that must be
 * excluded from spending/income). Signals, strongest first:
 *   1. Plaid's detailed category is the credit-card-payment category — definitive.
 *   2. An inflow on a credit-type account tagged as a loan payment — the card-side leg.
 *   3. Fallback: a credit-card-specific name pattern. These patterns are deliberately
 *      specific (e.g. "PAYMENT - THANK YOU", "BILT CARD DES:", "CARDMEMBER SERV", ACH
 *      "DES:AUTOPAY/EPAY/PMT") rather than bare "payment", so we trust them even over a
 *      Plaid category — some issuers (e.g. Bilt rent) get tagged as rent/utilities by Plaid.
 */
export function isCreditCardPayment(tx: CandidateTx): boolean {
  if (tx.plaidDetailed === CC_PAYMENT_DETAILED) return true;

  // Card-side leg: money landing on a linked credit card (an inflow that reduces the
  // balance). This is only ever reached for `amount < 0` on a credit account, so it can
  // never catch the purchase/charge side. We confirm it's a payment (not a refund, which
  // keeps its original merchant name/category) via Plaid's LOAN_PAYMENTS tag or a
  // payment-word in the name — e.g. "Payment - Bilt Housing", "PAYMENT THANK YOU".
  if (tx.accountType === "credit" && tx.amount < 0) {
    if (tx.plaidPrimary === LOAN_PAYMENTS_PRIMARY) return true;
    if (/\b(?:payment|pmt|pymt|autopay|auto\s?pay|e-?pay(?:ment)?)\b/i.test(tx.name)) {
      return true;
    }
  }

  // Name fallback (see note above): the patterns are specific enough to trust over Plaid.
  if (CC_PAYMENT_NAME.test(tx.name)) return true;

  return false;
}

export type ClassifyChange = {
  name: string;
  amount: number;
  wasReviewed: boolean;
  fromCategory: string | null;
};

export type ClassifyResult = {
  cardSide: number; // inflows on credit accounts reclassified (were mis-counted as income)
  depositorySide: number; // outflows reclassified (were double-counted as spending)
  total: number;
  changes: ClassifyChange[];
};

/**
 * Reclassify recognized credit-card payments in a recent window into the "Credit Card
 * Payment" TRANSFER category, so they drop out of spending and income totals.
 *
 * Safety rules:
 *   - Only ever moves rows INTO the transfer category — never disturbs a row already in a
 *     TRANSFER category (so manually-set transfers/income are left alone).
 *   - Only moves rows the recognizer flags as credit-card payments.
 *   - By default respects the `reviewed` flag; pass `includeReviewed` to also re-tag
 *     manually-reviewed rows (used when the user opts into overriding clear card payments).
 */
export async function classifyCreditCardPayments(
  prisma: PrismaClient,
  // `ccCategoryId` skips the category lookup when the caller already has it.
  opts: { windowDays: number; includeReviewed?: boolean; ccCategoryId?: string }
): Promise<ClassifyResult> {
  const ccCategoryId =
    opts.ccCategoryId ??
    (
      await prisma.category.findFirst({
        where: { name: CC_PAYMENT_CATEGORY_NAME, group: "TRANSFER" },
        select: { id: true },
      })
    )?.id;
  if (!ccCategoryId) {
    throw new Error(
      `"${CC_PAYMENT_CATEGORY_NAME}" TRANSFER category not found — run \`npm run db:seed\` first.`
    );
  }

  const since = new Date();
  since.setDate(since.getDate() - opts.windowDays);

  // Only candidates: uncategorized or in a non-transfer category (that also excludes rows
  // already in the credit-card category, and leaves other transfers alone).
  const txs = await prisma.transaction.findMany({
    where: {
      date: { gte: since },
      ...(opts.includeReviewed ? {} : { reviewed: false }),
      OR: [{ categoryId: null }, { category: { group: { not: "TRANSFER" } } }],
    },
    select: {
      id: true,
      name: true,
      amount: true,
      reviewed: true,
      plaidPrimary: true,
      plaidDetailed: true,
      account: { select: { type: true } },
      category: { select: { name: true } },
    },
  });

  const result: ClassifyResult = { cardSide: 0, depositorySide: 0, total: 0, changes: [] };
  const ids: string[] = [];

  for (const t of txs) {
    const isCard = isCreditCardPayment({
      plaidPrimary: t.plaidPrimary,
      plaidDetailed: t.plaidDetailed,
      name: t.name,
      accountType: t.account?.type ?? null,
      amount: t.amount,
    });
    if (!isCard) continue;

    ids.push(t.id);
    result.changes.push({
      name: t.name,
      amount: t.amount,
      wasReviewed: t.reviewed,
      fromCategory: t.category?.name ?? null,
    });
    if (t.amount < 0) result.cardSide++;
    else result.depositorySide++;
    result.total++;
  }

  if (ids.length) {
    await prisma.transaction.updateMany({
      where: { id: { in: ids } },
      // Recognized as a transfer → also drop it from the monthly spend total.
      data: { categoryId: ccCategoryId, includedInSpending: false },
    });
  }

  return result;
}
