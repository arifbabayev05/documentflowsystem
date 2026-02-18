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
    RefreshCw,
    FileText,
    Shield
} from "lucide-react";
import { getAuditLogs } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";

/** Internal helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

interface AuditLog {
    id: string;
    action: string;
    category: "CUSTOMER" | "ARCHIVE" | "DOCUMENT" | "SYSTEM" | "USER";
    details: string;
    userEmail: string;
    createdAt: any;
    metadata?: any;
}

const ACTION_CONFIG: Record<string, { label: string, icon: any, color: string, bg: string }> = {
    BULK_ADD: { label: "Kütləvi Əlavə", icon: FilePlus2, color: "text-blue-600", bg: "bg-blue-50" },
    CREATE: { label: "Yeni Giriş", icon: FilePlus2, color: "text-emerald-600", bg: "bg-emerald-50" },
    DELETE: { label: "Silinmə", icon: Trash2, color: "text-red-600", bg: "bg-red-50" },
    UPDATE: { label: "Yenilənmə", icon: Edit3, color: "text-amber-600", bg: "bg-amber-50" },
    STATUS_CHANGE: { label: "Status Dəyişimi", icon: RefreshCw, color: "text-blue-600", bg: "bg-blue-100" },
    ARCHIVE: { label: "Arxivə keçid", icon: Archive, color: "text-slate-600", bg: "bg-slate-100" },
    RESTORE: { label: "Arxivdən Bərpa", icon: RefreshCw, color: "text-green-600", bg: "bg-green-50" },
    ARCHIVE_REQUEST: { label: "Arxiv Sorğusu", icon: Mail, color: "text-orange-600", bg: "bg-orange-50" },
    ARCHIVE_UPLOAD: { label: "Sənəd Yüklənişi", icon: FilePlus2, color: "text-emerald-700", bg: "bg-emerald-100" },
    GENERATE_DOC: { label: "Sənəd Yaradıldı", icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50" },
    ASSIGN: { label: "Təyinat", icon: UserCheck, color: "text-purple-600", bg: "bg-purple-50" },
    UPDATE_ROLE: { label: "Rol Dəyişimi", icon: ShieldCheck, color: "text-red-700", bg: "bg-red-50" },
    DEFAULT: { label: "Digər", icon: Activity, color: "text-slate-400", bg: "bg-slate-50" }
};

const TABS = [
    { id: "all", label: "Hamısı", icon: Activity },
    { id: "CUSTOMER", label: "Müştərilər", icon: User },
    { id: "ARCHIVE", label: "Arxiv", icon: Archive },
    { id: "DOCUMENT", label: "Sənədlər", icon: FileText },
    { id: "SYSTEM", label: "Sistem", icon: ShieldCheck },
    { id: "USER", label: "İstifadəçilər", icon: Mail }
];

export default function AuditLogsPage() {
    const { user, can } = useAuth();
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [activeTab, setActiveTab] = useState("all");

    if (!user || !can("page_audit_logs")) {
        return (
            <AuthGuard>
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                    <div className="h-16 w-16 rounded-3xl bg-red-50 flex items-center justify-center mb-6">
                        <ShieldCheck size={32} className="text-red-400" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Giriş Məhdudlaşdırılıb</h2>
                    <p className="text-slate-500 max-w-[300px]">Bu bölməyə daxil olmaq üçün Audit Loqları icazəniz olmalıdır.</p>
                </div>
            </AuthGuard>
        );
    }
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedAction, setSelectedAction] = useState<string>("all");

    const fetchLogs = async () => {
        setLoadingLogs(true);
        try {
            const logData = await getAuditLogs(400);
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

    const getLogCategory = (log: AuditLog) => {
        if (log.category) return log.category;

        // Inference for legacy logs
        const action = log.action;
        if (["CREATE", "UPDATE", "DELETE", "BULK_ADD", "STATUS_CHANGE", "ASSIGN"].includes(action)) return "CUSTOMER";
        if (["ARCHIVE", "RESTORE", "FILE_UPLOAD", "FILE_DELETE", "ARCHIVE_REQUEST"].includes(action)) return "ARCHIVE";
        if (["GENERATE_DOC"].includes(action)) return "DOCUMENT";
        if (["SETTINGS_UPDATE", "COURT_ADD", "COURT_UPDATE", "COURT_DELETE", "STORE_ADD", "STORE_UPDATE", "STORE_DELETE", "TEMPLATE_ADD", "TEMPLATE_UPDATE", "TEMPLATE_DELETE"].includes(action)) return "SYSTEM";
        if (["UPDATE_ROLE"].includes(action)) return "USER";
        return "SYSTEM";
    };

    const filteredLogs = useMemo(() => {
        return auditLogs.filter(log => {
            const category = getLogCategory(log);
            const matchesSearch =
                log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (typeof log.userEmail === 'string' ? log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) : false) ||
                (log.metadata?.targetName || "").toLowerCase().includes(searchTerm.toLowerCase());

            const matchesAction = selectedAction === "all" || log.action === selectedAction;
            const matchesTab = activeTab === "all" || category === activeTab;

            return matchesSearch && matchesAction && matchesTab;
        });
    }, [auditLogs, searchTerm, selectedAction, activeTab]);

    const actionsList = useMemo(() => {
        const set = new Set(auditLogs.filter(l => activeTab === 'all' || getLogCategory(l) === activeTab).map(l => l.action));
        return Array.from(set);
    }, [auditLogs, activeTab]);

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
            <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700 pb-20 px-6">

                {/* Header Section */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 pt-6">
                    <div>
                        <div className="flex items-center gap-4 mb-3">
                            <div className="h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-2xl shadow-slate-200">
                                <History size={24} />
                            </div>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Əməliyyat Tarixçəsi</h1>
                        </div>
                        <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em] pl-1">Audit və Təhlükəsizlik Monitorinqi Paneli</p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-3">
                        {/* Search */}
                        <div className="relative w-full sm:w-[350px]">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Daxilində axtar..."
                                className="w-full pl-12 pr-6 py-3.5 bg-white rounded-2xl border border-slate-200 outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all font-bold text-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Filter Select */}
                        <div className="relative w-full sm:w-[220px]">
                            <select
                                value={selectedAction}
                                onChange={(e) => setSelectedAction(e.target.value)}
                                className="appearance-none bg-white border border-slate-200 rounded-2xl pl-6 pr-12 py-3.5 text-xs font-black uppercase tracking-wider outline-none focus:border-slate-900 hover:border-slate-300 shadow-sm cursor-pointer w-full transition-all"
                            >
                                <option value="all">BÜTÜN NÖVLƏR</option>
                                {actionsList.map(act => (
                                    <option key={act} value={act}>{ACTION_CONFIG[act]?.label || act}</option>
                                ))}
                            </select>
                            <Filter size={14} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>

                        <button
                            onClick={fetchLogs}
                            className="h-12.5 w-12.5 flex items-center justify-center bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-900 hover:text-white transition-all shadow-sm active:scale-95"
                        >
                            <RefreshCw size={18} className={loadingLogs ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                {/* Tabs UI */}
                <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-[2rem] w-fit border border-slate-200 shadow-inner">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); setSelectedAction("all"); }}
                                className={cn(
                                    "px-6 py-3 rounded-[1.5rem] flex items-center gap-3 transition-all relative overflow-hidden",
                                    isActive
                                        ? "bg-white text-slate-900 shadow-xl border border-slate-200/50"
                                        : "text-slate-500 hover:bg-white/50 hover:text-slate-700"
                                )}
                            >
                                <Icon size={16} className={cn(isActive ? "text-slate-900" : "opacity-50")} />
                                <span className="text-[11px] font-black uppercase tracking-wider leading-none">{tab.label}</span>
                                {isActive && (
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-0.5 w-4 bg-slate-900 rounded-full" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Main Table */}
                <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden relative">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-10">Zaman</th>
                                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">İstifadəçi</th>
                                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Kateqoriya</th>
                                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Hərəkət</th>
                                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Təfərrüat</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLogs.length > 0 ? (
                                    filteredLogs.map((log) => {
                                        const config = ACTION_CONFIG[log.action] || ACTION_CONFIG.DEFAULT;
                                        const Icon = config.icon;
                                        const date = log.createdAt?.toDate ? log.createdAt.toDate() : new Date();

                                        return (
                                            <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all group">
                                                <td className="px-8 py-5 whitespace-nowrap pl-10">
                                                    <div className="flex flex-col">
                                                        <span className="text-[13px] font-black text-slate-900 tracking-tight">
                                                            {date.toLocaleDateString('az-AZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                        </span>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase mt-1 flex items-center gap-1.5 opacity-60">
                                                            <Clock size={9} /> {date.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-9 w-9 rounded-xl bg-slate-900 flex items-center justify-center text-[11px] font-black text-white group-hover:scale-105 transition-transform duration-300">
                                                            {typeof log.userEmail === 'string' && log.userEmail.length > 0 ? log.userEmail[0].toUpperCase() : "?"}
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-[12px] font-black text-slate-900 truncate max-w-[140px]">
                                                                {typeof log.userEmail === 'string' && log.userEmail.includes('@')
                                                                    ? log.userEmail.split('@')[0]
                                                                    : (typeof log.userEmail === 'string' ? log.userEmail : "Sistem")}
                                                            </span>
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase truncate max-w-[140px] opacity-60">
                                                                {typeof log.userEmail === 'string' && log.userEmail.includes('@')
                                                                    ? `@${log.userEmail.split('@')[1]}`
                                                                    : "legal12.az"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 text-center">
                                                    <span className="px-3 py-1 bg-slate-100 rounded-full text-[9px] font-black text-slate-500 uppercase tracking-wider border border-slate-200">
                                                        {getLogCategory(log)}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <div className={cn(
                                                        "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 w-fit border border-current shadow-sm",
                                                        config.color,
                                                        config.bg
                                                    )}>
                                                        <Icon size={12} />
                                                        {config.label}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <div className="flex flex-col max-w-[450px]">
                                                        <p className="text-[13px] font-bold text-slate-600 group-hover:text-slate-900 transition-colors leading-snug">
                                                            {log.details}
                                                        </p>
                                                        {log.metadata?.targetName && (
                                                            <span className="text-[9px] font-black text-slate-400 uppercase mt-1.5 flex items-center gap-1">
                                                                <User size={10} /> {log.metadata.targetName}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="py-32 text-center">
                                            <div className="flex flex-col items-center gap-5 opacity-40">
                                                <SearchX size={48} className="text-slate-300" />
                                                <div>
                                                    <p className="font-black text-xl uppercase tracking-tighter text-slate-900">Məlumat Tapılmadı</p>
                                                    <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">Seçilmiş meyar üzrə heç bir log mövcud deyil</p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Summary Section */}
                <div className="flex items-center justify-between px-6 pt-2">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Göstərilən: <span className="text-slate-900">{filteredLogs.length} Əməliyyat</span>
                        </div>
                    </div>
                    <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest italic flex items-center gap-2">
                        <Shield size={10} /> Protected by Legal12 Compliance Engine v2.5
                    </div>
                </div>
            </div>
        </AuthGuard>
    );
}

const SearchX = ({ size, className }: any) => (
    <div className={cn("relative", className)}>
        <Search size={size} className="text-slate-200" />
        <X size={size / 2} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-400" />
    </div>
);
