"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
    FolderArchive
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const menuItems = [
    { icon: LayoutDashboard, label: "Statistika", href: "/analytics" },
    { icon: UsersIcon, label: "Müştəri bazası", href: "/dashboard" },
    { icon: Briefcase, label: "Müfəttiş Paneli", href: "/inspector" },
    { icon: FolderArchive, label: "Arxiv Müştərilər", href: "/customers/archived" },
    { icon: FileText, label: "Arxivçi", href: "/archive" },
    { icon: History, label: "Audit Loqları", href: "/audit-logs" },
    { icon: Settings, label: "Parametrlər", href: "/parameters" },
    { icon: UsersIcon, label: "İstifadəçilər", href: "/settings" },
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
    const pathname = usePathname();
    const { user, hasAccess, logout, isSuperAdmin, isAdmin } = useAuth();

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
                    const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
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

            <div className="border-t border-border-soft p-6 bg-bg-main/20">
                <div className="mb-6 px-2">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 bg-white rounded-xl flex items-center justify-center font-bold text-primary border border-border-soft shadow-sm">
                            {(user?.displayName || "?")[0].toUpperCase()}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-black text-text-main truncate">{user?.displayName}</span>
                            <span className="text-[10px] font-bold text-text-soft/60 truncate">{user?.email}</span>
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
