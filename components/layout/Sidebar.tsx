"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Users as UsersIcon,
    LayoutDashboard,
    Settings,
    FileText,
    LogOut,
    ChevronRight,
    ShieldAlert,
    ShieldCheck,
    UserCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const menuItems = [
    { icon: LayoutDashboard, label: "Müştəri məlumatı", href: "/dashboard" },
    { icon: FileText, label: "Hesabatlar", href: "/reports" },
    { icon: UsersIcon, label: "İstifadəçilər", href: "/settings" }, // Renamed from Tənzimləmələr
];

export function Sidebar() {
    const pathname = usePathname();
    const { user, hasAccess, logout, isSuperAdmin, isAdmin } = useAuth();

    // Dynamic filtering based on permissions
    const visibleItems = menuItems.filter(item => hasAccess(item.href));

    return (
        <div className="flex h-screen w-64 flex-col border-r border-border-soft bg-white">
            <div className="flex h-16 items-center border-b border-border-soft px-6">
                <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/20">
                        {isSuperAdmin ? <ShieldCheck size={22} /> : (isAdmin ? <ShieldAlert size={22} /> : <UserCircle size={22} />)}
                    </div>
                    <div>
                        <span className="text-lg font-black text-text-main tracking-tight block leading-none">Legal12</span>
                        <span className="text-[10px] font-bold text-primary uppercase tracking-widest">{user?.role || "Gözlənilir..."}</span>
                    </div>
                </div>
            </div>

            <nav className="flex-1 space-y-1 px-4 py-8">
                {visibleItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
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
