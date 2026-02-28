import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const response = await fetch(
            "https://api.predict.fun/v1/orders",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": "d77f0af7-dd6a-464d-b620-67e2a5c8be14",
                    "Authorization": req.headers.get("authorization") || ""
                },
                body: JSON.stringify(body),
            }
        );

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            console.error("❌ Predict API Error:", response.status, data);
            return NextResponse.json(
                data || { error: "Predict.fun API rejected the payload" },
                { status: response.status }
            );
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Backend Order Error:", error);
        return NextResponse.json(
            { error: "Order submission failed", details: error.message },
            { status: 500 }
        );
    }
}
