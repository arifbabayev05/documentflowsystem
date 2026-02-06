import { NextResponse } from "next/server";
import { syncUser } from "@/lib/db";

export async function POST(request: Request) {
    try {
        const user = await request.json();
        if (!user.email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }
        const syncedUser = await syncUser(user);
        return NextResponse.json(syncedUser);
    } catch (error: any) {
        console.error("Sync user error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
