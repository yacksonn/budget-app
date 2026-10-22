// One-time copy of all data from the old local SQLite DB (prisma/dev.db) into the
// Postgres database in DATABASE_URL (Supabase). IDs are preserved so relations stay intact.
// The target must be empty; the whole copy runs in one transaction (all-or-nothing).
//
// Run: npx tsx prisma/copy-sqlite-to-supabase.ts
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const sqlite = new DatabaseSync(path.join(__dirname, "dev.db"), { readOnly: true });

type Row = Record<string, unknown>;

// SQLite stores DateTime as epoch-ms integers and Boolean as 0/1; convert using the Prisma schema.
function readTable(model: string): Row[] {
  const fields = Prisma.dmmf.datamodel.models.find((m) => m.name === model)!.fields;
  const rows = sqlite.prepare(`SELECT * FROM "${model}"`).all() as Row[];
  return rows.map((row) => {
    const out: Row = {};
    for (const f of fields) {
      if (f.kind !== "scalar" || !(f.name in row)) continue;
      const v = row[f.name];
      if (v === null) out[f.name] = null;
      else if (f.type === "DateTime") out[f.name] = new Date(v as number | string);
      else if (f.type === "Boolean") out[f.name] = Boolean(v);
      else out[f.name] = v;
    }
    return out;
  });
}

// Parents must be inserted before children (Category.parentId references Category.id).
function parentsFirst(categories: Row[]): Row[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const depth = (c: Row): number => (c.parentId ? 1 + depth(byId.get(c.parentId)!) : 0);
  return [...categories].sort((a, b) => depth(a) - depth(b));
}

async function main() {
  const counts = {
    PlaidItem: await prisma.plaidItem.count(),
    Account: await prisma.account.count(),
    Category: await prisma.category.count(),
    Transaction: await prisma.transaction.count(),
    Budget: await prisma.budget.count(),
  };
  if (Object.values(counts).some((n) => n > 0)) {
    console.error("Target database is not empty:", counts);
    console.error("Clear it with `npx prisma db push --force-reset` (do NOT seed), then re-run.");
    process.exit(1);
  }

  const data = {
    plaidItems: readTable("PlaidItem"),
    accounts: readTable("Account"),
    categories: parentsFirst(readTable("Category")),
    transactions: readTable("Transaction"),
    budgets: readTable("Budget"),
  };

  await prisma.$transaction([
    prisma.plaidItem.createMany({ data: data.plaidItems as any }),
    prisma.account.createMany({ data: data.accounts as any }),
    // One insert per category so parents are committed before their children.
    ...data.categories.map((c) => prisma.category.create({ data: c as any })),
    prisma.transaction.createMany({ data: data.transactions as any }),
    prisma.budget.createMany({ data: data.budgets as any }),
  ]);

  console.log("Copied:", {
    PlaidItem: data.plaidItems.length,
    Account: data.accounts.length,
    Category: data.categories.length,
    Transaction: data.transactions.length,
    Budget: data.budgets.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    sqlite.close();
    await prisma.$disconnect();
  });
