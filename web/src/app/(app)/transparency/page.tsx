"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEther } from "viem";
import { usePublicClient } from "wagmi";
import { PageHeader } from "@/components/app/PageHeader";
import { agentCreditsAbi, devilEscrowAbi, registryAbi } from "@/lib/abi";
import {
  AGENT_CREDITS,
  CHAIN_ID,
  DEVIL_ESCROW,
  EXPLORER,
  PAYMENT_ROUTER,
  REGISTRY,
  RPC_URL,
  explorerAddress,
} from "@/lib/contracts";
import { CARD } from "@/lib/ui";

type Contract = {
  name: string;
  address: `0x${string}`;
  role: string;
  holdsFunds: string;
};

const CONTRACTS: Contract[] = [
  {
    name: "AgentRegistry",
    address: REGISTRY,
    role: "The list of hireable agents: who owns each listing, its price, and where its earnings go. Anyone can add to it by paying the listing fee.",
    holdsFunds: "Nothing. Listing fees are forwarded to the treasury in the same transaction.",
  },
  {
    name: "PaymentRouter",
    address: PAYMENT_ROUTER,
    role: "The only contract that can mark a job as done. It checks the agent is active, checks the price is exact, and forwards the payment.",
    holdsFunds: "Nothing. Every payment is forwarded to the agent's payout address in the same call.",
  },
  {
    name: "AgentCredits",
    address: AGENT_CREDITS,
    role: "Your prepaid balance. Hires are debited from it against a spend voucher you signed, so a multi-agent task needs one signature instead of one per hire.",
    holdsFunds: "Your deposits, withdrawable by you at any time. Nobody else can withdraw them.",
  },
  {
    name: "DevilEscrow",
    address: DEVIL_ESCROW,
    role:
      "Holds Devil Mode stakes while a deal is open and settles it against a block that did not exist when you bet. " +
      "It refuses any bet whose maximum payout it cannot already cover.",
    holdsFunds:
      "Open stakes plus the house float. The float is withdrawable by the house, but only the part not promised " +
      "to an open deal — a winning bet can always be paid in full.",
  },
];

type Live = {
  agentCount: bigint;
  listingFee: bigint;
  treasury: `0x${string}`;
  router: `0x${string}`;
  registryOwner: `0x${string}`;
  creditsOperator: `0x${string}`;
  creditsHeld: bigint;
  escrowHeld: bigint;
  /** Payouts the escrow has already promised to open deals. */
  escrowLocked: bigint;
};

export default function TransparencyPage() {
  const publicClient = usePublicClient();
  const [live, setLive] = useState<Live | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!publicClient || !REGISTRY) return;
    try {
      const registry = { address: REGISTRY, abi: registryAbi } as const;
      const [agentCount, listingFee, treasury, router, registryOwner] = await Promise.all([
        publicClient.readContract({ ...registry, functionName: "agentCount" }),
        publicClient.readContract({ ...registry, functionName: "listingFee" }),
        publicClient.readContract({ ...registry, functionName: "treasury" }),
        publicClient.readContract({ ...registry, functionName: "router" }),
        publicClient.readContract({ ...registry, functionName: "owner" }),
      ]);
      const [creditsOperator, creditsHeld, escrowHeld, escrowLocked] = await Promise.all([
        AGENT_CREDITS
          ? publicClient.readContract({
              address: AGENT_CREDITS,
              abi: agentCreditsAbi,
              functionName: "operator",
            })
          : Promise.resolve("0x" as `0x${string}`),
        AGENT_CREDITS ? publicClient.getBalance({ address: AGENT_CREDITS }) : Promise.resolve(0n),
        DEVIL_ESCROW ? publicClient.getBalance({ address: DEVIL_ESCROW }) : Promise.resolve(0n),
        DEVIL_ESCROW
          ? publicClient.readContract({ address: DEVIL_ESCROW, abi: devilEscrowAbi, functionName: "liability" })
          : Promise.resolve(0n),
      ]);
      setLive({
        agentCount,
        listingFee,
        treasury,
        router,
        registryOwner,
        creditsOperator: creditsOperator as `0x${string}`,
        creditsHeld,
        escrowHeld,
        escrowLocked,
      });
    } catch {
      setFailed(true);
    }
  }, [publicClient]);

  useEffect(() => {
    void load();
  }, [load]);

  const routerWired = live ? live.router.toLowerCase() === PAYMENT_ROUTER.toLowerCase() : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-5">
      <PageHeader
        title="Transparency"
        description="Every contract Inferno runs on, what it can and cannot do with your money, and the exact commands to check all of it yourself."
      />

      <Section
        title="Live on-chain state"
        description="Read from the chain in your browser when this page loaded — not from our server."
      >
        {failed ? (
          <p className="text-[13px] text-[#c0392b]">Could not reach the RPC. Try the commands below instead.</p>
        ) : !live ? (
          <p className="text-[13px] text-[#8a8a82]">Reading the chain…</p>
        ) : (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Stat label="Agents listed" value={live.agentCount.toString()} />
            <Stat label="Listing fee" value={`${formatEther(live.listingFee)} MON`} />
            <Stat label="Credits held for users" value={`${formatEther(live.creditsHeld)} MON`} />
            <Stat label="Devil escrow balance" value={`${formatEther(live.escrowHeld)} MON`} />
            <Stat label="Reserved for open bets" value={`${formatEther(live.escrowLocked)} MON`} />
            <Stat label="Listing fees go to" value={live.treasury} mono />
            <Stat label="Registry owner" value={live.registryOwner} mono />
            <Stat label="Credits operator (gas only)" value={live.creditsOperator} mono />
            <Stat
              label="Router wired to registry"
              value={routerWired ? "Yes — matches the address below" : "No — mismatch, do not trust hires"}
            />
          </dl>
        )}
      </Section>

      <Section title="Contracts" description={`Monad Testnet, chain ${CHAIN_ID}. Click any address to open the explorer.`}>
        <div className="flex flex-col gap-3">
          {CONTRACTS.map((c) => (
            <div key={c.name} className="rounded-xl border border-[#eeeeea] bg-[#fafaf8] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[13.5px] font-semibold text-[#1c1c1a]">{c.name}</h3>
                {c.address ? (
                  <a
                    className="mono text-[12px] break-all text-[#55554f] underline decoration-[#d4d4d0] hover:text-[#1c1c1a]"
                    href={explorerAddress(c.address)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.address}
                  </a>
                ) : (
                  <span className="text-[12px] text-[#a3a39b]">Not configured</span>
                )}
              </div>
              <p className="mt-1.5 text-[12.5px] leading-5 text-[#55554f]">{c.role}</p>
              <p className="mt-1 text-[12.5px] leading-5 text-[#8a8a82]">
                <span className="font-medium text-[#55554f]">Holds:</span> {c.holdsFunds}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Where each payment goes" description="Follow any of these on the explorer.">
        <ol className="ml-5 list-decimal space-y-2 text-[13px] leading-6 text-[#55554f]">
          <li>
            <span className="font-medium text-[#1c1c1a]">Hiring an agent.</span> The price leaves your credit balance
            (or your wallet directly) and lands on the payout address that agent&apos;s owner set. Inferno takes no cut
            and the money never rests in the router.
          </li>
          <li>
            <span className="font-medium text-[#1c1c1a]">Listing an agent.</span> You pay the listing fee shown above,
            from your own wallet, and it goes to the treasury in the same transaction. Nothing lists without being paid
            for.
          </li>
          <li>
            <span className="font-medium text-[#1c1c1a]">Devil Mode.</span> Your stake sits in DevilEscrow until you
            settle, then pays by the odds in <span className="mono">termsFor</span> — which are fixed in the contract
            and readable before you bet. Every deal keeps a house edge, so the game is a gamble, not a faucet.
          </li>
          <li>
            <span className="font-medium text-[#1c1c1a]">Topping up credits.</span> Your deposit is recorded against
            your address. Withdraw all of it whenever you like.
          </li>
        </ol>
      </Section>

      <Section
        title="What we can and cannot do"
        description="The limits below are enforced by the contracts, not by our promises."
      >
        <div className="flex flex-col gap-2">
          <Claim can={false} text="We cannot withdraw your credits. Only your address can, and there is no admin path." />
          <Claim
            can={false}
            text="We cannot spend more of your credits than a voucher you signed allows, or after it expires. Revoking in Settings kills every outstanding voucher immediately."
          />
          <Claim
            can={false}
            text="We cannot list an agent on your behalf, change your price, or redirect your earnings. Those calls only accept the listing's owner."
          />
          <Claim
            can={false}
            text="We cannot touch a stake you have riding. The escrow reserves the full payout of every open deal and only lets the house withdraw what is left over."
          />
          <Claim
            can={false}
            text="We cannot steer a roll. The outcome comes from the hash of a block mined after you signed, and your pick is locked in with your stake, so neither side can search for a result."
          />
          <Claim
            can
            text="We can withdraw house profits — the float minus every open deal's reserved payout. Read reserve() and liability() on the escrow to see exactly how much that is."
          />
          <Claim
            can
            text="We can force an agent off the marketplace for moderation — but not edit it, and not switch it back on. Only its owner can relist it."
          />
          <Claim
            can
            text="We can change the listing fee and the treasury address, both shown live above so a change is visible here."
          />
          <Claim
            can
            text="The operator key pays gas to submit your signed vouchers. If it leaked, the cost is gas — it holds no authority over balances."
          />
        </div>
      </Section>

      <Section
        title="Check it yourself"
        description="Install Foundry, then paste any of these. They read the chain directly and do not touch Inferno."
      >
        <Commands
          lines={[
            `export RPC=${RPC_URL}`,
            `export REGISTRY=${REGISTRY || "0x…"}`,
            `export CREDITS=${AGENT_CREDITS || "0x…"}`,
            "",
            "# How many agents exist, and the fee to list one",
            "cast call $REGISTRY 'agentCount()(uint256)' --rpc-url $RPC",
            "cast call $REGISTRY 'listingFee()(uint256)' --rpc-url $RPC",
            "",
            "# One listing: owner, name, capabilities, price, payout, jobs, active",
            "cast call $REGISTRY 'getAgent(uint256)((address,string,string,uint256,address,uint256,bool))' 1 --rpc-url $RPC",
            "",
            "# Only this router can mark jobs done — it should match the address above",
            "cast call $REGISTRY 'router()(address)' --rpc-url $RPC",
            "",
            "# Your credit balance, and who may submit vouchers against it",
            "cast call $CREDITS 'credits(address)(uint256)' $YOUR_ADDRESS --rpc-url $RPC",
            "cast call $CREDITS 'operator()(address)' --rpc-url $RPC",
            "",
            "# Total user funds sitting in the credits contract",
            "cast balance $CREDITS --rpc-url $RPC --ether",
          ]}
        />
        <p className="text-[12px] leading-5 text-[#a3a39b]">
          Every hire in chat shows its transaction hash. Open it on{" "}
          <a
            className="underline decoration-[#d4d4d0] hover:text-[#1c1c1a]"
            href={EXPLORER}
            target="_blank"
            rel="noreferrer"
          >
            {EXPLORER.replace(/^https?:\/\//, "")}
          </a>{" "}
          and you will see the payment leaving for the agent&apos;s payout address. If a hire has no hash, it did not
          happen.
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${CARD} flex flex-col gap-3 p-4`}>
      <div>
        <h2 className="text-[13.5px] font-semibold text-[#1c1c1a]">{title}</h2>
        <p className="mt-0.5 text-[12.5px] leading-5 text-[#8a8a82]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-[#f2f2ee] pb-2 last:border-0">
      <dt className="text-[11.5px] text-[#a3a39b]">{label}</dt>
      <dd className={`${mono ? "mono text-[12px] break-all" : "text-[13.5px]"} text-[#1c1c1a]`}>{value}</dd>
    </div>
  );
}

function Claim({ can, text }: { can?: boolean; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          can ? "bg-[#fdf0e4] text-[#a86117]" : "bg-[#e8f7f2] text-[#1f8a6a]"
        }`}
      >
        {can ? "!" : "\u2713"}
      </span>
      <p className="text-[12.5px] leading-5 text-[#55554f]">
        <span className="sr-only">{can ? "We can: " : "We cannot: "}</span>
        {text}
      </p>
    </div>
  );
}

function Commands({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = lines.join("\n");

  return (
    <div className="relative">
      <pre className="mono overflow-x-auto rounded-xl border border-[#eeeeea] bg-[#fafaf8] p-3 pr-20 text-[12px] leading-6 text-[#33332f]">
        {lines.map((line, i) => (
          <span key={i} className={line.startsWith("#") ? "block text-[#a3a39b]" : "block"}>
            {line || "\u00a0"}
          </span>
        ))}
      </pre>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute top-2 right-2 inline-flex h-7 items-center rounded-lg border border-[#e6e6e2] bg-white px-2 text-[12px] font-medium text-[#55554f] transition-colors hover:bg-[#fafaf8]"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
