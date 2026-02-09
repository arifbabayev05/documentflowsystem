"use client";

import { useEffect, useState } from "react";
import {
    History,
    Search,
    Loader2,
    Calendar,
    User,
    Activity
} from "lucide-react";
import { getAuditLogs } from "@/lib/db";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

interface AuditLog {
    id: string;
    action: string;
    details: string;
    userEmail: string;
    timestamp: any;
}

import AuthGuard from "@/components/auth/AuthGuard";

export default function AuditLogsPage() {
    const { user, isLoading } = useAuth();
    const router = useRouter(); // Keeping router for now if needed, but AuthGuard handles redirect
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // Removed manual useEffect redirect logic

    const fetchLogs = async () => {
        setLoadingLogs(true);
        try {
            const logData = await getAuditLogs(100);
            // Sort by timestamp if not already sorted
            const sorted = (logData as AuditLog[]).sort((a, b) => {
                const timeA = a.timestamp?.seconds || 0;
                const timeB = b.timestamp?.seconds || 0;
                return timeB - timeA;
            });
            setAuditLogs(sorted);
        } catch (error) {
            console.error("Error fetching audit logs:", error);
        } finally {
            setLoadingLogs(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchLogs();
        }
    }, [user]);

    const filteredLogs = auditLogs.filter(log =>
        log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loadingLogs && auditLogs.length === 0) {
        return (
            <div className="flex h-[70vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-primary" size={48} />
                    <p className="text-sm font-black text-text-soft uppercase tracking-widest">Loqlar yüklənir...</p>
                </div>
            </div>
        );
    }

    return (
        <AuthGuard>
            <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
                {/* ... content ... */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-text-main tracking-tight">Audit Loqları</h1>
                        <p className="text-text-soft font-medium text-sm mt-1">Sistemdə baş verən bütün əməliyyatların tarixçəsi</p>
                    </div>

                    <div className="relative w-full lg:w-[400px]">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-text-soft" size={20} />
                        <input
                            type="text"
                            placeholder="Loqlarda axtarış..."
                            className="w-full pl-14 pr-6 py-4 bg-white rounded-[1.5rem] border border-border-soft outline-none focus:border-primary/20 transition-all font-bold text-sm shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="bg-white rounded-[3rem] border border-border-soft soft-shadow overflow-hidden">
                    <div className="overflow-x-auto min-h-[500px]">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-bg-main/50 border-b border-border-soft text-left">
                                    <th className="px-8 py-6 text-[11px] font-black text-text-soft uppercase tracking-widest border-r border-border-soft/20">
                                        <div className="flex items-center gap-2"><Calendar size={14} /> Tarix</div>
                                    </th>
                                    <th className="px-8 py-6 text-[11px] font-black text-text-soft uppercase tracking-widest border-r border-border-soft/20">
                                        <div className="flex items-center gap-2"><User size={14} /> İstifadəçi</div>
                                    </th>
                                    <th className="px-8 py-6 text-[11px] font-black text-text-soft uppercase tracking-widest border-r border-border-soft/20">
                                        <div className="flex items-center gap-2"><Activity size={14} /> Əməliyyat</div>
                                    </th>
                                    <th className="px-8 py-6 text-[11px] font-black text-text-soft uppercase tracking-widest">Təfərrüat</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLogs.length > 0 ? (
                                    filteredLogs.map((log) => (
                                        <tr key={log.id} className="border-b border-border-soft/40 hover:bg-primary-soft/5 transition-all">
                                            <td className="px-8 py-5 text-xs font-bold text-text-soft border-r border-border-soft/20">
                                                {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('az-AZ') : 'İndi'}
                                            </td>
                                            <td className="px-8 py-5 border-r border-border-soft/20">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-9 w-9 rounded-xl bg-bg-main border border-border-soft flex items-center justify-center text-[11px] font-black text-primary">
                                                        {log.userEmail[0].toUpperCase()}
                                                    </div>
                                                    <span className="text-sm font-bold text-text-main">{log.userEmail}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 border-r border-border-soft/20">
                                                <span className={cn(
                                                    "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm inline-block",
                                                    log.action === "BULK_ADD" ? "bg-green-500 text-white" :
                                                        log.action === "DELETE" ? "bg-red-500 text-white" :
                                                            "bg-blue-500 text-white"
                                                )}>
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5 text-sm font-bold text-text-soft">
                                                {log.details}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="py-32 text-center">
                                            <div className="flex flex-col items-center gap-4 opacity-20">
                                                <div className="p-6 bg-gray-100 rounded-full">
                                                    <History size={64} />
                                                </div>
                                                <p className="font-black text-xl uppercase tracking-tighter italic">Loq tapılmadı</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AuthGuard>
    );
}
