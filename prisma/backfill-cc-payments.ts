import { PrismaClient } from "@prisma/client";
import { classifyCreditCardPayments } from "../src/lib/cc-payments";

// One-time backfill: reclassify already-synced credit-card payments into the
// "Credit Card Payment" TRANSFER category so past months stop double-counting them.
// Safe to re-run — it skips user-reviewed rows and rows already categorized as transfers.
const prisma = new PrismaClient();

async function main() {
  const windowDays = Number(process.env.BACKFILL_WINDOW_DAYS ?? 400);
  console.log(`Scanning transactions from the last ${windowDays} days...`);

  const { cardSide, depositorySide, total, changes } = await classifyCreditCardPayments(
    prisma,
    { windowDays, includeReviewed: true }
  );

  console.log(`Reclassified ${total} transaction(s) as "Credit Card Payment":`);
  console.log(`  • ${depositorySide} outflow(s) — removed from spending (double-count fix)`);
  console.log(`  • ${cardSide} inflow(s) on cards — removed from income (mis-count fix)`);
  if (total === 0) {
    console.log("  (nothing matched — no changes made)");
    return;
  }
  console.log("\nDetails (★ = overrode a transaction you had manually reviewed):");
  for (const c of changes) {
    const flag = c.wasReviewed ? "★" : " ";
    const amt = `$${Math.abs(c.amount).toFixed(2)}`.padStart(10);
    console.log(`  ${flag} ${amt}  from "${c.fromCategory ?? "Uncategorized"}"  |  ${c.name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
