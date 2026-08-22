import { NextResponse } from "next/server";
import { createWalletClient, decodeEventLog, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { registryAbi } from "@/lib/abi";
import { REGISTER_GAS, REGISTRY, RPC_URL } from "@/lib/contracts";
import { fail, readBody } from "@/lib/http";
import { assertHttpUrl, getListings, saveListing } from "@/lib/listings";
import { publicClient } from "@/lib/server-chain";

function ownerAccount() {
  const raw = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!raw) return null;
  const pk = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  return privateKeyToAccount(pk);
}

export async function GET() {
  return NextResponse.json({ listings: await getListings() });
}

export async function POST(req: Request) {
  try {
    const account = ownerAccount();
    if (!account) {
      return NextResponse.json({ error: "Listing is not available right now" }, { status: 503 });
    }

    const body = await readBody<{
      name?: string;
      capabilities?: string;
      priceMon?: string | number;
      payout?: string;
      owner?: string;
      endpoint?: string;
    }>(req);

    const name = body.name?.trim() ?? "";
    const capabilities = body.capabilities?.trim() ?? "";
    const priceMon = Number(body.priceMon);
    const payout = body.payout?.trim() ?? "";
    const owner = body.owner?.trim() ?? "";
    const endpoint = body.endpoint?.trim();

    if (name.length < 2 || name.length > 40) {
      return NextResponse.json({ error: "Name should be 2–40 characters" }, { status: 400 });
    }
    if (capabilities.length < 4 || capabilities.length > 240) {
      return NextResponse.json({ error: "Describe what the agent does" }, { status: 400 });
    }
    if (!Number.isFinite(priceMon) || priceMon < 0.001 || priceMon > 2) {
      return NextResponse.json({ error: "Price should be 0.001–2 MON" }, { status: 400 });
    }
    if (!isAddress(payout)) {
      return NextResponse.json({ error: "Connect a wallet so we know where to pay you" }, { status: 400 });
    }

    let safeEndpoint: string | undefined;
    if (endpoint) {
      try {
        safeEndpoint = assertHttpUrl(endpoint);
      } catch {
        return NextResponse.json({ error: "Callback URL is not valid" }, { status: 400 });
      }
    }

    const wallet = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(RPC_URL),
    });

    const hash = await wallet.writeContract({
      address: REGISTRY,
      abi: registryAbi,
      functionName: "register",
      args: [name, capabilities, parseEther(priceMon.toString()), payout as `0x${string}`],
      gas: REGISTER_GAS,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      pollingInterval: 400,
      timeout: 90_000,
    });
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "Listing transaction failed" }, { status: 500 });
    }

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
        // skip
      }
    }
    if (!agentId) {
      return NextResponse.json({ error: "Listed, but we could not read the new id" }, { status: 500 });
    }

    const listing = await saveListing({
      agentId,
      name,
      endpoint: safeEndpoint,
      owner: isAddress(owner) ? owner : payout,
      payout,
      createdAt: Date.now(),
    });

    return NextResponse.json({ listing, hash });
  } catch (e) {
    return fail(e, "Could not list the agent");
  }
}
