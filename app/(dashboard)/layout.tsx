"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Search, Bell, User } from "lucide-react";

/** Local helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user } = useAuth();

    return (
        <div className="flex h-screen bg-bg-main overflow-hidden">
            <Sidebar />

            <div className="flex flex-1 flex-col overflow-hidden">
                {/* Header */}
                <header className="flex h-16 items-center justify-between border-b border-border-soft bg-white px-8">
                    <div className="flex items-center gap-4 flex-1 max-w-xl">

                    </div>

                    <div className="flex items-center gap-4">
                        <button className="relative rounded-xl p-2 text-text-soft hover:bg-bg-main transition-colors">
                            <Bell size={20} />
                            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary border-2 border-white"></span>
                        </button>
                        <div className="h-8 w-px bg-border-soft mx-2"></div>
                        <div className="flex items-center gap-3 pl-4 border-l border-border-soft cursor-pointer group">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-soft text-primary font-bold soft-shadow group-hover:bg-primary group-hover:text-white transition-all duration-300">
                                {user?.displayName ? (
                                    <span className="text-sm">{user.displayName[0].toUpperCase()}</span>
                                ) : (
                                    <User size={18} />
                                )}
                            </div>
                            <div className="hidden text-left md:block">
                                {user ? (
                                    <>
                                        <p className="text-sm font-bold text-text-main leading-tight group-hover:text-primary transition-colors">
                                            {user.displayName}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className={cn(
                                                "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                                                user.role === "SUPERADMIN" ? "bg-red-50 text-red-600 border border-red-100" :
                                                    user.role === "ADMIN" ? "bg-blue-50 text-blue-600 border border-blue-100" :
                                                        "bg-gray-50 text-gray-600 border border-gray-100"
                                            )}>
                                                {user.role}
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-1.5">
                                        <div className="h-3 w-20 bg-bg-main rounded-full animate-pulse"></div>
                                        <div className="h-2 w-12 bg-bg-main rounded-full animate-pulse"></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 overflow-y-auto p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
