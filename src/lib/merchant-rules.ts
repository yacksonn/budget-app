// Merchant-specific category defaults that override Plaid's category for new transactions.
// Costco and Walmart default to Groceries (Plaid often tags them General Merchandise),
// except gas-station purchases such as "Costco Gas", which keep Plaid's Gas category.
export const GROCERIES_CATEGORY_NAME = "Groceries";

export function isGroceryMerchant(name: string, merchantName?: string | null): boolean {
  if (/\bgas\b/i.test(name)) return false;
  return /\b(?:costco|wal-?mart)\b/i.test(`${merchantName ?? ""} ${name}`);
}
