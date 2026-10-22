import { PrismaClient } from "@prisma/client";
import { GROCERIES_CATEGORY_NAME, isGroceryMerchant } from "../src/lib/merchant-rules";

// One-time backfill: move existing Costco/Walmart transactions into Groceries (gas-station
// purchases excluded). Skips reviewed rows so manual categorizations are preserved.
// Pass --dry-run to preview without writing.
const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const groceries = await prisma.category.findFirst({
    where: { name: GROCERIES_CATEGORY_NAME, parentId: { not: null } },
  });
  if (!groceries) throw new Error(`"${GROCERIES_CATEGORY_NAME}" category not found.`);

  const txs = await prisma.transaction.findMany({
    where: { reviewed: false, NOT: { categoryId: groceries.id } },
    include: { category: true },
  });
  const matches = txs.filter((t) => isGroceryMerchant(t.name, t.merchantName));

  for (const t of matches) {
    console.log(
      `  ${t.date.toISOString().slice(0, 10)}  ${t.amount.toFixed(2).padStart(8)}  ` +
        `${t.name}  (${t.category?.name ?? "Uncategorized"} → ${GROCERIES_CATEGORY_NAME})`
    );
    if (!dryRun) {
      await prisma.transaction.update({
        where: { id: t.id },
        data: { categoryId: groceries.id },
      });
    }
  }
  console.log(`${dryRun ? "[dry run] Would move" : "Moved"} ${matches.length} transaction(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
