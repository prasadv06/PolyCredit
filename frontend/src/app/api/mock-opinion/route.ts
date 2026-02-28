import { NextResponse } from "next/server";
import { UnifiedMarket } from "../../../../../shared/types";

export async function GET() {
    const mockMarkets: UnifiedMarket[] = [
        {
            id: "opinion-1",
            platform: "opinion",
            question: "Will BNB reach $1000 by end of year?",
            yesPrice: 0.48,
            noPrice: 0.52,
            volume: 125000,
            liquidity: 45000,
        },
        {
            id: "opinion-2",
            platform: "opinion",
            question: "Will opBNB exceed 100M daily TXs in Q4?",
            yesPrice: 0.35,
            noPrice: 0.65,
            volume: 85000,
            liquidity: 20000,
        }
    ];

    return NextResponse.json(mockMarkets);
}
