import { NextResponse } from "next/server";

export async function GET() {
    try {
        const response = await fetch("https://api.predict.fun/v1/auth/message", {
            method: "GET",
            headers: {
                "x-api-key": "d77f0af7-dd6a-464d-b620-67e2a5c8be14"
            }
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            return NextResponse.json(data || { error: "Failed to fetch auth message" }, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Auth Message Error:", error);
        return NextResponse.json({ error: "Auth message fetch failed" }, { status: 500 });
    }
}
