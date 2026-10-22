import { PrismaClient } from "@prisma/client";
import { defaultIncludedInSpending } from "../src/lib/spending";

// One-time backfill for the `includedInSpending` checkbox: set it to the computed default
// (outflow in a non-transfer category) for every existing transaction, so the checkbox
// starts out checked for exactly the transactions that were already in the "spent" total.
const prisma = new PrismaClient();

async function main() {
  const txs = await prisma.transaction.findMany({ include: { category: true } });
  let included = 0;
  let excluded = 0;

  for (const t of txs) {
    const value = defaultIncludedInSpending(t.amount, t.category?.group);
    if (t.includedInSpending !== value) {
      await prisma.transaction.update({
        where: { id: t.id },
        data: { includedInSpending: value },
      });
    }
    if (value) included++;
    else excluded++;
  }

  console.log(`Backfilled includedInSpending across ${txs.length} transaction(s):`);
  console.log(`  • ${included} checked (count toward monthly spend)`);
  console.log(`  • ${excluded} unchecked (income, transfers, credit-card payments)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
