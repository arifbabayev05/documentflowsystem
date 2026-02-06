import { NextResponse } from "next/server";
import { bulkAddCustomers, getCustomers } from "@/lib/db";

export async function GET() {
    try {
        const customers = await getCustomers();
        return NextResponse.json(customers);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const customers = await request.json();
        const result = await bulkAddCustomers(customers);
        return NextResponse.json({ success: true, count: result.length });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
