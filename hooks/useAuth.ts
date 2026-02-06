"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

import { PATH_TO_PERMISSION_MAP, PermissionID } from "@/lib/permissions";

interface AppUser {
    email: string;
    displayName: string;
    role: "SUPERADMIN" | "ADMIN" | "USER";
    permissions: string[];
}

export function useAuth() {
    const [user, setUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchUserData = async (email: string, displayName: string) => {
        try {
            const res = await fetch('/api/auth/sync-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, displayName })
            });
            const dbUser = await res.json();

            const finalUser: AppUser = {
                email: dbUser.email,
                displayName: dbUser.displayName || dbUser.email.split('@')[0],
                role: dbUser.role,
                permissions: dbUser.permissions || []
            };

            const cached = localStorage.getItem("legal12_user");
            if (JSON.stringify(finalUser) !== cached) {
                setUser(finalUser);
                localStorage.setItem("legal12_user", JSON.stringify(finalUser));
            }
        } catch (e) {
            console.error("Auth sync error:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const cachedUser = localStorage.getItem("legal12_user");
        if (cachedUser) {
            try {
                setUser(JSON.parse(cachedUser));
                setLoading(false);
            } catch (e) { }
        }

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser?.email) {
                fetchUserData(firebaseUser.email, firebaseUser.displayName || "");
            } else {
                localStorage.removeItem("legal12_user");
                setUser(null);
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    const hasAccess = (path: string) => {
        if (!user) return false;
        if (user.role === "SUPERADMIN") return true;

        const requiredPermissions = PATH_TO_PERMISSION_MAP[path] || [];
        if (requiredPermissions.length === 0) return true;

        return user.permissions.some(p => requiredPermissions.includes(p as PermissionID));
    };

    const can = (permission: PermissionID) => {
        if (!user) return false;
        if (user.role === "SUPERADMIN") return true;
        return user.permissions.includes(permission);
    };

    return {
        user,
        isAdmin: user?.role === "ADMIN" || user?.role === "SUPERADMIN",
        isSuperAdmin: user?.role === "SUPERADMIN",
        isLoading: loading,
        hasAccess,
        can,
        logout: async () => {
            await signOut(auth);
            window.location.href = "/login";
        }
    };
}
