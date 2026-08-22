import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";

export type Listing = {
  agentId: number;
  name: string;
  endpoint?: string;
  /** Set when the agent is backed by one of the public APIs in datasources.ts. */
  sourceId?: string;
  /** Wallet that created the listing. Distinct from payout, which is editable. */
  owner?: string;
  payout: string;
  createdAt: number;
};

/**
 * Local cache of listing metadata that has no on-chain home — currently just a
 * third party's callback URL.
 *
 * Serverless hosts mount the bundle read-only, so `process.cwd()` is not
 * writable there and only the OS temp dir is. Set LISTINGS_DIR to point this at
 * a volume that actually persists; otherwise treat it as a cache that can vanish
 * between requests, and note that anything derivable from the registry is read
 * from the chain instead.
 */
const DIRS = [
  process.env.LISTINGS_DIR,
  path.join(process.cwd(), ".data"),
  path.join(os.tmpdir(), "inferno"),
].filter(Boolean) as string[];

let resolvedFile: string | null = null;

async function writableFile() {
  if (resolvedFile) return resolvedFile;
  for (const dir of DIRS) {
    try {
      await mkdir(dir, { recursive: true });
      resolvedFile = path.join(dir, "listings.json");
      return resolvedFile;
    } catch {
      // read-only or denied, try the next candidate
    }
  }
  return null;
}

async function readAll(): Promise<Listing[]> {
  for (const dir of DIRS) {
    try {
      const parsed = JSON.parse(await readFile(path.join(dir, "listings.json"), "utf8")) as Listing[];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // missing or unreadable, try the next candidate
    }
  }
  return [];
}

export async function getListings() {
  return readAll();
}

export async function getListing(agentId: number) {
  return (await readAll()).find((row) => row.agentId === agentId) ?? null;
}

/**
 * Never throws. By the time this runs the agent is already registered on-chain
 * and gas is spent, so failing to cache the metadata must not fail the request.
 */
export async function saveListing(row: Listing) {
  const next = (await readAll()).filter((r) => r.agentId !== row.agentId);
  next.push(row);
  const file = await writableFile();
  if (!file) {
    console.warn(`No writable location for listings; agent ${row.agentId} metadata not cached.`);
    return row;
  }
  try {
    await writeFile(file, JSON.stringify(next, null, 2));
  } catch (e) {
    console.warn(`Could not cache listing for agent ${row.agentId}:`, e);
  }
  return row;
}

export function assertHttpUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Callback must be http or https");
  }
  return url.toString();
}
