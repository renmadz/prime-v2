import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

function getClient(): PrismaClient {
  if (!globalThis.__prismaClient) {
    // Constructed lazily (on first real use, not at import time) so
    // process.env.DATABASE_URL is guaranteed to be set — ESM hoists imports
    // above any top-level `process.env.X = ...` assignment a caller makes
    // (e.g. tests that set env vars before calling buildApp()).
    globalThis.__prismaClient = new PrismaClient();
  }
  return globalThis.__prismaClient;
}

// Proxy defers client construction until the first property/method access.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
