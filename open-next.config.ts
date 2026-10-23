import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  // Prerendered pages are served straight from the assets bundle (read-only; this app has
  // no ISR/revalidation), and cache interception skips booting the Next server for them.
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
