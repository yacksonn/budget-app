import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const isWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

// On Cloudflare, read vars/secrets from the Worker's env bindings; elsewhere use process.env.
// Read at call time (not module load) so values are available per request.
function env(name: string): string | undefined {
  if (isWorkers) {
    const value = (getCloudflareContext().env as Record<string, unknown>)[name];
    if (typeof value === "string") return value;
  }
  return process.env[name];
}

// PlaidApi holds no connections, so one instance can be reused across requests. Rebuilt
// only if the credentials/environment change.
let cached: { key: string; client: PlaidApi } | null = null;

function getClient(): PlaidApi {
  const plaidEnv = (env("PLAID_ENV") || "sandbox") as keyof typeof PlaidEnvironments;
  const clientId = env("PLAID_CLIENT_ID");
  const secret = env("PLAID_SECRET");
  const key = `${plaidEnv}:${clientId}:${secret}`;
  if (cached?.key !== key) {
    const client = new PlaidApi(
      new Configuration({
        basePath: PlaidEnvironments[plaidEnv],
        baseOptions: { headers: { "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret } },
      })
    );
    cached = { key, client };
  }
  return cached.client;
}

// Same `plaidClient.method()` API as before; resolves to the cached client on each access.
export const plaidClient = new Proxy({} as PlaidApi, {
  get(_, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function plaidProducts(): string[] {
  return (env("PLAID_PRODUCTS") || "transactions").split(",").map((p) => p.trim());
}

export function plaidCountryCodes(): string[] {
  return (env("PLAID_COUNTRY_CODES") || "US").split(",").map((c) => c.trim());
}

export function plaidConfigured(): boolean {
  return Boolean(env("PLAID_CLIENT_ID") && env("PLAID_SECRET"));
}
