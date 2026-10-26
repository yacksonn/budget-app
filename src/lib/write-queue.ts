import { mutate } from "swr";
import { apiSend, invalidate } from "@/lib/fetcher";

// Transaction edits are applied to the UI immediately and their DB writes queued here.
// Writes go out one at a time; unsent edits to the same row merge into one PATCH. Each
// write sets absolute values on a single row, so a failure doesn't affect later writes.
// Lives at module scope so in-app navigation doesn't drop pending writes.

type Patch = Record<string, unknown>;
type Listener = {
  onError: (id: string, err: unknown) => void;
  // List key that already reflects the edits (skip refetching it); undefined = refetch it.
  skipKey: () => string | undefined;
};

const pending = new Map<string, Patch>();
let running = false;
let failed = false;
let touchedCategory = false;
let listener: Listener | null = null;

export function setQueueListener(l: Listener | null) {
  listener = l;
}

export function hasPending() {
  return running || pending.size > 0;
}

export function enqueue(id: string, patch: Patch) {
  pending.set(id, { ...pending.get(id), ...patch });
  if ("categoryId" in patch) touchedCategory = true;
  void run();
}

async function run() {
  if (running) return;
  running = true;
  while (pending.size) {
    const [id, patch] = pending.entries().next().value!;
    pending.delete(id);
    try {
      const { transaction } = await apiSend("/api/transactions", "PATCH", { id, ...patch });
      // Reconcile cached lists with the saved row, unless a newer edit to it is still
      // queued (its optimistic value is what should stay on screen).
      if (!pending.has(id)) applyServerRow(transaction);
    } catch (err) {
      failed = true;
      if (listener) listener.onError(id, err);
      else console.error("Failed to save transaction", id, err);
    }
  }
  running = false;

  // Once per burst: refresh dependent views. After a failure, also refetch the list so the
  // failed change rolls back while every successful write is kept.
  const prefixes = ["/api/summary", "/api/transactions"];
  if (touchedCategory) prefixes.push("/api/categories");
  invalidate(prefixes, failed ? undefined : listener?.skipKey());
  failed = false;
  touchedCategory = false;
}

function applyServerRow(row: { id: string }) {
  void mutate(
    (key) => typeof key === "string" && key.startsWith("/api/transactions"),
    (d: any) =>
      d && { ...d, transactions: d.transactions.map((t: any) => (t.id === row.id ? row : t)) },
    { revalidate: false }
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (!hasPending()) return;
    e.preventDefault();
    e.returnValue = "";
  });
}
