"use client";

import useSWR from "swr";
import { useState } from "react";
import { fetcher, apiSend, invalidate } from "@/lib/fetcher";

const GROUP_LABELS: Record<string, string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
  TRANSFER: "Transfer",
};

export default function CategoriesPage() {
  const { data } = useSWR("/api/categories", fetcher);
  const categories = data?.categories ?? [];
  const parents = categories.filter((c: any) => !c.parentId);

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [group, setGroup] = useState("EXPENSE");
  const [icon, setIcon] = useState("🏷️");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/categories", "POST", {
        name,
        parentId: parentId || null,
        group,
        icon,
      });
      setName("");
      invalidate();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const [editingId, setEditingId] = useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm("Delete this category? Its transactions become uncategorized and its budgets are removed.")) return;
    try {
      await apiSend(`/api/categories?id=${id}`, "DELETE");
      invalidate();
    } catch (e: any) {
      alert(e.message);
    }
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
          {parents.map((p: any) => (
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
        <button className="btn-primary" disabled={busy}>
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

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
                <div className="flex items-center gap-3 text-xs">
                  <button className="text-ink-muted hover:underline" onClick={() => setEditingId(p.id)}>
                    Edit
                  </button>
                  <button className="text-red-600 dark:text-red-400 hover:underline" onClick={() => remove(p.id)}>
                    Delete
                  </button>
                </div>
              </div>
              {editingId === p.id && (
                <CategoryEditor
                  category={p}
                  parents={parents}
                  hasChildren={children.length > 0}
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
                      parents={parents}
                      hasChildren={false}
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
  onDone,
}: {
  category: any;
  parents: any[];
  hasChildren: boolean;
  onDone: () => void;
}) {
  const [icon, setIcon] = useState(category.icon ?? "");
  const [name, setName] = useState(category.name);
  const [parentId, setParentId] = useState(category.parentId ?? "");
  const [group, setGroup] = useState(category.group);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/categories", "PATCH", {
        id: category.id,
        name: name.trim(),
        icon: icon || null,
        parentId: parentId || null,
        group,
      });
      invalidate();
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
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
        <button className="btn-primary" disabled={busy}>
          Save
        </button>
        <button type="button" className="text-sm text-ink-muted hover:underline" onClick={onDone}>
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
