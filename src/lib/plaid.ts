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

function createClient() {
  const plaidEnv = (env("PLAID_ENV") || "sandbox") as keyof typeof PlaidEnvironments;
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[plaidEnv],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": env("PLAID_CLIENT_ID"),
          "PLAID-SECRET": env("PLAID_SECRET"),
        },
      },
    })
  );
}

// Same `plaidClient.method()` API as before; built on each access from the current env.
export const plaidClient = new Proxy({} as PlaidApi, {
  get(_, prop) {
    const client = createClient();
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
