import { NextResponse } from "next/server";
import { UnifiedMarket } from "../../../../../shared/types";

export async function GET() {
    const mockMarkets: UnifiedMarket[] = [
        {
            id: "probable-1",
            platform: "probable",
            question: "Will the Fed cut rates in the next meeting?",
            yesPrice: 0.72,
            noPrice: 0.28,
            volume: 350000,
            liquidity: 150000,
        },
        {
            id: "probable-2",
            platform: "probable",
            question: "Will a Web3 social app reach 10M DAU this month?",
            yesPrice: 0.15,
            noPrice: 0.85,
            volume: 45000,
            liquidity: 12000,
        }
    ];

    return NextResponse.json(mockMarkets);
}
