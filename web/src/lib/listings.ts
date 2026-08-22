import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type Listing = {
  agentId: number;
  name: string;
  endpoint?: string;
  payout: string;
  createdAt: number;
};

const FILE = path.join(process.cwd(), ".data", "listings.json");

async function readAll(): Promise<Listing[]> {
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Listing[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(rows: Listing[]) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(rows, null, 2));
}

export async function getListings() {
  return readAll();
}

export async function getListing(agentId: number) {
  return (await readAll()).find((row) => row.agentId === agentId) ?? null;
}

export async function saveListing(row: Listing) {
  const rows = await readAll();
  const next = rows.filter((r) => r.agentId !== row.agentId);
  next.push(row);
  await writeAll(next);
  return row;
}

export function assertHttpUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Callback must be http or https");
  }
  return url.toString();
}
