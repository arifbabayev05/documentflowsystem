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
    UserPlus,
    Store,
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
    store?: string;
}

export default function ArchiveDocumentsPage() {
    const { user, can } = useAuth();
    const isManager = user?.role === "ARCHIVE_MANAGER" || user?.role === "SUPERADMIN" || can("page_archive_manager");

    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [archivers, setArchivers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
    const [uploadingId, setUploadingId] = useState<string | null>(null);
    const [sideTab, setSideTab] = useState<"tasks" | "stats">("tasks");
    const [filter, setFilter] = useState<"all" | "pending" | "done" | "unassigned">("all");

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [assignOpen, setAssignOpen] = useState(false);
    const [quickAssignId, setQuickAssignId] = useState<string | null>(null);
    const [dropdownSearch, setDropdownSearch] = useState("");
    const [keyboardIndex, setKeyboardIndex] = useState(-1);
    const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const bulkDropdownRef = useRef<HTMLDivElement>(null);
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
        if (assignOpen || quickAssignId || bulkAssignOpen) {
            setDropdownSearch("");
            setKeyboardIndex(-1);
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [assignOpen, quickAssignId, bulkAssignOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (quickAssignId && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setQuickAssignId(null);
            }
            if (bulkAssignOpen && bulkDropdownRef.current && !bulkDropdownRef.current.contains(event.target as Node)) {
                setBulkAssignOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [quickAssignId, bulkAssignOpen]);

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

    const handleAssign = async (archiverEmail: string, targetId?: string) => {
        const idsToUpdate = targetId ? [targetId] : (selectedIds.length > 0 ? selectedIds : (selectedCustomer ? [selectedCustomer.id] : []));
        if (idsToUpdate.length === 0) return;

        try {
            const assignAt = archiverEmail ? new Date().toISOString() : "";
            const archiverToSet = archiverEmail || "";

            const updates = idsToUpdate.map(async (cid) => {
                const customerToUpdate = customers.find(c => c.id === cid);
                if (!customerToUpdate) return;
                const updated = {
                    ...customerToUpdate,
                    archiveAssignedTo: archiverToSet,
                    archiveAssignedAt: assignAt
                };
                return updateCustomer(cid, updated, user?.email || "system");
            });

            await Promise.all(updates);

            setCustomers(prev => prev.map(c => {
                if (idsToUpdate.includes(c.id)) {
                    return { ...c, archiveAssignedTo: archiverToSet, archiveAssignedAt: assignAt };
                }
                return c;
            }));

            if (selectedCustomer && idsToUpdate.includes(selectedCustomer.id)) {
                setSelectedCustomer({ ...selectedCustomer, archiveAssignedTo: archiverToSet, archiveAssignedAt: assignAt });
            }

            setAssignOpen(false);
            setQuickAssignId(null);
            setBulkAssignOpen(false);
            setSelectedIds([]);
            toast.success(archiverEmail ? `${idsToUpdate.length} tapşırıq təyin edildi` : "Təyinatlar ləğv edildi");
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

    const myStats = useMemo(() => {
        if (!user) return { count: 0, done: 0 };
        const assigned = customers.filter(c => c.archiveAssignedTo === user.email);
        const completed = assigned.filter(c => isCustomerDone(c));
        return { count: assigned.length, done: completed.length };
    }, [customers, user]);

    const filteredArchivers = useMemo(() => {
        const s = dropdownSearch.toLowerCase();
        return archivers.filter(a => a.displayName?.toLowerCase().includes(s) || a.email?.toLowerCase().includes(s));
    }, [archivers, dropdownSearch]);

    const handleKeyDown = (e: React.KeyboardEvent, targetId?: string) => {
        if (!quickAssignId && !bulkAssignOpen && !assignOpen) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setKeyboardIndex(prev => (prev < filteredArchivers.length - 1 ? prev + 1 : prev));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setKeyboardIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === "Enter" && keyboardIndex >= 0) {
            e.preventDefault();
            handleAssign(filteredArchivers[keyboardIndex].email, targetId);
        } else if (e.key === "Escape") {
            setQuickAssignId(null);
            setBulkAssignOpen(false);
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
                <div className="w-[520px] bg-white border-r border-slate-300 flex flex-col shrink-0 shadow-sm z-20">
                    <div className="p-6 pb-4 space-y-5 shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg">
                                    <FileArchive size={18} className="text-white" />
                                </div>
                                <div>
                                    <h1 className="text-[14px] font-bold text-slate-800 tracking-tight leading-none">Arxiv Paneli</h1>
                                    <p className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-wider">İdarəetmə Paneli</p>
                                </div>
                            </div>
                            <button onClick={fetchData} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-50 transition-all">
                                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                            </button>
                        </div>

                        {isManager ? (
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
                        ) : (
                            <div className="p-4 bg-slate-950 rounded-2xl border border-white/10 shadow-xl overflow-hidden relative group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                    <FileArchive size={60} />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Sənədlər</span>
                                        </div>
                                        <span className="text-[14px] font-black text-white">{myStats.done} <span className="text-white/30">/</span> {myStats.count}</span>
                                    </div>
                                    <div className="flex items-end justify-between mb-2">
                                        <div className="text-[18px] font-bold text-white tracking-tight">
                                            {myStats.count > 0 ? Math.round((myStats.done / myStats.count) * 100) : 0}% <span className="text-[10px] text-white/40 font-black uppercase ml-1">Tamamlanıb</span>
                                        </div>
                                    </div>
                                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-500 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                            style={{ width: myStats.count > 0 ? `${(myStats.done / myStats.count) * 100}%` : '0%' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {sideTab === "tasks" && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                            placeholder="Müştəri və ya kod üzrə axtar..."
                                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium outline-none focus:bg-white focus:border-slate-400 transition-all placeholder:text-slate-400/70" />
                                    </div>
                                    {isManager && (
                                        <button
                                            onClick={() => {
                                                if (selectedIds.length === filteredCustomers.length) setSelectedIds([]);
                                                else setSelectedIds(filteredCustomers.map(c => c.id));
                                            }}
                                            className={cn("h-10 px-3 rounded-xl border flex items-center justify-center transition-all",
                                                selectedIds.length > 0 && selectedIds.length === filteredCustomers.length ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-300 text-slate-500 hover:border-slate-500")}
                                            title="Hamısını Seç"
                                        >
                                            <CheckCircle2 size={18} className={selectedIds.length > 0 ? "opacity-100" : "opacity-30"} />
                                        </button>
                                    )}
                                </div>

                                {isManager && (
                                    <div className="flex gap-1.5 overflow-x-auto pb-1.5 custom-scrollbar">
                                        {(["all", "unassigned", "pending", "done"] as const).map(f => {
                                            const labels = { all: "Hamısı", unassigned: "Yeni", pending: "İşlənilir", done: "Tamamlanıb" };
                                            const count = filterStats[f];
                                            return (
                                                <button key={f} onClick={() => setFilter(f)}
                                                    className={cn("h-8 px-4 rounded-xl text-[11px] font-semibold transition-all flex items-center gap-2 border",
                                                        filter === f ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400")}>
                                                    {labels[f]} <span className={cn("text-[10px] font-bold", filter === f ? "text-white/60" : "text-slate-400")}>{count}</span>
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

                            const isSelectedInList = selectedIds.includes(c.id);

                            return (
                                <div key={c.id} className="flex items-center gap-2 group/card">
                                    {isManager && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]);
                                            }}
                                            className={cn("h-6 w-6 rounded-md border flex items-center justify-center transition-all shrink-0",
                                                isSelectedInList ? "bg-slate-900 border-slate-900 text-white shadow-sm" : "bg-white border-slate-200 text-transparent hover:border-slate-400 group-hover/card:text-slate-300")}
                                        >
                                            <Check size={14} strokeWidth={4} />
                                        </button>
                                    )}
                                    <div onClick={() => setSelectedCustomer(c)} role="button" tabIndex={0}
                                        className={cn("flex-1 p-4 rounded-2xl text-left border transition-all relative cursor-pointer outline-none",
                                            isSelected ? "bg-slate-900 border-slate-900 shadow-xl scale-[1.02] z-10" : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-400")}>
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="min-w-0 flex-1">
                                                <h3 className={cn("text-[13px] font-semibold truncate tracking-tight", isSelected ? "text-white" : "text-slate-900")}>{c.fullName}</h3>
                                                <p className={cn("text-[10px] font-medium mt-1 text-slate-400")}>#{c.customerCode}</p>
                                            </div>
                                            <div className={cn("text-[10px] font-bold px-2 py-1 rounded-md border", isSelected ? "bg-white/10 text-white border-white/20" : "bg-slate-50 text-slate-500 border-slate-200")}>
                                                {done}/{total}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div className={cn("h-1.5 rounded-md overflow-hidden", isSelected ? "bg-white/10" : "bg-slate-100 border border-slate-200")}>
                                                <div className={cn("h-full transition-all duration-500", isDone ? "bg-emerald-500" : isSelected ? "bg-white" : "bg-slate-900")} style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }} />
                                            </div>

                                            <div className="flex items-center justify-between group/row relative">
                                                {c.archiveAssignedTo ? (
                                                    <div className={cn("flex items-center gap-2", isSelected ? "text-slate-400" : "text-slate-500")}>
                                                        <UserCheck size={11} className="shrink-0" />
                                                        <span className="text-[10px] font-medium truncate max-w-[140px]">{archiverName || c.archiveAssignedTo}</span>
                                                        {assignDate && <span className="text-[9px] font-medium opacity-70">• {assignDate}</span>}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-500">
                                                        <AlertCircle size={11} className="shrink-0" /> Təyinat yoxdur
                                                    </div>
                                                )}

                                                {isManager && (
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <button onClick={(e) => { e.stopPropagation(); setQuickAssignId(quickAssignId === c.id ? null : c.id); }}
                                                            className={cn("h-8 px-4 rounded-md flex items-center justify-center gap-2 transition-all border text-[10px] font-bold shadow-sm",
                                                                quickAssignId === c.id ? "bg-white text-slate-900 border-white" :
                                                                    isSelected ? "bg-white/10 text-white border-white/20 hover:bg-white/20" : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900 active:scale-95")}>
                                                            {c.archiveAssignedTo ? <UserCheck size={12} /> : <UserPlus size={12} />}
                                                            {c.archiveAssignedTo ? "Dəyiş" : "Təyin Et"}
                                                        </button>
                                                    </div>
                                                )}

                                                {quickAssignId === c.id && (
                                                    <div ref={dropdownRef} className="absolute top-[calc(100%+8px)] right-0 w-64 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-300 ring-1 ring-slate-900/5" onClick={e => e.stopPropagation()}>
                                                        <div className="relative mb-2">
                                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                                                            <input ref={searchInputRef} type="text" placeholder="Arxivçi axtar..." value={dropdownSearch}
                                                                onChange={e => { setDropdownSearch(e.target.value); setKeyboardIndex(-1); }}
                                                                onKeyDown={(e) => handleKeyDown(e, c.id)}
                                                                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-[11px] font-bold outline-none focus:bg-white focus:border-slate-500 transition-all" />
                                                        </div>
                                                        <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-0.5">
                                                            {filteredArchivers.length === 0 ? (
                                                                <div className="py-4 text-center text-[10px] text-slate-400 font-bold uppercase italic">Tapılmadı</div>
                                                            ) : filteredArchivers.map((a, i) => (
                                                                <button key={a.id} onClick={(e) => { e.stopPropagation(); handleAssign(a.email, c.id); }} onMouseEnter={() => setKeyboardIndex(i)}
                                                                    className={cn("w-full p-2 rounded-lg flex items-center gap-3 text-left transition-all", keyboardIndex === i ? "bg-slate-900 shadow-lg" : "hover:bg-slate-50")}>
                                                                    <div className={cn("h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 border", keyboardIndex === i ? "bg-white/10 text-white border-white/20" : "bg-white text-slate-700 border-slate-200")}>
                                                                        {a.displayName?.[0]}
                                                                    </div>
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className={cn("text-[11px] font-bold truncate", keyboardIndex === i ? "text-white" : "text-slate-900")}>{a.displayName}</p>
                                                                        <p className={cn("text-[9px] truncate opacity-50", keyboardIndex === i ? "text-slate-400" : "text-slate-500")}>{a.email}</p>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Bulk Action Bar - Floating Center Pill */}
                    {isManager && selectedIds.length > 0 && (
                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-8 fade-in duration-500 scale-100 hover:scale-[1.02] transition-transform">
                            <div className="bg-slate-900/90 backdrop-blur-2xl text-white rounded-full p-2 pl-7 flex items-center gap-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.4)] border border-white/10">
                                <div className="flex items-center gap-4">
                                    <p className="text-[12px] font-medium text-white/70">{selectedIds.length} müştəri seçilib</p>
                                </div>
                                <div className="flex items-center gap-2 relative">
                                    <button onClick={() => setSelectedIds([])}
                                        className="h-10 px-5 text-[11px] font-semibold text-rose-300 hover:text-rose-200 transition-all hover:bg-white/5 rounded-full">
                                        Seçimi təmizlə
                                    </button>
                                    <div className="h-6 w-px bg-white/10 mx-2" />
                                    <button onClick={(e) => { e.stopPropagation(); setBulkAssignOpen(!bulkAssignOpen); }}
                                        className="h-11 px-8 bg-white text-slate-950 rounded-full text-[11px] font-bold shadow-xl flex items-center gap-3 transition-all active:scale-95 group hover:bg-slate-50">
                                        Toplu Təyin Et <ChevronDown size={16} className={cn("transition-transform duration-300 opacity-60", bulkAssignOpen && "rotate-180")} />
                                    </button>

                                    {bulkAssignOpen && (
                                        <div ref={bulkDropdownRef} className="absolute bottom-full right-0 mb-5 w-80 bg-white border border-slate-200 rounded-[2.5rem] shadow-[0_30px_80px_-15px_rgba(0,0,0,0.5)] p-5 z-50 animate-in fade-in zoom-in-95 duration-300 ring-1 ring-black/5" onClick={e => e.stopPropagation()}>
                                            <div className="relative mb-4">
                                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                                <input ref={searchInputRef} type="text" placeholder="Arxivçi axtar..." value={dropdownSearch}
                                                    onChange={e => { setDropdownSearch(e.target.value); setKeyboardIndex(-1); }}
                                                    onKeyDown={(e) => handleKeyDown(e)}
                                                    className="w-full pl-11 pr-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-[13px] font-bold outline-none focus:bg-white focus:border-slate-500 transition-all text-slate-900 shadow-inner font-sans" />
                                            </div>
                                            <div className="max-h-[350px] overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                                                {filteredArchivers.length === 0 ? (
                                                    <div className="py-10 text-center text-[11px] text-slate-400 font-bold uppercase italic tracking-[0.3em]">Nəticə tapılmadı</div>
                                                ) : filteredArchivers.map((a, i) => (
                                                    <button key={a.id} onClick={() => handleAssign(a.email)} onMouseEnter={() => setKeyboardIndex(i)}
                                                        className={cn("w-full p-4 rounded-[1.25rem] flex items-center gap-4 text-left transition-all", keyboardIndex === i ? "bg-slate-900 shadow-xl" : "hover:bg-slate-50")}>
                                                        <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center text-[14px] font-black shrink-0 border transition-colors", keyboardIndex === i ? "bg-white/10 text-white border-white/20" : "bg-white text-slate-700 border-slate-200 shadow-sm")}>
                                                            {a.displayName?.[0]}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className={cn("text-[14px] font-black truncate tracking-tight", keyboardIndex === i ? "text-white" : "text-slate-900")}>{a.displayName}</p>
                                                            <p className={cn("text-[10px] truncate font-bold uppercase opacity-50", keyboardIndex === i ? "text-slate-400" : "text-slate-500")}>{a.email}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                                                <button onClick={() => handleAssign("")}
                                                    className="flex-1 p-3.5 rounded-2xl border border-rose-100 text-rose-500 hover:bg-rose-50 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                                                    <Trash2 size={14} /> Təyinatları Sil
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
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
                                        <h2 className="text-3xl font-bold text-slate-900 tracking-tight leading-none">{selectedCustomer.fullName}</h2>
                                        <div className="flex items-center gap-5 text-[12px] font-medium text-slate-500 mt-4">
                                            <span className="flex items-center gap-2 font-semibold text-slate-400"><FolderOpen size={14} /> {selectedCustomer.customerCode}</span>
                                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                                            <span className="text-slate-400">Arxiv Paneli</span>
                                            {selectedCustomer.archiveAssignedTo && (
                                                <>
                                                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                                                    <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3.5 py-1.5 rounded-full text-[11px] font-semibold border border-emerald-100 shadow-sm">
                                                        <UserCheck size={12} className="text-emerald-500" />
                                                        Məsul: {archivers.find(a => a.email === selectedCustomer.archiveAssignedTo)?.displayName || selectedCustomer.archiveAssignedTo}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedCustomer(null)} className="h-12 w-12 flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all border border-transparent hover:border-rose-100">
                                    <X size={28} />
                                </button>
                            </div>

                            {/* Section Title */}
                            <div className="flex items-center gap-6 mb-10">
                                <h3 className="text-[13px] font-bold text-slate-900 uppercase tracking-widest shrink-0">Fakturalar Və Sənədlər</h3>
                                <div className="flex-1 h-px bg-slate-200" />
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
                                                "p-8 rounded-[2.5rem] border transition-all relative group shadow-sm",
                                                isUploaded ? "bg-emerald-50/10 border-emerald-500/20 shadow-emerald-100/20" : "bg-white border-slate-200 hover:border-slate-400 shadow-slate-100/10"
                                            )}>
                                                <div className="flex items-center justify-between gap-10">
                                                    <div className="flex items-center gap-10 min-w-0">
                                                        <div className={cn(
                                                            "h-14 w-14 rounded-2xl flex items-center justify-center font-bold text-lg shrink-0 transition-all duration-700 border",
                                                            isUploaded ? "bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-100" : "bg-slate-50 text-slate-400 border-slate-200"
                                                        )}>
                                                            {isUploaded ? <Check size={28} /> : (idx + 1).toString().padStart(2, '0')}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-[11px] font-semibold text-slate-400 tracking-wide mb-1 opacity-70">Faktura nömrəsi</div>
                                                            <h4 className="text-2xl font-semibold text-slate-900 tracking-tight truncate leading-none mb-4">{inv.invoiceNumber || "Faktura qeyd edilməyib"}</h4>
                                                            <div className="flex flex-wrap items-center gap-3">
                                                                {inv.orders && inv.orders[0] && (
                                                                    <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[15px] font-medium text-slate-600 shadow-sm transition-all hover:bg-white hover:border-slate-300">
                                                                        <Calendar size={15} className="text-slate-400" /> {inv.orders[0].contractDate || "00.00.0000"}
                                                                    </div>
                                                                )}
                                                                {selectedCustomer.store && (
                                                                    <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 bg-blue-50/50 border border-blue-100 rounded-xl text-[15px] font-bold text-blue-600 shadow-sm transition-all hover:bg-blue-50 hover:border-blue-200">
                                                                        <Store size={15} className="text-blue-400" /> {selectedCustomer.store} Mağazası
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 flex items-center gap-4">
                                                        {isUploaded ? (
                                                            <>
                                                                <a href={inv.archiveUrl} target="_blank"
                                                                    className="h-12 px-7 bg-white text-slate-900 border border-slate-200 rounded-2xl text-[11px] font-semibold hover:bg-slate-950 hover:text-white hover:border-slate-950 transition-all shadow-sm flex items-center gap-3">
                                                                    Sənədə Bax <ExternalLink size={15} />
                                                                </a>
                                                                {(isManager || selectedCustomer.archiveAssignedTo === user?.email) && (
                                                                    <button onClick={() => handleRemoveFile(inv.id)}
                                                                        className="h-12 w-12 flex items-center justify-center bg-white text-rose-500 border border-rose-100 hover:bg-rose-500 hover:text-white rounded-2xl transition-all shadow-sm active:scale-95 group-hover:border-rose-200">
                                                                        <Trash2 size={18} />
                                                                    </button>
                                                                )}
                                                            </>
                                                        ) : (
                                                            (isManager || selectedCustomer.archiveAssignedTo === user?.email) && (
                                                                <label className={cn(
                                                                    "h-12 px-10 bg-slate-950 text-white rounded-2xl text-[11px] font-bold cursor-pointer transition-all shadow-xl hover:bg-black active:scale-95 flex items-center gap-3.5",
                                                                    isMyUpload && "opacity-50 pointer-events-none"
                                                                )}>
                                                                    {isMyUpload ? <Loader2 size={17} className="animate-spin" /> : <FileUp size={17} />}
                                                                    {isMyUpload ? "Yüklənir..." : "Sənədi Yüklə"}
                                                                    <input type="file" className="hidden" accept=".pdf" disabled={!!uploadingId}
                                                                        onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], inv.id)} />
                                                                </label>
                                                            )
                                                        )}

                                                        {!isUploaded && !isManager && selectedCustomer.archiveAssignedTo !== user?.email && (
                                                            <div className="h-12 px-8 bg-slate-50 text-slate-400 rounded-2xl text-[11px] font-black uppercase border border-slate-200 flex items-center gap-3 italic tracking-widest opacity-80">
                                                                <Clock size={18} className="opacity-50" /> Yükləmə Gözlənilir
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {isUploaded && (
                                                    <div className="mt-8 pt-6 border-t border-emerald-500/10 flex items-center gap-4 text-[11px] font-bold text-slate-500 italic tracking-tight animate-in slide-in-from-bottom-2 duration-500">
                                                        <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                                                        <FileText size={14} className="text-emerald-500 shrink-0" />
                                                        <span className="truncate max-w-2xl">{inv.archiveName}</span>
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
        </AuthGuard >
    );
}
