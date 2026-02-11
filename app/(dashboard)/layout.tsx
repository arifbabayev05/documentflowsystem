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
                {/* Content */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
