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
    Shield,
    AlertTriangle,
    ChevronDown,
    Check,
    Users,
    ArrowRight,
    Eye,
    Layout
} from "lucide-react";
import { getAuditLogs, getSystemErrors, getAllUsers, deleteAuditLogsBeforeDate } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";
import { toast } from "sonner";

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
    SYSTEM_ERROR: { label: "Sistem Xətası", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
    CUSTOMER_UPDATE_DETAILED: { label: "Müştəri Yenilənməsi", icon: Edit3, color: "text-blue-700", bg: "bg-blue-50" },
    DEFAULT: { label: "Digər", icon: Activity, color: "text-slate-400", bg: "bg-slate-50" }
};

const TABS = [
    { id: "all", label: "Hamısı", icon: Activity },
    { id: "CUSTOMER", label: "Müştərilər", icon: User },
    { id: "ARCHIVE", label: "Arxiv", icon: Archive },
    { id: "DOCUMENT", label: "Sənədlər", icon: FileText },
    { id: "SYSTEM", label: "Sistem", icon: ShieldCheck },
    { id: "USER", label: "İstifadəçilər", icon: Mail },
    { id: "ERRORS", label: "Xətalar", icon: AlertTriangle }
];

export default function AuditLogsPage() {
    const { user, can } = useAuth();
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [activeTab, setActiveTab] = useState("all");
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedAction, setSelectedAction] = useState<string>("all");
    const [users, setUsers] = useState<any[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [userSearchTerm, setUserSearchTerm] = useState("");
    const [isUserFilterOpen, setIsUserFilterOpen] = useState(false);
    const [showCleanupModal, setShowCleanupModal] = useState(false);
    const [cleaning, setCleaning] = useState(false);

    // Timeline Modal State
    const [selectedGroupLogs, setSelectedGroupLogs] = useState<AuditLog[] | null>(null);
    const [selectedTimelineLog, setSelectedTimelineLog] = useState<AuditLog | null>(null);

    const getLogCategory = (log: AuditLog) => {
        if (log.category) return log.category;
        const action = log.action;
        if (["CREATE", "UPDATE", "DELETE", "BULK_ADD", "STATUS_CHANGE", "ASSIGN", "CUSTOMER_UPDATE_DETAILED"].includes(action)) return "CUSTOMER";
        if (["ARCHIVE", "RESTORE", "FILE_UPLOAD", "FILE_DELETE", "ARCHIVE_REQUEST"].includes(action)) return "ARCHIVE";
        if (["GENERATE_DOC"].includes(action)) return "DOCUMENT";
        if (["SETTINGS_UPDATE", "COURT_ADD", "COURT_UPDATE", "COURT_DELETE", "STORE_ADD", "STORE_UPDATE", "STORE_DELETE", "TEMPLATE_ADD", "TEMPLATE_UPDATE", "TEMPLATE_DELETE"].includes(action)) return "SYSTEM";
        if (["UPDATE_ROLE"].includes(action)) return "USER";
        if (action === "SYSTEM_ERROR") return "ERRORS";
        return "SYSTEM";
    };

    const fetchLogs = async () => {
        setLoadingLogs(true);
        try {
            const [auditData, errorData, usersData]: [any[], any[], any[]] = await Promise.all([
                getAuditLogs(600),
                activeTab === "ERRORS" || activeTab === "all" ? getSystemErrors(100) : Promise.resolve([]),
                getAllUsers()
            ]);
            setUsers(usersData);
            const normalizedErrors = errorData.map(e => ({
                ...e,
                action: "SYSTEM_ERROR",
                category: "ERRORS",
                details: `${e.context}: ${e.message}`,
                metadata: { ...e.metadata, stack: e.stack, url: e.url }
            }));
            setAuditLogs([...auditData, ...normalizedErrors].sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
                return dateB.getTime() - dateA.getTime();
            }) as AuditLog[]);
        } catch (error) {
            console.error("Error fetching audit logs:", error);
        } finally {
            setLoadingLogs(false);
        }
    };

    useEffect(() => {
        if (user) fetchLogs();
    }, [user, activeTab]);

    const filteredLogs = useMemo(() => {
        return auditLogs.filter(log => {
            const category = getLogCategory(log);
            const matchesSearch =
                log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (typeof log.userEmail === 'string' ? log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) : false) ||
                (log.metadata?.targetName || "").toLowerCase().includes(searchTerm.toLowerCase());
            const matchesAction = selectedAction === "all" || log.action === selectedAction;
            const matchesTab = activeTab === "all" || category === activeTab;
            const matchesUser = selectedUsers.length === 0 || selectedUsers.includes(log.userEmail);
            return matchesSearch && matchesAction && matchesTab && matchesUser;
        });
    }, [auditLogs, searchTerm, selectedAction, activeTab, selectedUsers]);

    const groupedLogs = useMemo(() => {
        const groups: Record<string, AuditLog[]> = {};
        filteredLogs.forEach(log => {
            const gid = log.metadata?.targetId || log.id;
            if (!groups[gid]) groups[gid] = [];
            groups[gid].push(log);
        });
        return Object.values(groups).sort((a, b) => {
            const dateA = a[0].createdAt?.toDate ? a[0].createdAt.toDate() : new Date(a[0].createdAt || 0);
            const dateB = b[0].createdAt?.toDate ? b[0].createdAt.toDate() : new Date(b[0].createdAt || 0);
            return dateB.getTime() - dateA.getTime();
        });
    }, [filteredLogs]);

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

    return (
        <AuthGuard>
            <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700 pb-20 px-6">
                {/* Header Section */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 pt-6">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-xl">
                            <History size={24} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Əməliyyat Tarixçəsi</h1>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative w-full sm:w-[350px]">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Müştəri və ya detal axtar..."
                                className="w-full pl-12 pr-6 py-3.5 bg-white rounded-2xl border border-slate-200 outline-none focus:ring-2 focus:ring-slate-900/5 transition-all font-bold text-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Tabs UI */}
                <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-[2rem] w-fit border border-slate-200">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); setSelectedAction("all"); }}
                                className={cn(
                                    "px-6 py-3 rounded-[1.5rem] flex items-center gap-3 transition-all",
                                    isActive ? "bg-white text-slate-900 shadow-md" : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                <Icon size={16} />
                                <span className="text-[11px] font-black uppercase tracking-wider">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Grouped Table */}
                <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-10">Müştəri / Obyekt</th>
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Son Hərəkət</th>
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">İşləm Sayı</th>
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right pr-10">Ətraflı</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {groupedLogs.map((group) => {
                                const latest = group[0];
                                const date = latest.createdAt?.toDate ? latest.createdAt.toDate() : new Date();
                                const config = ACTION_CONFIG[latest.action] || ACTION_CONFIG.DEFAULT;

                                return (
                                    <tr key={latest.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer group" onClick={() => {
                                        setSelectedGroupLogs(group);
                                        setSelectedTimelineLog(group[0]);
                                    }}>
                                        <td className="px-8 py-6 pl-10">
                                            <div className="flex items-center gap-4">
                                                <div className="h-11 w-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-slate-900 group-hover:text-white transition-all">
                                                    {latest.metadata?.targetName ? <User size={20} /> : <Layout size={20} />}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-slate-900 uppercase">
                                                        {latest.metadata?.targetName || latest.category || "Sistem"}
                                                    </p>
                                                    <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5 mt-1">
                                                        <Clock size={10} /> {date.toLocaleString('az-AZ')}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex flex-col gap-2">
                                                <div className={cn("px-2.5 py-1 rounded-lg text-[9px] font-black uppercase w-fit border", config.color, config.bg)}>
                                                    {config.label}
                                                </div>
                                                <p className="text-[12px] font-bold text-slate-600 truncate max-w-[400px]">
                                                    {latest.details}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-center">
                                            <span className="px-3 py-1.5 bg-slate-100 rounded-xl text-xs font-black text-slate-600">
                                                {group.length}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 text-right pr-10">
                                            <button className="h-10 w-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-900 hover:text-white transition-all shadow-sm">
                                                <ArrowRight size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Timeline Modal */}
                {selectedGroupLogs && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-10">
                        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setSelectedGroupLogs(null)} />
                        <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-[1400px] h-[90vh] flex flex-col lg:flex-row overflow-hidden relative animate-in zoom-in-95 duration-300">

                            {/* Left Sidebar: Timeline */}
                            <div className="w-full lg:w-[400px] border-r border-slate-100 flex flex-col bg-slate-50/50">
                                <div className="p-8 border-b border-slate-100 bg-white">
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Əməliyyat Tarixçəsi</h3>
                                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">
                                        {selectedGroupLogs[0].metadata?.targetName || "Obyekt Detalları"}
                                    </p>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                                    {selectedGroupLogs.map((log, idx) => {
                                        const config = ACTION_CONFIG[log.action] || ACTION_CONFIG.DEFAULT;
                                        const isActive = selectedTimelineLog?.id === log.id;
                                        const date = log.createdAt?.toDate ? log.createdAt.toDate() : new Date();

                                        return (
                                            <button
                                                key={log.id}
                                                onClick={() => setSelectedTimelineLog(log)}
                                                className={cn(
                                                    "w-full text-left p-5 rounded-3xl transition-all relative border-2",
                                                    isActive ? "bg-white border-slate-900 shadow-xl scale-105 z-10" : "bg-white/40 border-transparent hover:bg-white hover:border-slate-200"
                                                )}
                                            >
                                                <div className="flex gap-4">
                                                    <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center shrink-0", config.bg, config.color)}>
                                                        <config.icon size={18} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-[11px] font-black text-slate-900 uppercase tracking-wider">{config.label}</p>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{date.toLocaleString('az-AZ')}</p>
                                                        <p className="text-[12px] font-bold text-slate-600 mt-2 line-clamp-2 leading-snug">{log.details}</p>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Main Area: Detailed View & Simulation */}
                            <div className="flex-1 flex flex-col bg-white overflow-y-auto custom-scrollbar">
                                <div className="p-10">
                                    {selectedTimelineLog ? (
                                        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                            {/* Log Header */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-6">
                                                    <div className="h-16 w-16 rounded-[2rem] bg-slate-900 text-white flex items-center justify-center shadow-2xl">
                                                        <User size={32} />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-2xl font-black text-slate-900 uppercase">Təfərrüatlı Hesabat</h4>
                                                        <div className="flex items-center gap-3 mt-1.5">
                                                            <span className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-black text-slate-500 uppercase">{selectedTimelineLog.userEmail}</span>
                                                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(selectedTimelineLog.createdAt?.toDate?.() || 0).toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button onClick={() => setSelectedGroupLogs(null)} className="h-12 w-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 transition-all">
                                                    <X size={24} />
                                                </button>
                                            </div>

                                            {/* Changes List Section */}
                                            {(selectedTimelineLog.metadata?.changesList && selectedTimelineLog.metadata.changesList.length > 0) && (
                                                <div className="space-y-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-6 w-1 bg-amber-500 rounded-full" />
                                                        <h5 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                                            <Activity size={16} /> EDİLƏN DƏYİŞİKLİKLƏR ({selectedTimelineLog.metadata.changesCount})
                                                        </h5>
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        {selectedTimelineLog.metadata.changesList.map((change: string, cIdx: number) => {
                                                            const [field, values] = change.split(': ');
                                                            return (
                                                                <div key={cIdx} className="bg-amber-50/50 border border-amber-100 p-5 rounded-3xl flex flex-col gap-2">
                                                                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{field.replace('details.', '')}</p>
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-xs font-bold text-slate-400 truncate max-w-[120px]">{change.includes('->') ? change.split(' -> ')[0].split(': ')[1] || 'N/A' : 'N/A'}</span>
                                                                        <ArrowRight size={14} className="text-amber-300" />
                                                                        <span className="text-xs font-black text-slate-900 truncate">{change.includes('->') ? change.split(' -> ')[1] : change}</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Data Snapshot Simulation */}
                                            {selectedTimelineLog.metadata?.snapshot ? (
                                                <div className="space-y-8">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-6 w-1 bg-slate-900 rounded-full" />
                                                        <h5 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                                            <Eye size={16} /> MƏLUMAT SİMULYASİYASI (O VAXTKI VƏZİYYƏT)
                                                        </h5>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Müştəri Kodu</p>
                                                            <p className="text-sm font-black text-slate-900">{selectedTimelineLog.metadata.snapshot.customerCode || "N/A"}</p>
                                                        </div>
                                                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 col-span-2">
                                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Tam Ad</p>
                                                            <p className="text-sm font-black text-slate-900 uppercase">{selectedTimelineLog.metadata.snapshot.fullName || "N/A"}</p>
                                                        </div>
                                                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">FİN</p>
                                                            <p className="text-sm font-mono font-black text-slate-900 uppercase">{selectedTimelineLog.metadata.snapshot.details?.fin || "N/A"}</p>
                                                        </div>
                                                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Telefon</p>
                                                            <p className="text-sm font-black text-slate-900">{selectedTimelineLog.metadata.snapshot.details?.phone || "N/A"}</p>
                                                        </div>
                                                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Borc Məbləği</p>
                                                            <p className="text-sm font-black text-emerald-600">{selectedTimelineLog.metadata.snapshot.debtAmount || "0.00"} AZN</p>
                                                        </div>
                                                    </div>

                                                    {/* Invoices Simulation */}
                                                    <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
                                                        <div className="bg-slate-900 p-6">
                                                            <h6 className="text-xs font-black text-white uppercase tracking-widest">Daxil Edilən Fakturalar</h6>
                                                        </div>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left text-xs">
                                                                <thead>
                                                                    <tr className="bg-slate-50 border-b border-slate-100">
                                                                        <th className="px-6 py-4 font-black uppercase text-slate-400">#</th>
                                                                        <th className="px-6 py-4 font-black uppercase text-slate-400">Faktura №</th>
                                                                        <th className="px-6 py-4 font-black uppercase text-slate-400">Tarix / Mal</th>
                                                                        <th className="px-6 py-4 font-black uppercase text-slate-400 text-right text-emerald-600">Məbləğ</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-50">
                                                                    {(selectedTimelineLog.metadata.snapshot.details?.invoices || []).map((inv: any, iNum: number) => (
                                                                        <tr key={iNum}>
                                                                            <td className="px-6 py-4 font-black text-slate-400">{iNum + 1}</td>
                                                                            <td className="px-6 py-4 font-bold">{inv.invoiceNumber || "N/A"}</td>
                                                                            <td className="px-6 py-4">
                                                                                {(inv.orders || []).map((o: any, oIdx: number) => (
                                                                                    <div key={oIdx} className="mb-1 last:mb-0">
                                                                                        <span className="font-bold text-slate-900">{o.contractDate}</span>
                                                                                        <span className="ml-2 text-slate-500 font-medium">{o.productDescription}</span>
                                                                                    </div>
                                                                                ))}
                                                                            </td>
                                                                            <td className="px-6 py-4 text-right font-black text-slate-900">
                                                                                {inv.orders?.reduce((sum: number, o: any) => sum + (parseFloat(o.totalPrice) || 0), 0).toFixed(2)} AZN
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center p-20 bg-slate-50 rounded-[3rem] border border-dashed border-slate-200 opacity-60">
                                                    <Layout size={48} className="text-slate-300 mb-4" />
                                                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Köhnə loglar üçün tam simulyasiya mövcud deyil</p>
                                                    <p className="text-[10px] font-bold text-slate-300 uppercase mt-2">Detallar: {selectedTimelineLog.details}</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-slate-300">
                                            <p className="text-sm font-black uppercase tracking-widest animate-pulse">Sol paneldən əməliyyat seçin</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
