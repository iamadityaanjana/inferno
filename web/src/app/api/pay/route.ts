import { NextResponse } from "next/server";
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { paymentRouterAbi } from "@/lib/abi";
import { PAY_GAS, PAYMENT_ROUTER, RPC_URL } from "@/lib/contracts";
import { assertPaid, publicClient } from "@/lib/server-chain";

const AUTO_CAP = parseEther("0.5");

function agentAccount() {
  const raw = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!raw) return null;
  const pk = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  return privateKeyToAccount(pk);
}

export async function GET() {
  const account = agentAccount();
  if (!account) return NextResponse.json({ enabled: false });
  const balance = await publicClient.getBalance({ address: account.address });
  return NextResponse.json({
    enabled: true,
    address: account.address,
    balance: balance.toString(),
    autoCapMon: "0.5",
  });
}

export async function POST(req: Request) {
  const account = agentAccount();
  if (!account) {
    return NextResponse.json({ error: "Agent wallet not configured" }, { status: 503 });
  }
  const body = (await req.json()) as { agentId?: number; priceWei?: string };
  if (!body.agentId || !body.priceWei) {
    return NextResponse.json({ error: "agentId and priceWei required" }, { status: 400 });
  }
  const value = BigInt(body.priceWei);
  if (value > AUTO_CAP) {
    return NextResponse.json({ error: "Over auto-pay cap. Sign in your wallet." }, { status: 403 });
  }

  const wallet = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(RPC_URL),
  });

  const hash = await wallet.writeContract({
    address: PAYMENT_ROUTER,
    abi: paymentRouterAbi,
    functionName: "pay",
    args: [BigInt(body.agentId)],
    value,
    gas: PAY_GAS,
  });
  await assertPaid(hash, body.agentId);
  return NextResponse.json({ hash, from: account.address });
}
