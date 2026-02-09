"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { syncUser } from "@/lib/db";
import { PATH_TO_PERMISSION_MAP, PermissionID } from "@/lib/permissions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface AppUser {
    email: string;
    displayName: string;
    role: "SUPERADMIN" | "ADMIN" | "USER";
    permissions: string[];
}

interface AuthContextType {
    user: AppUser | null;
    isLoading: boolean;
    isAdmin: boolean;
    isSuperAdmin: boolean;
    hasAccess: (path: string) => boolean;
    can: (permission: PermissionID) => boolean;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AppUser | null>(null);
    const [isLoading, setIsLoading] = useState(true); // Always true initially
    const [isInitialized, setIsInitialized] = useState(false);

    const fetchUserData = async (email: string, displayName: string) => {
        try {
            const normalized = email.toLowerCase().trim();
            // Using toast for prod-debug as requested
            // toast.info(`Sessiya yoxlanılır: ${normalized}`);

            const dbUser = await syncUser({ email: normalized, displayName });

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
            } else {
                setUser(finalUser); // Ensure state is set even if cached is same
            }
        } catch (e: any) {
            console.error("AuthContext sync fatal error:", e);
            toast.error("İstifadəçi məlumatlarını yükləyərkən xəta: " + e.message);
        } finally {
            setIsLoading(false);
            setIsInitialized(true);
        }
    };

    useEffect(() => {
        // Listen to Firebase auth changes
        // checking auth state is the only source of truth
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser?.email) {
                // User is signed in, fetch full profile
                await fetchUserData(firebaseUser.email, firebaseUser.displayName || "");
            } else {
                // User is signed out
                setUser(null);
                setIsLoading(false);
                setIsInitialized(true);
            }
        });

        return () => unsubscribe();
    }, []);

    const hasAccess = useCallback((path: string) => {
        if (!user) return false;
        if (user.role === "SUPERADMIN") return true;

        const requiredPermissions = PATH_TO_PERMISSION_MAP[path] || [];
        if (requiredPermissions.length === 0) return true;

        return user.permissions.some(p => requiredPermissions.includes(p as PermissionID));
    }, [user]);

    const can = useCallback((permission: PermissionID) => {
        if (!user) return false;
        if (user.role === "SUPERADMIN") return true;
        return user.permissions.includes(permission);
    }, [user]);

    const logout = async () => {
        try {
            await signOut(auth);
            localStorage.removeItem("legal12_user");
            setUser(null);
            window.location.href = "/login";
        } catch (e: any) {
            toast.error("Çıxış zamanı xəta: " + e.message);
        }
    };

    const value = useMemo(() => ({
        user,
        isLoading,
        isAdmin: user?.role === "ADMIN" || user?.role === "SUPERADMIN",
        isSuperAdmin: user?.role === "SUPERADMIN",
        hasAccess,
        can,
        logout
    }), [user, isLoading, hasAccess, can]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuthContext() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuthContext must be used within an AuthProvider");
    }
    return context;
}
