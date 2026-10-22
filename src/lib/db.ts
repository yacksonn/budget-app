import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const isWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

// On Workers, a DB connection opened in one request can't be used by another, so keep
// one client per request (keyed on the request's ExecutionContext).
const perRequest = new WeakMap<object, PrismaClient>();

// Off Workers (next dev, scripts), reuse a single client across hot-reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (isWorkers) {
    const { ctx } = getCloudflareContext();
    let client = perRequest.get(ctx);
    if (!client) {
      client = createClient();
      perRequest.set(ctx, client);
    }
    return client;
  }
  return (globalForPrisma.prisma ??= createClient());
}

// Same `prisma.model.method()` API as before; resolves to the right client on each access.
export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
