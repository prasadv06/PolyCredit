import { NextResponse } from "next/server";

export async function GET() {
    try {
        const response = await fetch(
            "https://api.predict.fun/v1/search?query=btc&status=ACTIVE&limit=10",
            {
                method: "GET",
                headers: {
                    "x-api-key": "d77f0af7-dd6a-464d-b620-67e2a5c8be14"
                },
                // Next.js caching override to ensure live data
                cache: "no-store"
            }
        );

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            return NextResponse.json(
                data || { error: "Predict.fun API rejected the markets request" },
                { status: response.status }
            );
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
