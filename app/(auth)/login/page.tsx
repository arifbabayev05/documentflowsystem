"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, microsoftProvider } from "@/lib/firebase";
import { signInWithPopup, onAuthStateChanged } from "firebase/auth";
import {
    ShieldAlert,
    ArrowRight,
    Loader2,
} from "lucide-react";

export default function LoginPage() {
    const router = useRouter();
    const [isOutlookLoading, setIsOutlookLoading] = useState(false);
    const [isCheckingSession, setIsCheckingSession] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log("User found, redirecting...");
                router.push("/dashboard");
            } else {
                setIsCheckingSession(false);
            }
        });
        return () => unsubscribe();
    }, [router]);

    const handleOutlookLogin = async () => {
        setIsOutlookLoading(true);
        try {
            const result = await signInWithPopup(auth, microsoftProvider);
            if (result.user) {
                window.location.href = "/dashboard";
            }
        } catch (error: any) {
            console.error("Firebase Outlook login error:", error);
            setIsOutlookLoading(false);
            if (error.code !== "auth/popup-closed-by-user") {
                alert("Giriş zamanı xəta baş verdi: " + error.message);
            }
        }
    };

    if (isCheckingSession) {
        return (
            <div className="flex min-h-screen bg-bg-main items-center justify-center">
                <Loader2 className="animate-spin text-primary" size={40} />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-bg-main items-center justify-center p-4">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-primary/5 -skew-y-6 -translate-y-24 pointer-events-none"></div>
            <div className="absolute bottom-0 right-0 w-full h-1/3 bg-primary/5 skew-y-6 translate-y-24 pointer-events-none"></div>

            <div className="w-full max-w-md relative">
                <div className="mb-12 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white soft-shadow border border-primary-soft">
                        <ShieldAlert className="text-primary" size={32} />
                    </div>
                    <h1 className="text-3xl font-black text-text-main tracking-tight">Legal12</h1>
                    <p className="text-text-soft font-medium">Hüquq və Borc İdarəetmə Sistemi</p>
                </div>

                <div className="rounded-[3rem] border border-border-soft bg-white p-12 soft-shadow text-center">
                    <div className="mb-10">
                        <h2 className="text-2xl font-bold text-text-main">Sistemə Giriş</h2>
                        <p className="text-sm text-text-soft mt-2">
                            Davam etmək üçün Microsoft hesabınızla daxil olun
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={handleOutlookLogin}
                        disabled={isOutlookLoading}
                        className="flex w-full items-center justify-center gap-4 rounded-2xl border-2 border-border-soft bg-white py-5 text-base font-bold text-text-main transition-all hover:bg-bg-main hover:border-primary-soft group active:scale-[0.98]"
                    >
                        {isOutlookLoading ? (
                            <Loader2 className="animate-spin text-primary" size={24} />
                        ) : (
                            <>
                                <img src="https://authjs.dev/img/providers/azure.svg" className="h-6 w-6" alt="Outlook" />
                                Outlook ilə giriş
                                <ArrowRight size={18} className="text-text-soft group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>

                    <div className="mt-10 pt-8 border-t border-border-soft text-xs font-bold text-text-soft/60 uppercase tracking-widest flex items-center justify-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></div>
                        Təhlükəsiz Giriş
                    </div>
                </div>
            </div>
        </div>
    );
}
