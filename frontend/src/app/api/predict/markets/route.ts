import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    try {
        const marketId = req.nextUrl.searchParams.get("marketId");

        let apiUrl: string;
        if (marketId) {
            // Fetch a specific market by ID
            apiUrl = `https://api.predict.fun/v1/markets/${marketId}`;
        } else {
            // Default: search for active BTC markets
            apiUrl = "https://api.predict.fun/v1/search?query=btc&status=ACTIVE&limit=10";
        }

        const response = await fetch(apiUrl, {
            method: "GET",
            headers: {
                "x-api-key": "d77f0af7-dd6a-464d-b620-67e2a5c8be14"
            },
            cache: "no-store"
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            // If specific market fetch fails, try search by ID
            if (marketId) {
                const searchRes = await fetch(
                    `https://api.predict.fun/v1/search?query=${marketId}&limit=5`,
                    { headers: { "x-api-key": "d77f0af7-dd6a-464d-b620-67e2a5c8be14" }, cache: "no-store" }
                );
                const searchData = await searchRes.json().catch(() => null);
                if (searchRes.ok) return NextResponse.json(searchData);
            }
            return NextResponse.json(
                data || { error: "Predict.fun API rejected the markets request" },
                { status: response.status }
            );
        }

        // Wrap single market response to be consistent
        if (marketId && data && !data.data?.markets) {
            return NextResponse.json({ data: { markets: [data.data || data] } });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Backend Market Fetch Error:", error);
        return NextResponse.json(
            { error: "Market fetch failed", details: error.message },
            { status: 500 }
        );
    }
}
