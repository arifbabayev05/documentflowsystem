"use client";

import { useEffect, useState, useMemo } from "react";
import {
    History,
    Search,
    Loader2,
    Calendar,
    User,
    Activity,
    ArrowUpDown,
    Filter,
    FilePlus2,
    Trash2,
    Edit3,
    Archive,
    ShieldCheck,
    Smartphone,
    X,
    Clock,
    UserCheck,
    Mail,
    RefreshCw
} from "lucide-react";
import { getAuditLogs } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";

/** Internal helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

interface AuditLog {
    id: string;
    action: string;
    details: string;
    userEmail: string;
    createdAt: any;
    metadata?: any;
}

const ACTION_CONFIG: Record<string, { label: string, icon: any, color: string, bg: string }> = {
    BULK_ADD: { label: "Kütləvi Əlavə", icon: FilePlus2, color: "text-blue-600", bg: "bg-blue-50" },
    DELETE: { label: "Silinmə", icon: Trash2, color: "text-red-600", bg: "bg-red-50" },
    UPDATE: { label: "Yenilənmə", icon: Edit3, color: "text-amber-600", bg: "bg-amber-50" },
    STATUS_CHANGE: { label: "Status Dəyişimi", icon: RefreshCw, color: "text-emerald-600", bg: "bg-emerald-50" },
    ARCHIVE: { label: "Arxivləmə", icon: Archive, color: "text-slate-600", bg: "bg-slate-100" },
    ASSIGN: { label: "Təyinat", icon: UserCheck, color: "text-purple-600", bg: "bg-purple-50" },
    DEFAULT: { label: "Digər", icon: Activity, color: "text-slate-400", bg: "bg-slate-50" }
};

export default function AuditLogsPage() {
    const { user } = useAuth();
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedAction, setSelectedAction] = useState<string>("all");

    const fetchLogs = async () => {
        setLoadingLogs(true);
        try {
            const logData = await getAuditLogs(300);
            setAuditLogs(logData as AuditLog[]);
        } catch (error) {
            console.error("Error fetching audit logs:", error);
        } finally {
            setLoadingLogs(false);
        }
    };

    useEffect(() => {
        if (user) fetchLogs();
    }, [user]);

    const filteredLogs = useMemo(() => {
        return auditLogs.filter(log => {
            const matchesSearch =
                log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
                log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (log.metadata?.targetName || "").toLowerCase().includes(searchTerm.toLowerCase());

            const matchesAction = selectedAction === "all" || log.action === selectedAction;

            return matchesSearch && matchesAction;
        });
    }, [auditLogs, searchTerm, selectedAction]);

    const actionsList = useMemo(() => {
        const set = new Set(auditLogs.map(l => l.action));
        return Array.from(set);
    }, [auditLogs]);

    if (loadingLogs && auditLogs.length === 0) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="flex flex-col items-center gap-5">
                    <div className="relative">
                        <div className="h-20 w-20 rounded-full border-4 border-slate-100 border-t-slate-900 animate-spin" />
                        <Activity className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-900" size={32} />
                    </div>
                    <p className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Sistem Loqları Yüklənir...</p>
                </div>
            </div>
        );
    }

    return (
        <AuthGuard>
            <div className="max-w-[1500px] mx-auto space-y-10 animate-in fade-in duration-700 pb-20 px-6">

                {/* Header Section */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 pt-6">
                    <div>
                        <div className="flex items-center gap-4 mb-3">
                            <div className="h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-2xl shadow-slate-200">
                                <ShieldCheck size={24} />
                            </div>
                            <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Audit Sistemi</h1>
                        </div>
                        <p className="text-slate-400 font-bold text-sm uppercase tracking-widest pl-1">Platformadakı hər bir hərəkətin rəsmi tarixçəsi</p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        {/* Search */}
                        <div className="relative w-full sm:w-[350px]">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Daxilində axtar..."
                                className="w-full pl-14 pr-6 py-4 bg-white rounded-2xl border border-slate-200 outline-none focus:border-slate-900 transition-all font-bold text-sm shadow-sm hover:border-slate-300"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Filter Select */}
                        <div className="relative w-full sm:w-auto">
                            <select
                                value={selectedAction}
                                onChange={(e) => setSelectedAction(e.target.value)}
                                className="appearance-none bg-white border border-slate-200 rounded-2xl px-8 py-4 pr-12 text-sm font-black uppercase tracking-wider outline-none focus:border-slate-900 hover:border-slate-300 shadow-sm cursor-pointer w-full transition-all"
                            >
                                <option value="all">BÜTÜN ƏMƏLİYYATLAR</option>
                                {actionsList.map(act => (
                                    <option key={act} value={act}>{ACTION_CONFIG[act]?.label || act}</option>
                                ))}
                            </select>
                            <Filter size={16} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>

                        <button
                            onClick={fetchLogs}
                            className="h-14 w-14 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                        >
                            <RefreshCw size={20} className={loadingLogs ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                {/* Main Table */}
                <div className="bg-white rounded-[3.5rem] border border-slate-200 shadow-2xl shadow-slate-200/50 overflow-hidden relative">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-200 text-left">
                                    <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Zaman</th>
                                    <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">İstifadəçi</th>
                                    <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Növ</th>
                                    <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Təfərrüat</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLogs.length > 0 ? (
                                    filteredLogs.map((log) => {
                                        const config = ACTION_CONFIG[log.action] || ACTION_CONFIG.DEFAULT;
                                        const Icon = config.icon;
                                        const date = log.createdAt?.toDate ? log.createdAt.toDate() : new Date();

                                        return (
                                            <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-all group">
                                                <td className="px-10 py-7 whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-black text-slate-900 tracking-tight">
                                                            {date.toLocaleDateString('az-AZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase mt-1 flex items-center gap-1.5">
                                                            <Clock size={10} /> {date.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-10 py-7">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-11 w-11 rounded-2xl bg-slate-900 flex items-center justify-center text-[13px] font-black text-white shadow-lg shadow-slate-200 group-hover:scale-110 transition-transform">
                                                            {log.userEmail ? log.userEmail[0].toUpperCase() : "?"}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[13px] font-black text-slate-900 truncate max-w-[180px]">
                                                                {typeof log.userEmail === 'string' && log.userEmail.includes('@')
                                                                    ? log.userEmail.split('@')[0]
                                                                    : (log.userEmail || "Sistem")}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1 mt-0.5">
                                                                <Mail size={10} />
                                                                {typeof log.userEmail === 'string' && log.userEmail.includes('@')
                                                                    ? log.userEmail.split('@')[1]
                                                                    : "legal12.az"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-10 py-7">
                                                    <div className={cn(
                                                        "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 w-fit border border-current shadow-sm",
                                                        config.color,
                                                        config.bg
                                                    )}>
                                                        <Icon size={14} />
                                                        {config.label}
                                                    </div>
                                                </td>
                                                <td className="px-10 py-7">
                                                    <p className="text-sm font-bold text-slate-500 max-w-[400px] leading-relaxed group-hover:text-slate-900 transition-colors">
                                                        {log.details}
                                                        {log.metadata?.count && <span className="ml-2 px-2 py-0.5 bg-slate-100 rounded text-[10px] text-slate-600 font-black">X {log.metadata.count}</span>}
                                                    </p>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="py-40 text-center">
                                            <div className="flex flex-col items-center gap-5 opacity-30">
                                                <div className="h-24 w-24 bg-slate-100 rounded-[2rem] flex items-center justify-center text-slate-400 rotate-12">
                                                    <History size={48} />
                                                </div>
                                                <div>
                                                    <p className="font-black text-2xl uppercase tracking-tighter italic text-slate-900">Məlumat Tapılmadı</p>
                                                    <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-widest">Axtarış meyarlarını dəyişib yenidən cəhd edin</p>
                                                </div>
                                                {searchTerm && (
                                                    <button
                                                        onClick={() => { setSearchTerm(""); setSelectedAction("all"); }}
                                                        className="mt-4 px-8 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-slate-200"
                                                    >
                                                        Sıfırla
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Quick Stats / Footer */}
                <div className="flex items-center justify-between px-10">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <Smartphone size={14} />
                            Cəmi: <span className="text-slate-900">{filteredLogs.length} Log</span>
                        </div>
                    </div>
                    <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">
                        Legal12 Audit Core v2.0
                    </div>
                </div>
            </div>
        </AuthGuard>
    );
}
