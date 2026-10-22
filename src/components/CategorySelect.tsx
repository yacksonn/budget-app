"use client";

type Cat = {
  id: string;
  name: string;
  group: string;
  parentId: string | null;
  icon?: string | null;
};

// Groups categories into optgroups by their top-level parent.
export function CategorySelect({
  categories,
  value,
  onChange,
  allowNone = true,
  className = "",
}: {
  categories: Cat[];
  value: string | null;
  onChange: (id: string | null) => void;
  allowNone?: boolean;
  className?: string;
}) {
  const parents = categories.filter((c) => !c.parentId);

  return (
    <select
      className={`input ${className}`}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      {allowNone && <option value="">Uncategorized</option>}
      {parents.map((p) => {
        const children = categories.filter((c) => c.parentId === p.id);
        return (
          <optgroup key={p.id} label={`${p.icon ?? ""} ${p.name}`.trim()}>
            <option value={p.id}>{p.name} (all)</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
