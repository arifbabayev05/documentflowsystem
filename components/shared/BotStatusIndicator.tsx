"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { API_ENDPOINTS } from "@/config/api";
import { toast } from "sonner";
import { Play } from "lucide-react";

/**
 * Bot/Agent Status Indicator & Starter for Sidebar.
 * Always shows a "Servisi Başlat" button.
 * Click → generates a tiny .bat that starts the agent → Edge auto-downloads → user clicks "Open".
 */
export const BotStatusIndicator = ({ isOnline, onStart }: { isOnline: boolean; onStart: () => void }) => {
    const [isStarting, setIsStarting] = useState(false);

    const handleStartService = async () => {
        setIsStarting(true);
        try {
            // Fetch the install/launch command from Railway
            const res = await fetch(API_ENDPOINTS.setupCommand);
            if (!res.ok) throw new Error();
            const command = (await res.text()).trim();

            // Build a .bat that:
            // 1. Runs the install/launcher
            // 2. Closes itself when done
            const batContent = [
                "@echo off",
                "chcp 65001 >nul",
                'echo.',
                'echo   [*] E-Social Agent basladilir...',
                'echo.',
                command,
                'exit',
            ].join("\r\n");

            const blob = new Blob([batContent], { type: "application/x-msdos-program" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "start_agent.bat";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.info("Yüklənən faylı açın — servis avtomatik başlayacaq.", { duration: 8000 });
        } catch {
            toast.error("Xəta baş verdi. Yenidən cəhd edin.");
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <div className="mx-4 mb-4">
            <button
                onClick={handleStartService}
                disabled={isStarting}
                className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-300 cursor-pointer group active:scale-[0.97]",
                    isOnline
                        ? "bg-emerald-50/50 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
                        : "bg-amber-50/50 border-amber-200 hover:bg-amber-50 hover:border-amber-300",
                    isStarting && "opacity-60 pointer-events-none"
                )}
            >
                {/* Status dot */}
                <div className="relative">
                    <div className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        isOnline
                            ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse"
                            : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
                    )} />
                </div>

                {/* Label */}
                <div className="flex flex-col min-w-0 flex-1 text-left">
                    <span className={cn(
                        "text-[9px] font-black uppercase tracking-widest truncate",
                        isOnline ? "text-emerald-700" : "text-amber-700"
                    )}>
                        {isOnline ? "Servis Aktiv" : "Servis Offline"}
                    </span>
                    <span className={cn(
                        "text-[8px] font-medium truncate -mt-0.5",
                        isOnline ? "text-emerald-600/60" : "text-amber-600/60"
                    )}>
                        Servisi başlatmaq üçün klik edin
                    </span>
                </div>

                {/* Play icon */}
                <div className={cn(
                    "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-all",
                    isOnline
                        ? "bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white"
                        : "bg-amber-500/10 text-amber-600 group-hover:bg-amber-500 group-hover:text-white"
                )}>
                    {isStarting ? (
                        <div className="h-3.5 w-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    ) : (
                        <Play size={14} className="ml-0.5" />
                    )}
                </div>
            </button>
        </div>
    );
};
