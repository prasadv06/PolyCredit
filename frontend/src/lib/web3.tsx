"use client";

import { createConfig, http, WagmiProvider } from "wagmi";
import { bsc } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";

// Standard wagmi config for BSC Mainnet
export const config = createConfig({
    chains: [bsc],
    transports: {
        [bsc.id]: http("https://bsc-dataseed.bnbchain.org"),
    },
});

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </WagmiProvider>
    );
}
