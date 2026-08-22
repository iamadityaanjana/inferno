import { NextResponse } from "next/server";
import { createWalletClient, decodeEventLog, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { registryAbi } from "@/lib/abi";
import { REGISTER_GAS, REGISTRY, RPC_URL } from "@/lib/contracts";
import { allSources, readSource } from "@/lib/datasources";
import { fail } from "@/lib/http";
import { getListings, saveListing } from "@/lib/listings";
import { publicClient } from "@/lib/server-chain";

function ownerAccount() {
  const raw = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!raw) return null;
  const pk = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  return privateKeyToAccount(pk);
}

/** The catalogue, each entry flagged with whether it is already on-chain. */
export async function GET(req: Request) {
  // Dev-only escape hatch for checking a feed without paying for a hire.
  const probe = new URL(req.url).searchParams.get("probe");
  if (probe && process.env.NODE_ENV !== "production") {
    const task = new URL(req.url).searchParams.get("task") ?? "Monad yields";
    return NextResponse.json({ probe, lines: await readSource(probe, task) });
  }

  const listings = await getListings();
  const sources = allSources().map((s) => {
    const listed = listings.find((l) => l.sourceId === s.id);
    return {
      id: s.id,
      name: s.name,
      blurb: s.blurb,
      priceMon: s.priceMon,
      provider: s.provider,
      docs: s.docs,
      agentId: listed?.agentId ?? null,
    };
  });
  return NextResponse.json({ sources, canPublish: Boolean(ownerAccount()) });
}

/**
 * Registers any data source that is not on the registry yet. Idempotent, so it
 * is safe to run repeatedly — already-published sources are skipped rather than
 * duplicated. Owner key only, same as manual listing.
 */
export async function POST() {
  try {
    const account = ownerAccount();
    if (!account) {
      return NextResponse.json({ error: "Publishing is not available right now" }, { status: 503 });
    }
    if (!REGISTRY) {
      return NextResponse.json({ error: "Registry address is not configured" }, { status: 503 });
    }

    const listings = await getListings();
    const pending = allSources().filter((s) => !listings.some((l) => l.sourceId === s.id));
    if (pending.length === 0) {
      return NextResponse.json({ published: [], skipped: allSources().length });
    }

    const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC_URL) });
    const published: { sourceId: string; agentId: number; hash: string }[] = [];

    for (const source of pending) {
      const hash = await wallet.writeContract({
        address: REGISTRY,
        abi: registryAbi,
        functionName: "register",
        args: [source.name, source.blurb, parseEther(source.priceMon), account.address],
        gas: REGISTER_GAS,
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        pollingInterval: 400,
        timeout: 90_000,
      });
      if (receipt.status !== "success") continue;

      let agentId = 0;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== REGISTRY.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: registryAbi,
            eventName: "AgentRegistered",
            data: log.data,
            topics: log.topics,
          });
          agentId = Number(decoded.args.id);
        } catch {
          // not the event we want
        }
      }
      if (!agentId) continue;

      await saveListing({
        agentId,
        name: source.name,
        sourceId: source.id,
        payout: account.address,
        createdAt: Date.now(),
      });
      published.push({ sourceId: source.id, agentId, hash });
    }

    return NextResponse.json({ published, skipped: allSources().length - pending.length });
  } catch (e) {
    return fail(e, "Could not publish the data agents");
  }
}
