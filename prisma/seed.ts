import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedChild = { name: string; plaidPrimary?: string; plaidDetailed?: string };
type SeedParent = {
  name: string;
  group: "INCOME" | "EXPENSE" | "TRANSFER";
  icon: string;
  color: string;
  children: SeedChild[];
};

// Monarch-style preset category tree. `plaidPrimary` maps Plaid's
// personal_finance_category.primary to the default landing subcategory.
const TREE: SeedParent[] = [
  {
    name: "Income",
    group: "INCOME",
    icon: "💰",
    color: "#16a34a",
    children: [
      { name: "Paychecks", plaidPrimary: "INCOME" },
      { name: "Interest" },
      { name: "Other Income" },
    ],
  },
  {
    name: "Home",
    group: "EXPENSE",
    icon: "🏠",
    color: "#0ea5e9",
    children: [
      { name: "Rent/Mortgage" },
      { name: "Utilities", plaidPrimary: "RENT_AND_UTILITIES" },
      { name: "Home Improvement", plaidPrimary: "HOME_IMPROVEMENT" },
    ],
  },
  {
    name: "Auto & Transport",
    group: "EXPENSE",
    icon: "🚗",
    color: "#f59e0b",
    children: [
      { name: "Gas", plaidPrimary: "TRANSPORTATION" },
      { name: "Auto Payment" },
      { name: "Parking" },
      { name: "Public Transit" },
    ],
  },
  {
    name: "Food & Dining",
    group: "EXPENSE",
    icon: "🍔",
    color: "#ef4444",
    children: [
      { name: "Groceries" },
      { name: "Restaurants", plaidPrimary: "FOOD_AND_DRINK" },
      { name: "Coffee Shops" },
    ],
  },
  {
    name: "Shopping",
    group: "EXPENSE",
    icon: "🛍️",
    color: "#ec4899",
    children: [
      { name: "General Merchandise", plaidPrimary: "GENERAL_MERCHANDISE" },
      { name: "Clothing" },
      { name: "Electronics" },
    ],
  },
  {
    name: "Entertainment",
    group: "EXPENSE",
    icon: "🎬",
    color: "#8b5cf6",
    children: [
      { name: "Movies & Events", plaidPrimary: "ENTERTAINMENT" },
      { name: "Streaming" },
      { name: "Hobbies" },
    ],
  },
  {
    name: "Travel",
    group: "EXPENSE",
    icon: "✈️",
    color: "#14b8a6",
    children: [
      { name: "Flights & Hotels", plaidPrimary: "TRAVEL" },
      { name: "Vacation" },
    ],
  },
  {
    name: "Health & Wellness",
    group: "EXPENSE",
    icon: "⚕️",
    color: "#10b981",
    children: [
      { name: "Medical", plaidPrimary: "MEDICAL" },
      { name: "Pharmacy" },
      { name: "Fitness" },
    ],
  },
  {
    name: "Personal Care",
    group: "EXPENSE",
    icon: "🧴",
    color: "#f472b6",
    children: [
      { name: "Hair & Beauty", plaidPrimary: "PERSONAL_CARE" },
      { name: "Laundry" },
    ],
  },
  {
    name: "Services",
    group: "EXPENSE",
    icon: "🛠️",
    color: "#64748b",
    children: [{ name: "General Services", plaidPrimary: "GENERAL_SERVICES" }],
  },
  {
    name: "Financial",
    group: "EXPENSE",
    icon: "🏦",
    color: "#475569",
    children: [
      { name: "Bank Fees", plaidPrimary: "BANK_FEES" },
      { name: "Loan Payment", plaidPrimary: "LOAN_PAYMENTS" },
      { name: "Government & Non-Profit", plaidPrimary: "GOVERNMENT_AND_NON_PROFIT" },
    ],
  },
  {
    name: "Transfers",
    group: "TRANSFER",
    icon: "🔄",
    color: "#94a3b8",
    children: [
      { name: "Transfer In", plaidPrimary: "TRANSFER_IN" },
      { name: "Transfer Out", plaidPrimary: "TRANSFER_OUT" },
      // Plaid tags credit-card payments with primary LOAN_PAYMENTS (shared with real
      // loans), so we map on the more specific `detailed` category instead.
      { name: "Credit Card Payment", plaidDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" },
    ],
  },
];

async function findOrCreate(data: {
  name: string;
  group: string;
  icon?: string;
  color?: string;
  plaidPrimary?: string;
  plaidDetailed?: string;
  sortOrder: number;
  parentId: string | null;
}) {
  const existing = await prisma.category.findFirst({
    where: { name: data.name, parentId: data.parentId },
  });
  if (existing) {
    // Backfill newly-added mapping fields on re-seed without clobbering existing values.
    const patch: { plaidPrimary?: string; plaidDetailed?: string } = {};
    if (data.plaidPrimary && !existing.plaidPrimary) patch.plaidPrimary = data.plaidPrimary;
    if (data.plaidDetailed && !existing.plaidDetailed) patch.plaidDetailed = data.plaidDetailed;
    if (Object.keys(patch).length > 0) {
      return prisma.category.update({ where: { id: existing.id }, data: patch });
    }
    return existing;
  }
  return prisma.category.create({ data });
}

async function main() {
  let sort = 0;
  for (const parent of TREE) {
    const parentRow = await findOrCreate({
      name: parent.name,
      group: parent.group,
      icon: parent.icon,
      color: parent.color,
      sortOrder: sort++,
      parentId: null,
    });
    let childSort = 0;
    for (const child of parent.children) {
      await findOrCreate({
        name: child.name,
        group: parent.group,
        icon: parent.icon,
        color: parent.color,
        plaidPrimary: child.plaidPrimary,
        plaidDetailed: child.plaidDetailed,
        sortOrder: childSort++,
        parentId: parentRow.id,
      });
    }
  }

  // Fallback bucket for anything unmatched.
  await findOrCreate({
    name: "Uncategorized",
    group: "EXPENSE",
    icon: "❓",
    color: "#cbd5e1",
    sortOrder: 999,
    parentId: null,
  });

  const count = await prisma.category.count();
  console.log(`Seed complete. ${count} categories present.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
