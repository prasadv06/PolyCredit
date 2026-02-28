import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    try {
        const walletId = req.nextUrl.searchParams.get("walletId");
        if (!walletId) {
            return NextResponse.json({ error: "Missing walletId parameter" }, { status: 400 });
        }

        const authorization = req.headers.get("authorization");
        if (!authorization) {
            return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
        }

        const response = await fetch(`https://api.predict.fun/v1/positions?walletId=${walletId}`, {
            method: "GET",
            headers: {
                "x-api-key": "d77f0af7-dd6a-464d-b620-67e2a5c8be14",
                "Authorization": authorization
            }
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            console.error("Portfolio Error Response:", data);
            return NextResponse.json(data || { error: "Failed to fetch portfolio positions" }, { status: response.status });
        }

        console.log("✅ Portfolio Fetched Successfully:", JSON.stringify(data, null, 2));

        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Portfolio Fetch Error:", error);
        return NextResponse.json({ error: "Portfolio fetch failed" }, { status: 500 });
    }
}
