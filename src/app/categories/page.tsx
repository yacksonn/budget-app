"use client";

import useSWR, { mutate } from "swr";
import { useState } from "react";
import { fetcher, apiSend, invalidate } from "@/lib/fetcher";

const GROUP_LABELS: Record<string, string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
  TRANSFER: "Transfer",
};

const KEY = "/api/categories";

// Category writes follow the same pattern as transaction edits: the cached list is updated
// right away and the DB writes go out one at a time in the background. Once a burst of
// writes drains, every cached view is refreshed in the background (this list picks up
// server ids for new rows; a failed write rolls back via the refetch).
let chain: Promise<void> = Promise.resolve();
let inFlight = 0;

function optimistic(
  change: (cats: any[]) => any[],
  request: () => Promise<unknown>,
  onError: (msg: string) => void
) {
  void mutate(KEY, (d: any) => d && { ...d, categories: change(d.categories) }, { revalidate: false });
  inFlight++;
  chain = chain.then(async () => {
    try {
      await request();
    } catch (e: any) {
      onError(e.message);
    }
    if (--inFlight === 0) invalidate();
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (!inFlight) return;
    e.preventDefault();
    e.returnValue = "";
  });
}

export default function CategoriesPage() {
  const { data } = useSWR(KEY, fetcher);
  const categories = data?.categories ?? [];
  const parents = categories.filter((c: any) => !c.parentId);
  // Rows still being created have a temp id; they can't be edited or used as a parent yet.
  const isSaved = (c: any) => !c.id.startsWith("temp-");
  const savedParents = parents.filter(isSaved);

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [group, setGroup] = useState("EXPENSE");
  const [icon, setIcon] = useState("🏷️");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    const body = { name: name.trim(), parentId: parentId || null, group, icon };
    const parent = categories.find((c: any) => c.id === parentId);
    const temp = {
      id: `temp-${Date.now()}`,
      ...body,
      group: parent ? parent.group : group,
      icon: icon || (parent ? null : "🏷️"),
      color: "#6366f1",
      isCustom: true,
      sortOrder: 500,
      _count: { transactions: 0 },
    };
    optimistic(
      (cats) => [...cats, temp],
      () => apiSend(KEY, "POST", body),
      setError
    );
    setName("");
  }

  function save(category: any, patch: { name: string; icon: string | null; parentId: string | null; group: string }) {
    setError(null);
    const parent = categories.find((c: any) => c.id === patch.parentId);
    const next = { ...patch, group: parent ? parent.group : patch.group };
    optimistic(
      (cats) =>
        cats.map((c) =>
          c.id === category.id
            ? { ...c, ...next }
            : // A top-level group change carries down to its subcategories.
              !next.parentId && c.parentId === category.id
              ? { ...c, group: next.group }
              : c
        ),
      () => apiSend(KEY, "PATCH", { id: category.id, ...patch }),
      setError
    );
  }

  function remove(id: string) {
    if (categories.some((c: any) => c.parentId === id)) {
      setError("Move or delete its subcategories first.");
      return;
    }
    setError(null);
    optimistic(
      (cats) => cats.filter((c) => c.id !== id),
      () => apiSend(`${KEY}?id=${id}`, "DELETE"),
      setError
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Categories</h1>
        <p className="text-sm text-ink-muted">
          Add, edit, move, or delete any category.
        </p>
      </div>

      <form onSubmit={add} className="card grid gap-3 md:grid-cols-[auto,1fr,1fr,1fr,auto]">
        <input
          className="input w-16 text-center text-lg"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          aria-label="Icon"
        />
        <input
          className="input"
          placeholder="New category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="input"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
        >
          <option value="">Top-level category</option>
          {savedParents.map((p: any) => (
            <option key={p.id} value={p.id}>
              Under {p.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          disabled={Boolean(parentId)}
          title={parentId ? "Subcategories inherit the parent's group" : ""}
        >
          <option value="EXPENSE">Expense</option>
          <option value="INCOME">Income</option>
          <option value="TRANSFER">Transfer</option>
        </select>
        <button className="btn-primary">
          Add
        </button>
      </form>
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button className="text-xs hover:underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="space-y-4">
        {parents.map((p: any) => {
          const children = categories.filter((c: any) => c.parentId === p.id);
          return (
            <div key={p.id} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="grid h-8 w-8 place-items-center rounded-lg text-lg"
                    style={{ backgroundColor: (p.color ?? "#e2e8f0") + "22" }}
                  >
                    {p.icon}
                  </span>
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-ink-muted">
                      {GROUP_LABELS[p.group]}
                      {p.isCustom ? " · custom" : ""}
                    </p>
                  </div>
                </div>
                {isSaved(p) && (
                  <div className="flex items-center gap-3 text-xs">
                    <button className="text-ink-muted hover:underline" onClick={() => setEditingId(p.id)}>
                      Edit
                    </button>
                    <button className="text-red-600 dark:text-red-400 hover:underline" onClick={() => remove(p.id)}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
              {editingId === p.id && (
                <CategoryEditor
                  category={p}
                  parents={savedParents}
                  hasChildren={children.length > 0}
                  onSave={(patch) => save(p, patch)}
                  onDone={() => setEditingId(null)}
                />
              )}
              {children.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {children.map((c: any) => (
                    <span
                      key={c.id}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-soft px-3 py-1 text-xs"
                    >
                      {c.name}
                      <span className="text-ink-muted">({c._count.transactions})</span>
                      {isSaved(c) && (
                        <>
                          <button
                            className="text-ink-muted hover:text-ink"
                            onClick={() => setEditingId(c.id)}
                            title="Edit / move"
                          >
                            ✎
                          </button>
                          <button
                            className="text-red-500 hover:text-red-700"
                            onClick={() => remove(c.id)}
                            title="Delete"
                          >
                            ×
                          </button>
                        </>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {children.map(
                (c: any) =>
                  editingId === c.id && (
                    <CategoryEditor
                      key={c.id}
                      category={c}
                      parents={savedParents}
                      hasChildren={false}
                      onSave={(patch) => save(c, patch)}
                      onDone={() => setEditingId(null)}
                    />
                  )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryEditor({
  category,
  parents,
  hasChildren,
  onSave,
  onDone,
}: {
  category: any;
  parents: any[];
  hasChildren: boolean;
  onSave: (patch: { name: string; icon: string | null; parentId: string | null; group: string }) => void;
  onDone: () => void;
}) {
  const [icon, setIcon] = useState(category.icon ?? "");
  const [name, setName] = useState(category.name);
  const [parentId, setParentId] = useState(category.parentId ?? "");
  const [group, setGroup] = useState(category.group);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), icon: icon || null, parentId: parentId || null, group });
    onDone();
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-2 rounded-lg border border-surface-border p-3">
      <div className="grid gap-2 md:grid-cols-[auto,1fr,1fr,1fr,auto,auto]">
        <input
          className="input w-16 text-center text-lg"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          aria-label="Icon"
        />
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        <select
          className="input"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          disabled={hasChildren}
          title={hasChildren ? "Move its subcategories out before nesting it" : ""}
        >
          <option value="">Top-level category</option>
          {parents
            .filter((p) => p.id !== category.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                Under {p.name}
              </option>
            ))}
        </select>
        <select
          className="input"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          disabled={Boolean(parentId)}
          title={parentId ? "Subcategories inherit the parent's group" : ""}
        >
          <option value="EXPENSE">Expense</option>
          <option value="INCOME">Income</option>
          <option value="TRANSFER">Transfer</option>
        </select>
        <button className="btn-primary">
          Save
        </button>
        <button type="button" className="text-sm text-ink-muted hover:underline" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
