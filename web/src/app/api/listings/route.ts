import { NextResponse } from "next/server";
import { decodeEventLog, isAddress } from "viem";
import { registryAbi } from "@/lib/abi";
import { REGISTRY } from "@/lib/contracts";
import { fail, readBody } from "@/lib/http";
import { assertHttpUrl, getListings, saveListing } from "@/lib/listings";
import { publicClient } from "@/lib/server-chain";

export async function GET() {
  return NextResponse.json({ listings: await getListings() });
}

/**
 * Records the off-chain half of a listing — currently just the callback URL.
 *
 * Registration itself happens on-chain, signed by the lister, so this route
 * holds no key and can spend nothing. It only accepts metadata it can prove the
 * caller is entitled to set: the supplied transaction must contain the
 * `AgentRegistered` event for the claimed agent, and the registry must agree
 * that agent is owned by the address in the event.
 */
export async function POST(req: Request) {
  try {
    if (!REGISTRY) {
      return NextResponse.json({ error: "Registry address is not configured" }, { status: 503 });
    }

    const body = await readBody<{ agentId?: number; txHash?: string; endpoint?: string }>(req);
    const agentId = Number(body.agentId);
    const txHash = body.txHash?.trim() ?? "";
    const endpoint = body.endpoint?.trim();

    if (!Number.isInteger(agentId) || agentId < 1) {
      return NextResponse.json({ error: "agentId required" }, { status: 400 });
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ error: "A registration transaction hash is required" }, { status: 400 });
    }

    let safeEndpoint: string | undefined;
    if (endpoint) {
      try {
        safeEndpoint = assertHttpUrl(endpoint);
      } catch {
        return NextResponse.json({ error: "Callback URL is not valid" }, { status: 400 });
      }
    }

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      confirmations: 1,
      pollingInterval: 400,
      timeout: 90_000,
    });
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "That registration transaction failed" }, { status: 400 });
    }

    // Prove the transaction really registered this agent, so nobody can attach a
    // callback URL to an agent they do not own.
    let registeredOwner: string | null = null;
    let name = "";
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== REGISTRY.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: registryAbi,
          eventName: "AgentRegistered",
          data: log.data,
          topics: log.topics,
        });
        if (Number(decoded.args.id) === agentId) {
          registeredOwner = decoded.args.owner;
          name = decoded.args.name;
        }
      } catch {
        // not the event we want
      }
    }
    if (!registeredOwner) {
      return NextResponse.json({ error: `That transaction did not register agent ${agentId}` }, { status: 400 });
    }

    const agent = await publicClient.readContract({
      address: REGISTRY,
      abi: registryAbi,
      functionName: "getAgent",
      args: [BigInt(agentId)],
    });
    if (agent.owner.toLowerCase() !== registeredOwner.toLowerCase()) {
      return NextResponse.json({ error: "Registry owner does not match that transaction" }, { status: 409 });
    }

    const listing = await saveListing({
      agentId,
      name: name || agent.name,
      endpoint: safeEndpoint,
      owner: registeredOwner,
      payout: isAddress(agent.payout) ? agent.payout : registeredOwner,
      createdAt: Date.now(),
    });

    return NextResponse.json({ listing });
  } catch (e) {
    return fail(e, "Could not save the listing");
  }
}
