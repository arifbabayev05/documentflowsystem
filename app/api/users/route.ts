import { NextResponse } from "next/server";
import { getAllUsers, updateUserRole } from "@/lib/db";

export async function GET() {
    try {
        const users = await getAllUsers();
        return NextResponse.json(users);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const { userId, role, permissions, requesterRole } = await request.json();

        // Hierarchy check
        if (requesterRole === "ADMIN" && (role === "SUPERADMIN" || role === "ADMIN")) {
            return NextResponse.json({ error: "İcazəniz yoxdur" }, { status: 403 });
        }

        if (requesterRole !== "SUPERADMIN" && requesterRole !== "ADMIN") {
            return NextResponse.json({ error: "İcazəniz yoxdur" }, { status: 403 });
        }

        const updatedUser = await updateUserRole(userId, role, permissions);
        return NextResponse.json(updatedUser);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
