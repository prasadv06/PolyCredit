import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Expects: { message: "...", signature: "0x...", signer: "0x..." }
        const response = await fetch("https://api.predict.fun/v1/auth", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": "d77f0af7-dd6a-464d-b620-67e2a5c8be14"
            },
            body: JSON.stringify(body)
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            return NextResponse.json(data || { error: "Failed to exchange signature for JWT" }, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Auth Token Error:", error);
        return NextResponse.json({ error: "Auth token generation failed" }, { status: 500 });
    }
}
