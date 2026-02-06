import { NextResponse } from "next/server";
import { getRolePermissions, updateRolePermissions } from "@/lib/db";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    if (!role) {
        return NextResponse.json({ error: "Role is required" }, { status: 400 });
    }

    try {
        const permissions = await getRolePermissions(role);
        return NextResponse.json(permissions);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { role, paths } = await request.json();
        await updateRolePermissions(role, paths);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
