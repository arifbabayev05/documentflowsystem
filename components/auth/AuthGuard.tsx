"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
    children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!isLoading && !user) {
            console.log(`AuthGuard: Unauthorized access to ${pathname}, redirecting to login.`);
            // Use window.location for a hard redirect to ensure state is clear
            // But router.replace is smoother. Let's stick to router.replace but log it.
            localStorage.setItem("returnUrl", pathname);
            router.replace("/login");
        }
    }, [user, isLoading, router, pathname]);

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-bg-main">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-primary" size={48} />
                    <p className="text-sm font-black text-text-soft uppercase tracking-widest animate-pulse">
                        Məlumatlar yoxlanılır...
                    </p>
                </div>
            </div>
        );
    }

    if (!user) {
        // Return null while redirecting to avoid flashing protected content
        return null;
    }

    return <>{children}</>;
}
