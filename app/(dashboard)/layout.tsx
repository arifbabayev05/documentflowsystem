"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Bell, User, Menu } from "lucide-react";
import { useState } from "react";

/** Local helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, isLoading } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // No redirect logic here as requested to prevent loops in PROD

    if (isLoading && !user) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-bg-main">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-bg-main overflow-hidden relative">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 z-[60] bg-text-main/40 backdrop-blur-sm lg:hidden transition-all duration-300"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar with Mobile State */}
            <div className={cn(
                "fixed inset-y-0 left-0 z-[70] transition-transform duration-500 lg:relative lg:translate-x-0",
                isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <Sidebar onClose={() => setIsSidebarOpen(false)} />
            </div>

            <div className="flex flex-1 flex-col overflow-hidden w-full">
                {/* Header */}
                <header className="flex h-16 items-center justify-between border-b border-border-soft bg-white px-4 md:px-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="p-2 -ml-2 text-text-soft hover:bg-bg-main rounded-xl lg:hidden transition-all active:scale-90"
                        >
                            <Menu size={24} />
                        </button>
                    </div>

                    <div className="flex items-center gap-4">

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
                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
