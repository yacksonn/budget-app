import { useEffect } from "react";
import { mutate, type Middleware } from "swr";

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

// Keys used by currently mounted useSWR hooks (refcounted), registered via Providers.
const mounted = new Map<string, number>();

export const trackMounted: Middleware = (useSWRNext) => (key, fn, config) => {
  useEffect(() => {
    if (typeof key !== "string") return;
    mounted.set(key, (mounted.get(key) ?? 0) + 1);
    return () => {
      const n = (mounted.get(key) ?? 1) - 1;
      if (n) mounted.set(key, n);
      else mounted.delete(key);
    };
  }, [key]);
  return useSWRNext(key, fn, config);
};

// Pages reuse cached SWR data instead of refetching on every visit (see Providers), so
// after a write, refresh the cached responses it affects: views on screen refetch in the
// background and keep showing their current data until the new data arrives; off-screen
// ones are dropped so they refetch the next time they're shown.
// `prefixes` limits it to keys starting with those paths; omit to invalidate everything.
export function invalidate(prefixes?: string[], except?: string) {
  const matches = (key: unknown): key is string =>
    typeof key === "string" &&
    key !== except &&
    (!prefixes || prefixes.some((p) => key.startsWith(p)));
  return Promise.all([
    mutate((key) => matches(key) && mounted.has(key)),
    mutate((key) => matches(key) && !mounted.has(key), undefined, { revalidate: false }),
  ]);
}
