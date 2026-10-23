"use client";

import { SWRConfig } from "swr";

// Data only changes through this app's own writes (which call `invalidate`), so don't
// refetch on tab focus or when revisiting a page that already has cached data.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{ revalidateOnFocus: false, revalidateIfStale: false, keepPreviousData: true }}
    >
      {children}
    </SWRConfig>
  );
}
