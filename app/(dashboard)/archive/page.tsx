"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
    Search,
    Loader2,
    FileText,
    FileUp,
    Download,
    Trash2,
    User,
    Box,
    X,
    FileArchive,
    SearchX,
    CheckCircle2,
    Calendar,
    ChevronDown,
    UserCheck,
    Clock,
    AlertCircle,
    Check,
    FolderOpen,
    ExternalLink,
    RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getCustomers, updateCustomer, getAllUsers } from "@/lib/db";
import AuthGuard from "@/components/auth/AuthGuard";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { ProcessStatus } from "../dashboard/page";

const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

interface Invoice {
    id: string;
    invoiceNumber: string;
    archiveUrl?: string;
    archiveName?: string;
    archiveRequested?: boolean;
    orders?: any[];
}

interface CustomerRow {
    id: string;
    customerCode: string;
    fullName: string;
    debtAmount: string;
    process_status: ProcessStatus;
    details?: { invoices?: Invoice[] };
    updatedAt?: any;
    statusHistory?: any[];
    archiveAssignedTo?: string;
    archiveAssignedAt?: string;
}

export default function ArchiveDocumentsPage() {
    const { user, can } = useAuth();
    const isManager = user?.role === "ARCHIVE_MANAGER" || user?.role === "SUPERADMIN";

    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [archivers, setArchivers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
    const [uploadingId, setUploadingId] = useState<string | null>(null);
    const [sideTab, setSideTab] = useState<"tasks" | "stats">("tasks");
    const [filter, setFilter] = useState<"all" | "pending" | "done" | "unassigned">("all");

    const [assignOpen, setAssignOpen] = useState(false);
    const [dropdownSearch, setDropdownSearch] = useState("");
    const [keyboardIndex, setKeyboardIndex] = useState(-1);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [custData, userData] = await Promise.all([getCustomers(), getAllUsers()]);
            const archiveRequired = (custData as CustomerRow[]).filter(c =>
                c.details?.invoices?.some(inv => (inv as any).archiveRequested || inv.archiveUrl)
            );
            setCustomers(archiveRequired);
            setArchivers((userData as any[]).filter(u => u.role === "ARCHIVER" || u.role === "ARCHIVE_MANAGER"));
        } catch {
            toast.error("Məlumatlar yüklənmədi");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (assignOpen) {
            setDropdownSearch("");
            setKeyboardIndex(-1);
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [assignOpen]);

    const handleUpload = async (file: File, invoiceId: string) => {
        if (!selectedCustomer) return;
        if (!file.name.endsWith(".pdf")) { toast.error("Yalnız PDF formatı!"); return; }
        try {
            setUploadingId(invoiceId);
            const storageRef = ref(storage, `UploadedPDFs/${selectedCustomer.id}/${invoiceId}.pdf`);
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);
            const invoices = [...(selectedCustomer.details?.invoices || [])];
            const idx = invoices.findIndex(i => i.id === invoiceId);
            if (idx !== -1) invoices[idx] = { ...invoices[idx], archiveUrl: url, archiveName: file.name };
            const updated = { ...selectedCustomer, process_status: 'ARCHIVE_UPLOADED' as ProcessStatus, details: { ...selectedCustomer.details, invoices } };
            await updateCustomer(selectedCustomer.id, updated, user?.email || "system");
            setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? updated : c));
            setSelectedCustomer(updated);
            toast.success("Sənəd uğurla yükləndi");
        } catch { toast.error("Yükləmə zamanı xəta baş verdi"); }
        finally { setUploadingId(null); }
    };

    const handleRemoveFile = async (invoiceId: string) => {
        if (!selectedCustomer) return;
        try {
            const storageRef = ref(storage, `UploadedPDFs/${selectedCustomer.id}/${invoiceId}.pdf`);
            await deleteObject(storageRef).catch(() => { });
            const invoices = [...(selectedCustomer.details?.invoices || [])];
            const idx = invoices.findIndex(i => i.id === invoiceId);
            if (idx !== -1) invoices[idx] = { ...invoices[idx], archiveUrl: "", archiveName: "" };
            const updated = { ...selectedCustomer, details: { ...selectedCustomer.details, invoices } };
            await updateCustomer(selectedCustomer.id, updated, user?.email || "system");
            setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? updated : c));
            setSelectedCustomer(updated);
            toast.success("Sənəd silindi");
        } catch { toast.error("Silinmə zamanı xəta baş verdi"); }
    };

    const handleAssign = async (archiverEmail: string) => {
        if (!selectedCustomer) return;
        try {
            const updated = {
                ...selectedCustomer,
                archiveAssignedTo: archiverEmail || "",
                archiveAssignedAt: archiverEmail ? new Date().toISOString() : ""
            };
            await updateCustomer(selectedCustomer.id, updated, user?.email || "system");
            setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? updated : c));
            setSelectedCustomer(updated);
            setAssignOpen(false);
            toast.success(archiverEmail ? "Tapşırıq təyin edildi" : "Təyinat ləğv edildi");
        } catch { toast.error("Xəta baş verdi"); }
    };

    const isCustomerDone = (c: CustomerRow) => {
        const rel = c.details?.invoices?.filter(inv => (inv as any).archiveRequested || inv.archiveUrl) || [];
        return rel.length > 0 && rel.every(inv => !!inv.archiveUrl);
    };

    const visibleCustomers = useMemo(() => {
        return customers.filter(c => isManager || c.archiveAssignedTo === user?.email);
    }, [customers, isManager, user?.email]);

    const filteredCustomers = useMemo(() => {
        const s = searchTerm.toLowerCase();
        return visibleCustomers.filter(c => {
            const nameMatch = c.fullName.toLowerCase().includes(s) || (c.customerCode || "").toLowerCase().includes(s);
            if (!nameMatch) return false;
            if (filter === "pending" && (isCustomerDone(c) || !c.archiveAssignedTo)) return false;
            if (filter === "done" && !isCustomerDone(c)) return false;
            if (filter === "unassigned" && c.archiveAssignedTo) return false;
            return true;
        });
    }, [visibleCustomers, searchTerm, filter]);

    const filterStats = useMemo(() => {
        return {
            all: visibleCustomers.length,
            unassigned: visibleCustomers.filter(c => !c.archiveAssignedTo).length,
            pending: visibleCustomers.filter(c => c.archiveAssignedTo && !isCustomerDone(c)).length,
            done: visibleCustomers.filter(c => isCustomerDone(c)).length
        };
    }, [visibleCustomers]);

    const archiverWorkloads = useMemo(() => {
        return archivers.map(a => {
            const assigned = customers.filter(c => c.archiveAssignedTo === a.email);
            const completed = assigned.filter(c => isCustomerDone(c));
            return { ...a, count: assigned.length, done: completed.length };
        }).sort((a, b) => b.count - a.count);
    }, [customers, archivers]);

    const filteredArchivers = useMemo(() => {
        const s = dropdownSearch.toLowerCase();
        return archivers.filter(a => a.displayName?.toLowerCase().includes(s) || a.email?.toLowerCase().includes(s));
    }, [archivers, dropdownSearch]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!assignOpen) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setKeyboardIndex(prev => (prev < filteredArchivers.length - 1 ? prev + 1 : prev));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setKeyboardIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === "Enter" && keyboardIndex >= 0) {
            e.preventDefault();
            handleAssign(filteredArchivers[keyboardIndex].email);
        } else if (e.key === "Escape") {
            setAssignOpen(false);
        }
    };

    if (!user || (!can("page_archiver") && !can("page_archive_manager") && user.role !== "SUPERADMIN")) {
        return <AuthGuard><div className="h-[60vh] flex flex-col items-center justify-center opacity-40"><FileArchive size={40} /><h2 className="mt-4 font-bold">Girişə icazə yoxdur</h2></div></AuthGuard>;
    }

    return (
        <AuthGuard>
            <div className="flex bg-[#F8FAFC] h-[calc(100vh-64px)] overflow-hidden">
                {/* Sidebar */}
                <div className="w-[320px] bg-white border-r border-slate-300 flex flex-col shrink-0 shadow-sm z-20">
                    <div className="p-6 pb-4 space-y-5 shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg">
                                    <FileArchive size={18} className="text-white" />
                                </div>
                                <div>
                                    <h1 className="text-[13px] font-bold text-slate-900 uppercase tracking-tight leading-none">Arxiv Paneli</h1>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-wider">İdarəetmə</p>
                                </div>
                            </div>
                            <button onClick={fetchData} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-50 transition-all">
                                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                            </button>
                        </div>

                        {isManager && (
                            <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                                <button onClick={() => setSideTab("tasks")}
                                    className={cn("flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                                        sideTab === "tasks" ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500")}>
                                    Tapşırıqlar
                                </button>
                                <button onClick={() => setSideTab("stats")}
                                    className={cn("flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                                        sideTab === "stats" ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500")}>
                                    İş Yükü
                                </button>
                            </div>
                        )}

                        {sideTab === "tasks" && (
                            <div className="space-y-4">
                                <div className="relative">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                        placeholder="Müştəri axtar..."
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-[13px] font-bold outline-none focus:bg-white focus:border-slate-500 transition-all placeholder:text-slate-400" />
                                </div>

                                {isManager && (
                                    <div className="flex gap-1.5 overflow-x-auto pb-1.5 custom-scrollbar">
                                        {(["all", "unassigned", "pending", "done"] as const).map(f => {
                                            const labels = { all: "Hamısı", unassigned: "Yeni", pending: "İşlənilir", done: "Tamamlanıb" };
                                            const count = filterStats[f];
                                            return (
                                                <button key={f} onClick={() => setFilter(f)}
                                                    className={cn("h-8 px-3.5 rounded-xl text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border transition-all flex items-center gap-1.5",
                                                        filter === f ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-slate-600 border-slate-300 hover:border-slate-500")}>
                                                    {labels[f]} <span className={cn("text-[9px] font-black", filter === f ? "text-white/60" : "text-slate-400")}>({count})</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2.5 custom-scrollbar">
                        {loading ? (
                            <div className="flex flex-col items-center py-16 opacity-30"><Loader2 className="animate-spin mb-2" size={24} /><p className="text-[11px] font-bold uppercase tracking-widest">Yüklənir</p></div>
                        ) : sideTab === "stats" ? (
                            <div className="space-y-3">
                                {archiverWorkloads.map((a, i) => (
                                    <div key={a.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-300">
                                        <div className="flex items-center gap-3.5 mb-3.5">
                                            <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-[13px] font-bold text-slate-700 border border-slate-300 shadow-sm">
                                                {a.displayName?.[0]?.toUpperCase()}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[12px] font-bold text-slate-900 truncate tracking-tight">{a.displayName}</div>
                                                <div className="text-[10px] text-slate-500 truncate mt-0.5 font-medium">{a.email}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] font-bold uppercase mb-2 px-0.5">
                                            <span className="text-slate-400 tracking-wider">İcra Faizi</span>
                                            <span className="text-slate-900">{a.done} / {a.count}</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden border border-slate-300/30">
                                            <div className="h-full bg-slate-900 transition-all duration-1000 ease-out" style={{ width: a.count > 0 ? `${(a.done / a.count) * 100}%` : '0%' }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : filteredCustomers.map(c => {
                            const isSelected = selectedCustomer?.id === c.id;
                            const invoices = c.details?.invoices?.filter(i => (i as any).archiveRequested || i.archiveUrl) || [];
                            const done = invoices.filter(i => !!i.archiveUrl).length;
                            const total = invoices.length;
                            const isDone = done === total && total > 0;
                            const archiverName = archivers.find(a => a.email === c.archiveAssignedTo)?.displayName;
                            const assignDate = c.archiveAssignedAt ? new Date(c.archiveAssignedAt).toLocaleDateString('az-AZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;

                            return (
                                <button key={c.id} onClick={() => setSelectedCustomer(c)}
                                    className={cn("w-full p-4 rounded-2xl text-left border transition-all group overflow-hidden relative",
                                        isSelected ? "bg-slate-900 border-slate-900 shadow-xl scale-[1.02] z-10" : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-400")}>
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className="min-w-0 flex-1">
                                            <h3 className={cn("text-[13px] font-bold uppercase truncate tracking-tight", isSelected ? "text-white" : "text-slate-900")}>{c.fullName}</h3>
                                            <p className={cn("text-[10px] font-bold mt-1 tracking-wider opacity-60", isSelected ? "text-slate-400" : "text-slate-500")}>#{c.customerCode}</p>
                                        </div>
                                        <div className={cn("text-[10px] font-black px-2 py-1 rounded-lg border", isSelected ? "bg-white/10 text-white border-white/20" : "bg-slate-100 text-slate-600 border-slate-200")}>
                                            {done}/{total}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className={cn("h-1.5 rounded-full overflow-hidden", isSelected ? "bg-white/10" : "bg-slate-100 border border-slate-200/50")}>
                                            <div className={cn("h-full transition-all duration-500", isDone ? "bg-emerald-500" : isSelected ? "bg-white" : "bg-slate-800")} style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }} />
                                        </div>

                                        <div className="flex items-center justify-between">
                                            {c.archiveAssignedTo ? (
                                                <div className={cn("flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-tight", isSelected ? "text-slate-400" : "text-slate-500")}>
                                                    <UserCheck size={10} className="shrink-0" />
                                                    <span className="truncate max-w-[120px]">{archiverName || c.archiveAssignedTo}</span>
                                                    {assignDate && <span className="opacity-80">• {assignDate}</span>}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-[9px] font-black text-rose-500 uppercase tracking-tight">
                                                    <AlertCircle size={10} className="shrink-0" /> Təyinat Yoxdur
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 overflow-y-auto bg-white relative custom-scrollbar">
                    {!selectedCustomer ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-40 text-center p-12">
                            <Box size={50} strokeWidth={1} className="text-slate-400 mb-8" />
                            <h2 className="text-2xl font-bold text-slate-900 uppercase tracking-tight italic">Tapşırıq Seçilməyib</h2>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.3em] mt-3">Məlumatları görmək üçün sol siyahıdan müştəri seçin</p>
                        </div>
                    ) : (
                        <div className="max-w-5xl mx-auto py-12 px-10 animate-in fade-in duration-500">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-12 pb-8 border-b border-slate-200">
                                <div className="flex items-center gap-8">
                                    <div className="h-16 w-16 rounded-[1.25rem] bg-slate-900 flex items-center justify-center text-white shadow-2xl ring-4 ring-slate-50">
                                        <User size={30} />
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-bold text-slate-900 uppercase tracking-tighter leading-none">{selectedCustomer.fullName}</h2>
                                        <div className="flex items-center gap-5 text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-3.5">
                                            <span className="flex items-center gap-2"><FolderOpen size={13} className="text-slate-400" /> {selectedCustomer.customerCode}</span>
                                            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                            <span className="text-slate-800">ARXİV SƏNƏDLƏRİNİN İDARƏEDİLMƏSİ</span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedCustomer(null)} className="h-12 w-12 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all border border-transparent hover:border-rose-100">
                                    <X size={26} />
                                </button>
                            </div>

                            {/* Assignment & Control Section */}
                            {isManager && (
                                <div className="mb-12 p-7 bg-[#F8FAFC] rounded-3xl border border-slate-300 flex items-center justify-between gap-8 shadow-sm">
                                    <div className="flex items-center gap-6 min-w-0">
                                        <div className="h-12 w-12 bg-white rounded-2xl border border-slate-300 flex items-center justify-center text-slate-500 shadow-sm">
                                            <UserCheck size={24} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Məsul Arxivçi</p>
                                            <div className="flex items-center gap-3">
                                                <p className={cn("text-[15px] font-bold uppercase truncate tracking-tight", selectedCustomer.archiveAssignedTo ? "text-slate-900" : "text-rose-500 italic")}>
                                                    {selectedCustomer.archiveAssignedTo ? (archivers.find(a => a.email === selectedCustomer.archiveAssignedTo)?.displayName || selectedCustomer.archiveAssignedTo) : "Hələ təyin edilməyib"}
                                                </p>
                                                {selectedCustomer.archiveAssignedAt && (
                                                    <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200 uppercase">
                                                        {new Date(selectedCustomer.archiveAssignedAt).toLocaleDateString('az-AZ')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative" onKeyDown={handleKeyDown}>
                                        {selectedCustomer.archiveAssignedTo ? (
                                            <button onClick={() => handleAssign("")}
                                                className="h-11 px-7 bg-white text-rose-600 border border-rose-300 rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all shadow-sm flex items-center gap-3 active:scale-95">
                                                <Trash2 size={14} /> Təyinatı Ləğv Et
                                            </button>
                                        ) : (
                                            <>
                                                <button onClick={() => setAssignOpen(!assignOpen)}
                                                    className="h-11 px-8 bg-slate-900 text-white rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-black transition-all shadow-lg flex items-center gap-3 active:scale-95">
                                                    Tapşırıq Ver <ChevronDown size={18} className={cn("transition-transform duration-300", assignOpen && "rotate-180")} />
                                                </button>

                                                {assignOpen && (
                                                    <>
                                                        <div className="fixed inset-0 z-40" onClick={() => setAssignOpen(false)} />
                                                        <div ref={dropdownRef} className="absolute top-full right-0 mt-3 w-72 bg-white border border-slate-300 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-200">
                                                            <div className="relative mb-3">
                                                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                                                <input ref={searchInputRef} type="text" placeholder="Arxivçi axtar..." value={dropdownSearch} onChange={e => { setDropdownSearch(e.target.value); setKeyboardIndex(-1); }}
                                                                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-[12px] font-bold outline-none focus:bg-white focus:border-slate-500 transition-all font-sans" />
                                                            </div>
                                                            <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-1">
                                                                {filteredArchivers.length === 0 ? (
                                                                    <div className="py-6 text-center text-[11px] text-slate-400 font-bold uppercase italic tracking-widest">Nəticə tapılmadı</div>
                                                                ) : filteredArchivers.map((a, i) => (
                                                                    <button key={a.id} onClick={() => handleAssign(a.email)} onMouseEnter={() => setKeyboardIndex(i)}
                                                                        className={cn("w-full p-3 rounded-xl flex items-center gap-4 text-left transition-all", keyboardIndex === i ? "bg-slate-900" : "hover:bg-slate-50")}>
                                                                        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center text-[12px] font-black shrink-0 border transition-colors", keyboardIndex === i ? "bg-white/10 text-white border-white/20" : "bg-white text-slate-700 border-slate-200")}>
                                                                            {a.displayName?.[0]}
                                                                        </div>
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className={cn("text-[12px] font-bold truncate tracking-tight", keyboardIndex === i ? "text-white" : "text-slate-900")}>{a.displayName}</p>
                                                                            <p className={cn("text-[10px] truncate font-medium", keyboardIndex === i ? "text-slate-400" : "text-slate-400")}>{a.email}</p>
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Section Title */}
                            <div className="flex items-center gap-5 mb-8">
                                <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.4em] italic shrink-0">Fakturalar Və Sənəd Arxivləri</h3>
                                <div className="flex-1 h-[1px] bg-slate-200" />
                            </div>

                            {/* Invoices List */}
                            <div className="space-y-6">
                                {(selectedCustomer.details?.invoices || [])
                                    .filter(inv => (inv as any).archiveRequested || inv.archiveUrl)
                                    .map((inv, idx) => {
                                        const isUploaded = !!inv.archiveUrl;
                                        const isMyUpload = uploadingId === inv.id;

                                        return (
                                            <div key={inv.id} className={cn(
                                                "p-8 rounded-[2rem] border transition-all relative group shadow-sm",
                                                isUploaded ? "bg-emerald-50/5 border-emerald-500/30" : "bg-white border-slate-300 hover:border-slate-500"
                                            )}>
                                                <div className="flex items-center justify-between gap-10">
                                                    <div className="flex items-center gap-8 min-w-0">
                                                        <div className={cn(
                                                            "h-12 w-12 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 transition-all duration-500 border",
                                                            isUploaded ? "bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-200" : "bg-slate-50 text-slate-400 border-slate-200"
                                                        )}>
                                                            {isUploaded ? <Check size={22} strokeWidth={4} /> : idx + 1}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 opacity-60">Faktura İdentifikatoru</div>
                                                            <h4 className="text-xl font-bold text-slate-900 tracking-tight truncate leading-none mb-3">{inv.invoiceNumber || "Faktura qeyd edilməyib"}</h4>
                                                            {inv.orders && inv.orders[0] && (
                                                                <div className="inline-flex items-center gap-3 px-3 py-1.5 bg-slate-100/80 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 uppercase tracking-tight">
                                                                    <Calendar size={12} className="text-slate-400" /> {inv.orders[0].contractDate || "00.00.0000"}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 flex items-center gap-4">
                                                        {isUploaded ? (
                                                            <>
                                                                <a href={inv.archiveUrl} target="_blank"
                                                                    className="h-11 px-6 bg-white text-slate-900 border border-slate-300 rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-sm flex items-center gap-3">
                                                                    Sənədə Bax <ExternalLink size={14} />
                                                                </a>
                                                                {(isManager || selectedCustomer.archiveAssignedTo === user?.email) && (
                                                                    <button onClick={() => handleRemoveFile(inv.id)}
                                                                        className="h-11 w-11 flex items-center justify-center bg-white text-rose-500 border border-rose-200 hover:bg-rose-600 hover:text-white rounded-xl transition-all shadow-sm active:scale-95 group-hover:border-rose-300">
                                                                        <Trash2 size={18} />
                                                                    </button>
                                                                )}
                                                            </>
                                                        ) : (
                                                            (isManager || selectedCustomer.archiveAssignedTo === user?.email) && (
                                                                <label className={cn(
                                                                    "h-11 px-8 bg-slate-900 text-white rounded-xl text-[11px] font-bold uppercase tracking-widest cursor-pointer transition-all shadow-lg hover:bg-black active:scale-95 flex items-center gap-3",
                                                                    isMyUpload && "opacity-50 pointer-events-none"
                                                                )}>
                                                                    {isMyUpload ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                                                                    {isMyUpload ? "Yüklənir..." : "Sənədi Yüklə"}
                                                                    <input type="file" className="hidden" accept=".pdf" disabled={!!uploadingId}
                                                                        onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], inv.id)} />
                                                                </label>
                                                            )
                                                        )}

                                                        {!isUploaded && !isManager && selectedCustomer.archiveAssignedTo !== user?.email && (
                                                            <div className="h-11 px-6 bg-slate-50 text-slate-400 rounded-xl text-[10px] font-bold uppercase border border-slate-300 flex items-center gap-3 italic tracking-wider">
                                                                <Clock size={16} className="opacity-50" /> Yükləmə Gözlənilir
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {isUploaded && (
                                                    <div className="mt-6 pt-5 border-t border-emerald-500/10 flex items-center gap-3 text-[10px] font-bold text-slate-500 italic tracking-tight animate-in slide-in-from-bottom-1 duration-300">
                                                        <FileText size={12} className="text-emerald-500 shrink-0" />
                                                        <span className="truncate max-w-lg">{inv.archiveName}</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AuthGuard>
    );
}
