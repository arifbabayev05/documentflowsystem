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

    if (user.role === "PENDING") {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md">
                <div className="w-full max-w-md bg-white rounded-[2.5rem] p-10 text-center shadow-2xl animate-in zoom-in-95 duration-300">
                    <div className="h-20 w-20 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-8">
                        <Loader2 className="animate-spin text-amber-500" size={40} />
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 mb-4">Giriş Müvəqqəti Məhdudlaşdırılıb</h2>
                    <p className="text-slate-500 font-bold mb-10 leading-relaxed text-sm">
                        Hörmətli <span className="text-slate-800">{user.displayName}</span>,<br />
                        Hesabınız hazırda <span className="text-amber-600">Gözləmədə</span> statusundadır. Sistemdən istifadə etmək üçün administrator tərəfindən Sizə müvafiq rol təyin olunmalıdır.
                    </p>
                    <div className="flex flex-col gap-3">
                        <div className="p-4 bg-slate-50 rounded-2xl text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">
                            Təstiq olunduqdan sonra yenidən daxil olun
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full py-4 bg-primary text-white rounded-2xl font-black shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-sm"
                        >
                            Yenilə
                        </button>
                        <button
                            onClick={async () => {
                                localStorage.removeItem("legal12_user");
                                window.location.href = "/login";
                            }}
                            className="w-full py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black hover:bg-slate-50 transition-all text-sm"
                        >
                            Çıxış et
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
