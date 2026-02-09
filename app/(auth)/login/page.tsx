"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { microsoftProvider, auth } from "@/lib/firebase";
import { signInWithPopup } from "firebase/auth";
import {
    ShieldAlert,
    ArrowRight,
    Loader2,
    Gavel,
    Scale,
    ShieldCheck,
    Briefcase
} from "lucide-react";

export default function LoginPage() {
    const router = useRouter();
    const { user, isLoading } = useAuth();
    const [isOutlookLoading, setIsOutlookLoading] = useState(false);

    useEffect(() => {
        if (!isLoading && user) {
            router.replace("/dashboard");
        }
    }, [user, isLoading, router]);


    const handleOutlookLogin = async () => {
        setIsOutlookLoading(true);
        try {
            const result = await signInWithPopup(auth, microsoftProvider);
            // On success, onAuthStateChanged in SessionProvider will pick it up
            // and update `user`, triggering the redirect above.
        } catch (error: any) {
            console.error("Firebase Outlook login error:", error);
            setIsOutlookLoading(false);
            if (error.code !== "auth/popup-closed-by-user") {
                // Using simple alert as per original code
                alert("Giriş zamanı xəta baş verdi: " + error.message);
            }
        }
    };

    if (isLoading) {
        return (
            <div className="flex min-h-screen bg-bg-main items-center justify-center">
                <Loader2 className="animate-spin text-primary" size={40} />
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#f8f9fa] p-4 font-sans selection:bg-red-100 selection:text-red-900 relative overflow-hidden">
            {/* Dark Red Grid Background */}
            <div
                className="absolute inset-0 z-0 opacity-[0.05]"
                style={{
                    backgroundImage: `linear-gradient(#8B0000 1px, transparent 1px), linear-gradient(90deg, #ff0000ff 1px, transparent 1px)`,
                    backgroundSize: '40px 40px'
                }}
            />

            {/* Ambient Glow */}
            <div className="fixed top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-red-900/5 rounded-full blur-[100px] pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-black/5 rounded-full blur-[100px] pointer-events-none" />

            {/* Main Card */}
            <div className="relative z-10 w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl border border-white/50 overflow-hidden flex flex-col md:flex-row min-h-[550px] animate-in zoom-in-95 duration-700 fade-in">

                {/* Left Side - Brand Visual */}
                <div className="w-full md:w-5/12 bg-neutral-900 relative p-10 flex flex-col justify-between text-white overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />

                    <div className="relative z-10 space-y-2">
                        {/* Logo area on dark bg */}
                        <div className="flex items-center gap-2">
                            <h1 className="text-3xl font-extrabold tracking-tighter text-white">Legal 12</h1>
                        </div>
                        <div className="h-1 w-8 bg-red-600 rounded-full" />
                    </div>

                    <div className="relative z-10 flex flex-col items-center justify-center flex-1 my-8">
                        <div className="w-40 h-40 bg-white/5 rounded-full border border-white/10 flex items-center justify-center relative backdrop-blur-md">
                            <Scale size={64} className="text-red-500" strokeWidth={1.5} />
                            {/* Orbiting element */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-spin-slow origin-[50%_450%]" />
                        </div>
                    </div>

                    <div className="relative z-10 space-y-4">
                        <h2 className="text-2xl font-bold leading-tight">Peşəkar Hüquq<br />İdarəetmə Sistemi</h2>
                        <p className="text-white/60 text-xs font-medium leading-relaxed max-w-[250px]">
                            Məlumatlarınızın təhlükəsizliyi və işinizin axıcılığı bizim üçün prioritetdir.
                        </p>
                    </div>
                </div>

                {/* Right Side - Login Form */}
                <div className="w-full md:w-7/12 p-10 md:p-14 flex flex-col justify-center bg-white">
                    <div className="max-w-sm mx-auto w-full space-y-12">
                        <div className="text-center space-y-4">
                            {/* Requested Black Text Logo */}
                            <h2 className="text-5xl font-black tracking-tighter text-black">Legal 12</h2>
                            <p className="text-neutral-500 font-medium text-sm">Xoş Gəlmisiniz</p>
                        </div>

                        <div className="space-y-8">
                            <button
                                onClick={handleOutlookLogin}
                                disabled={isOutlookLoading}
                                className="group relative w-full flex items-center justify-center gap-4 bg-neutral-900 hover:bg-black text-white py-5 px-6 rounded-2xl transition-all duration-300 shadow-xl shadow-neutral-200 hover:shadow-2xl hover:scale-[1.02] active:scale-95 disabled:opacity-70 overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />

                                {isOutlookLoading ? (
                                    <Loader2 className="animate-spin relative z-10" size={22} />
                                ) : (
                                    <svg className="w-5 h-5 relative z-10" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M0 0H10.8696V10.8696H0V0Z" fill="#F25022" />
                                        <path d="M12.1304 0H23V10.8696H12.1304V0Z" fill="#7FBA00" />
                                        <path d="M0 12.1304H10.8696V23H0V12.1304Z" fill="#00A4EF" />
                                        <path d="M12.1304 12.1304H23V23H12.1304V12.1304Z" fill="#FFB900" />
                                    </svg>
                                )}
                                <span className="font-bold text-lg tracking-wide relative z-10">
                                    {isOutlookLoading ? "Giriş edilir..." : "Microsoft ilə Giriş"}
                                </span>
                            </button>

                            <div className="text-center space-y-4">
                                <div className="flex items-center justify-center gap-2 text-xs font-bold text-neutral-400">
                                    <ShieldCheck size={14} className="text-green-600" />
                                    <span>Məlumat Təhlükəsizliyi</span>
                                </div>
                                <p className="text-[10px] text-neutral-300 font-medium px-8 leading-relaxed">
                                    Davam etməklə siz istifadə şərtlərini və məxfilik siyasətini qəbul edirsiniz.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
