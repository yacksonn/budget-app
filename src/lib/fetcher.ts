import { mutate } from "swr";

export const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Request failed");
    return r.json();
  });

export async function apiSend(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

// Pages reuse cached SWR data instead of refetching on every visit (see Providers), so
// after a write, drop the cached responses it affects: mounted views refetch now (showing
// their previous data meanwhile), others refetch the next time they're shown.
// `prefixes` limits it to keys starting with those paths; omit to invalidate everything.
export function invalidate(prefixes?: string[], except?: string) {
  return mutate(
    (key) =>
      typeof key === "string" &&
      key !== except &&
      (!prefixes || prefixes.some((p) => key.startsWith(p))),
    undefined,
    { revalidate: true }
  );
}
