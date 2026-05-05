"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
    Users as UsersIcon,
    LayoutDashboard,
    Settings,
    FileText,
    LogOut,
    ShieldAlert,
    ShieldCheck,
    UserCircle,
    History,
    X,
    Briefcase,
    FolderArchive,
    Mail
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { BotStatusIndicator } from "@/components/shared/BotStatusIndicator";
import { toast } from "sonner";
import { useBotStatus } from "@/hooks/useBotStatus";
import { withoutBasePath } from "@/lib/basePath";

const menuItems = [
    { icon: LayoutDashboard, label: "Statistika", href: "/analytics" },
    { icon: UsersIcon, label: "Müştəri bazası", href: "/dashboard" },
    { icon: Mail, label: "Müştəri Məlumatı", href: "/letter-list" },
    { icon: FolderArchive, label: "Arxiv Müştərilər", href: "/customers/archived" },
    { icon: UsersIcon, label: "Müfəttiş İdarəsi", href: "/inspectors" },
    { icon: Briefcase, label: "Müfəttiş Paneli", href: "/inspector" },
    { icon: FileText, label: "Arxivçi", href: "/archive" },
    { icon: History, label: "Audit Loqları", href: "/audit-logs" },
    { icon: UsersIcon, label: "İstifadəçilər", href: "/settings" },
    { icon: Settings, label: "Parametrlər", href: "/parameters" },

];

export function Sidebar({ onClose }: { onClose?: () => void }) {
    const pathname = usePathname();
    const normalizedPathname = withoutBasePath(pathname);
    const { user, hasAccess, logout, isSuperAdmin, isAdmin, updateProfile } = useAuth();
    const [phoneValue, setPhoneValue] = useState(user?.phoneNumber || "");
    const [isUpdatingPhone, setIsUpdatingPhone] = useState(false);
    const { isBotOnline, handleLaunchBot } = useBotStatus();

    useEffect(() => {
        setPhoneValue(user?.phoneNumber || "");
    }, [user?.phoneNumber]);

    const handlePhoneUpdate = async () => {
        if (phoneValue === user?.phoneNumber) return;
        setIsUpdatingPhone(true);
        try {
            await updateProfile({ phoneNumber: phoneValue });
        } catch (e) {
            // Error toast handled in updateProfile
        } finally {
            setIsUpdatingPhone(false);
        }
    };

    // Close sidebar on navigation (mobile)
    const handleLinkClick = () => {
        if (onClose) onClose();
    };

    // Dynamic filtering based on permissions
    const visibleItems = menuItems.filter(item => hasAccess(item.href));

    return (
        <div className="flex h-screen w-64 flex-col border-r border-border-soft bg-white">
            <div className="flex h-16 items-center border-b border-border-soft px-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-white shadow-lg shadow-slate-200">
                        {isSuperAdmin ? <ShieldCheck size={20} /> : (isAdmin ? <ShieldAlert size={20} /> : <UserCircle size={20} />)}
                    </div>
                    <div>
                        <span className="text-xl font-black text-slate-800 tracking-tight block leading-none">Legal12</span>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="lg:hidden p-2 -mr-2 text-text-soft hover:bg-bg-main rounded-xl transition-all active:scale-90"
                >
                    <X size={20} />
                </button>
            </div>

            <nav className="flex-1 space-y-1 px-4 py-8">
                {visibleItems.map((item) => {
                    const isActive = normalizedPathname === item.href || (item.href !== "/dashboard" && normalizedPathname.startsWith(item.href + "/"));
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={handleLinkClick}
                            className={cn(
                                "group flex items-center justify-between rounded-2xl px-5 py-3.5 text-sm font-bold transition-all duration-300",
                                isActive
                                    ? "bg-primary text-white shadow-xl shadow-primary/20 translate-x-1"
                                    : "text-text-soft hover:bg-primary-soft/50 hover:text-primary"
                            )}
                        >
                            <div className="flex items-center gap-4">
                                <item.icon size={20} className={cn(
                                    "transition-colors",
                                    isActive ? "text-white" : "text-text-soft/60 group-hover:text-primary"
                                )} />
                                {item.label}
                            </div>
                            {isActive && <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />}
                        </Link>
                    );
                })}
            </nav>

            {/* <BotStatusIndicator isOnline={isBotOnline} onStart={handleLaunchBot} /> */}
            <div className="border-t border-border-soft p-6 bg-bg-main/20">
                <div className="mb-6 px-2">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 bg-white rounded-xl flex items-center justify-center font-bold text-primary border border-border-soft shadow-sm">
                            {(user?.displayName || "?")[0].toUpperCase()}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-black text-text-main truncate">{user?.displayName}</span>
                            <span className="text-[10px] font-bold text-text-soft/60 truncate">{user?.email}</span>

                            {/* Phone Input for Inspector */}
                            {user?.role === "INSPECTOR" && (
                                <div className="mt-2 relative">
                                    <input
                                        type="text"
                                        value={phoneValue}
                                        onChange={(e) => setPhoneValue(e.target.value)}
                                        onBlur={handlePhoneUpdate}
                                        onKeyDown={(e) => e.key === 'Enter' && handlePhoneUpdate()}
                                        placeholder="Əlaqə nömrəsi..."
                                        disabled={isUpdatingPhone}
                                        className={cn(
                                            "w-full bg-white border rounded-lg px-2 py-1 text-[10px] font-bold text-slate-700 outline-none transition-all placeholder:font-medium",
                                            !user.phoneNumber?.trim()
                                                ? "border-amber-300 ring-2 ring-amber-100 placeholder:text-amber-500"
                                                : "border-slate-200 focus:border-primary"
                                        )}
                                    />
                                    {!user.phoneNumber?.trim() && (
                                        <div className="absolute -top-1 -right-1">
                                            <div className="h-2 w-2 bg-amber-500 rounded-full animate-ping" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    onClick={logout}
                    className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-sm font-bold text-text-soft hover:bg-red-50 hover:text-red-600 transition-all border border-transparent hover:border-red-100 group"
                >
                    <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
                    Çıxış
                </button>
            </div>
        </div>
    );
}
