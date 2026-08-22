"use client";

import { monadTestnet } from "wagmi/chains";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { shortAddr } from "@/lib/format";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/lib/ui";

/**
 * `rail` stacks full-width inside the 212px sidebar; `inline` sits in a row.
 */
export function ConnectButton({ layout = "inline" }: { layout?: "inline" | "rail" }) {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];
  const wide = layout === "rail" ? "w-full" : "";

  if (!isConnected || !address) {
    return (
      <button
        className={`${BTN_PRIMARY} ${wide}`}
        disabled={isPending || !injected}
        onClick={() => injected && connect({ connector: injected })}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  if (chainId !== monadTestnet.id) {
    return (
      <button className={`${BTN_PRIMARY} ${wide}`} onClick={() => switchChain({ chainId: monadTestnet.id })}>
        Switch network
      </button>
    );
  }

  if (layout === "rail") {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="mono truncate px-1 text-[11.5px] text-[#8a8a82]">{shortAddr(address)}</span>
        <button className={`${BTN_SECONDARY} w-full`} onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="mono text-[12px] text-[#8a8a82]">{shortAddr(address)}</span>
      <button className={BTN_SECONDARY} onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
