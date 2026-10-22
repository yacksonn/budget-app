// Single source of truth for the default "counts toward monthly spend" rule.
// A transaction defaults to included when it's an outflow (positive amount, Plaid
// convention) in a non-transfer category. Users can override this per row via the
// `includedInSpending` checkbox; the monthly spend total is driven by that flag.
export function defaultIncludedInSpending(
  amount: number,
  group?: string | null
): boolean {
  return amount > 0 && group !== "TRANSFER";
}
