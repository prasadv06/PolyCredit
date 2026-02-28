import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
    try {
        const authorization = req.headers.get("authorization");
        if (!authorization) {
            return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
        }

        // Forward query params (e.g. status=OPEN, status=FILLED)
        const url = new URL("https://api.predict.fun/v1/orders");
        req.nextUrl.searchParams.forEach((value, key) => {
            url.searchParams.append(key, value);
        });

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "x-api-key": "d77f0af7-dd6a-464d-b620-67e2a5c8be14",
                "Authorization": authorization
            }
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            return NextResponse.json(data || { error: "Failed to fetch orders" }, { status: response.status });
        }

        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
            fs.writeFileSync(path.join(process.cwd(), "order_schema.json"), JSON.stringify(data.data[0], null, 2));
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Orders Fetch Error:", error);
        return NextResponse.json({ error: "Orders fetch failed" }, { status: 500 });
    }
}
