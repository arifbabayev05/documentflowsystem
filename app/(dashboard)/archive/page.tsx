"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
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
    ArrowRight,
    FileArchive,
    SearchX,
    CreditCard,
    ChevronRight,
    ExternalLink,
    CheckCircle2,
    Calendar
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getCustomers, updateCustomer } from "@/lib/db";
import AuthGuard from "@/components/auth/AuthGuard";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { ProcessStatus } from "../dashboard/page";

/** Internal helper for conditional classes */
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
    details?: {
        invoices?: Invoice[];
    };
    updatedAt?: any;
    statusHistory?: any[];
}

export default function ArchiveDocumentsPage() {
    const { user, can } = useAuth();
    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');

    const fetchCustomers = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getCustomers();
            const filtered = (data as CustomerRow[]).filter(c =>
                c.process_status === 'COMPLETED' ||
                c.process_status === 'ARCHIVE_UPLOADED' ||
                c.process_status === 'WAITING_FOR_ARCHIVE' ||
                (c.details?.invoices && c.details.invoices.some(inv => inv.archiveUrl || (inv as any).archiveRequested))
            );
            setCustomers(filtered);
        } catch (e) {
            toast.error("Məlumatlar yüklənmədi");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCustomers();
    }, [fetchCustomers]);

    const handleUpload = async (file: File, invoiceId: string) => {
        if (!selectedCustomer) return;
        if (!file.name.endsWith(".pdf")) {
            toast.error("Yalnız PDF faylları yüklənə bilər");
            return;
        }

        try {
            setUploading(true);
            setSelectedInvoiceId(invoiceId);
            const storagePath = `UploadedPDFs/${selectedCustomer.id}/${invoiceId}.pdf`;
            const storageRef = ref(storage, storagePath);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            const updatedInvoices = [...(selectedCustomer.details?.invoices || [])];
            const invIdx = updatedInvoices.findIndex(i => i.id === invoiceId);

            if (invIdx !== -1) {
                updatedInvoices[invIdx] = {
                    ...updatedInvoices[invIdx],
                    archiveUrl: downloadURL,
                    archiveName: file.name
                };
            }

            const updatedCustomer = {
                ...selectedCustomer,
                process_status: 'ARCHIVE_UPLOADED' as ProcessStatus,
                details: { ...selectedCustomer.details, invoices: updatedInvoices }
            };

            await updateCustomer(selectedCustomer.id, updatedCustomer, user?.email || "system");

            setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? updatedCustomer : c));
            setSelectedCustomer(updatedCustomer);
            toast.success("Sənəd yükləndi");
        } catch (err) {
            toast.error("Xəta baş verdi");
        } finally {
            setUploading(false);
            setSelectedInvoiceId(null);
        }
    };

    const handleRemoveFile = async (customer: CustomerRow, invoiceId: string) => {
        try {
            const storageRef = ref(storage, `UploadedPDFs/${customer.id}/${invoiceId}.pdf`);
            await deleteObject(storageRef).catch(() => { });

            const updatedInvoices = [...(customer.details?.invoices || [])];
            const invIdx = updatedInvoices.findIndex(i => i.id === invoiceId);

            if (invIdx !== -1) {
                updatedInvoices[invIdx] = {
                    ...updatedInvoices[invIdx],
                    archiveUrl: "",
                    archiveName: ""
                };
            }

            const updatedCustomer = {
                ...customer,
                details: { ...customer.details, invoices: updatedInvoices }
            };

            await updateCustomer(customer.id, updatedCustomer, user?.email || "system");
            setCustomers(prev => prev.map(c => c.id === customer.id ? updatedCustomer : c));
            if (selectedCustomer?.id === customer.id) {
                setSelectedCustomer(updatedCustomer);
            }
            toast.success("Sənəd silindi");
        } catch (err) {
            toast.error("Xəta baş verdi");
        }
    };

    const filteredCustomers = useMemo(() => {
        const s = searchTerm.toLowerCase();
        return customers
            .filter(c => {
                const relevantInvoices = c.details?.invoices?.filter(inv => (inv as any).archiveRequested || inv.archiveUrl) || [];
                if (relevantInvoices.length === 0) return false;

                const allUploaded = relevantInvoices.every(inv => !!inv.archiveUrl);

                if (activeTab === 'pending') return !allUploaded;
                return allUploaded;
            })
            .filter(c =>
                c.fullName.toLowerCase().includes(s) ||
                (c.customerCode || "").toLowerCase().includes(s)
            );
    }, [customers, searchTerm, activeTab]);

    const formatDateTime = (dateVal: any) => {
        if (!dateVal) return "---";
        const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
        return d.toLocaleString('az-AZ', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).replace(/\//g, '.');
    };

    const getRequestInfo = (c: CustomerRow) => {
        const lastRequest = [...(c.statusHistory || [])].reverse().find(h => h.action === 'ARCHIVE_REQUEST' || h.action === 'STATUS_CHANGE' && h.label.includes('Arxiv'));
        if (lastRequest?.timestamp) return formatDateTime(lastRequest.timestamp);
        return formatDateTime(c.updatedAt);
    };

    if (!user || (!can('page_archiver') && user.role !== 'SUPERADMIN')) {
        return (
            <AuthGuard>
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                    <div className="h-16 w-16 rounded-3xl bg-red-50 flex items-center justify-center mb-6">
                        <FileArchive size={32} className="text-red-400" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Giriş Məhdudlaşdırılıb</h2>
                </div>
            </AuthGuard>
        );
    }

    return (
        <AuthGuard>
            <div className="flex bg-[#fcfdfe] h-[calc(100vh-64px)] overflow-hidden">

                {/* ═══ SİDEBAR ═══ */}
                <div className="w-[340px] border-r border-slate-200 bg-white flex flex-col shrink-0 relative z-10 transition-all">
                    <div className="p-6 pb-4 shrink-0">

                        {/* Tabs Navigation */}
                        <div className="flex p-1 bg-slate-100 rounded-2xl mb-6">
                            <button
                                onClick={() => { setActiveTab('pending'); setSelectedCustomer(null); }}
                                className={cn(
                                    "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                                    activeTab === 'pending' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                Gözləmədə
                            </button>
                            <button
                                onClick={() => { setActiveTab('completed'); setSelectedCustomer(null); }}
                                className={cn(
                                    "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                                    activeTab === 'completed' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                Tamamlandı
                            </button>
                        </div>

                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                                {activeTab === 'pending' ? 'Gözləyən İşlər' : 'Yüklənmiş Sənədlər'}
                            </h2>
                            <div className="h-5 px-2 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center text-[9px] font-black border border-slate-200">
                                {filteredCustomers.length}
                            </div>
                        </div>

                        <div className="relative group mb-2">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={16} />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Axtar..."
                                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-400 transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-1 scrollbar-thin scrollbar-thumb-slate-200">
                        {loading ? (
                            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-300" size={24} /></div>
                        ) : filteredCustomers.length === 0 ? (
                            <div className="text-center py-20 opacity-40">
                                <SearchX size={24} className="mx-auto text-slate-300 mb-2" />
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Nəticə yoxdur</p>
                            </div>
                        ) : (
                            filteredCustomers.map(c => {
                                const isSelected = selectedCustomer?.id === c.id;
                                const relevantInvoices = c.details?.invoices?.filter(inv => (inv as any).archiveRequested || inv.archiveUrl) || [];
                                const isFullyUploaded = relevantInvoices.length > 0 && relevantInvoices.every(inv => !!inv.archiveUrl);

                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => {
                                            setSelectedCustomer(c);
                                            setSelectedInvoiceId(null);
                                        }}
                                        className={cn(
                                            "w-full p-4 rounded-xl text-left transition-all relative group outline-none border",
                                            isSelected
                                                ? "bg-slate-900 border-slate-900 shadow-lg shadow-slate-200"
                                                : "bg-white border-slate-400 hover:bg-slate-50"
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className={cn(
                                                    "text-[13px] font-black uppercase leading-tight truncate mb-0.5",
                                                    isSelected ? "text-white" : "text-slate-900 group-hover:text-primary"
                                                )}>
                                                    {c.fullName}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <span className={cn("text-[9px] font-bold tracking-wider", isSelected ? "text-slate-500" : "text-slate-400")}>#{c.customerCode || "---"}</span>
                                                    <div className={cn("w-0.5 h-0.5 rounded-full", isSelected ? "bg-slate-700" : "bg-slate-300")} />
                                                    <span className={cn("text-[9px] font-black tracking-wider uppercase", isSelected ? "text-white/40" : "text-red-600/70")}>{getRequestInfo(c)}</span>
                                                </div>
                                            </div>
                                            {isFullyUploaded && (
                                                <div className={cn(
                                                    "h-7 w-7 rounded-lg flex items-center justify-center transition-all",
                                                    isSelected ? "bg-white/10 text-white" : "bg-emerald-50 text-emerald-600"
                                                )}>
                                                    <FileArchive size={12} />
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ═══ WORKSPACE ═══ */}
                <div className="flex-1 overflow-y-auto bg-white scrollbar-thin scrollbar-thumb-slate-200">
                    {!selectedCustomer ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-20">
                            <Box size={48} strokeWidth={1.5} className="text-slate-400 mb-4" />
                            <p className="text-[10px] font-black tracking-[0.5em] text-slate-500 uppercase italic">Müştəri Seçin</p>
                        </div>
                    ) : (
                        <div className="max-w-[1000px] mx-auto py-12 px-8 animate-in fade-in duration-500">

                            {/* Simple Header */}
                            <div className="flex items-center justify-between mb-12 border-b border-slate-100 pb-8">
                                <div className="flex items-center gap-6">
                                    <div className="h-16 w-16 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-xl shadow-slate-200">
                                        <User size={28} />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2 leading-none">{selectedCustomer.fullName}</h2>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[12px] font-black text-slate-700 uppercase tracking-[0.2em]">Müştəri Kodu: {selectedCustomer.customerCode}</span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedCustomer(null)}
                                    className="h-10 w-10 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Invoices: The Single Column Stream */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em]">Fakturalar Və Sənədlər</h3>
                                </div>

                                {(selectedCustomer.details?.invoices || [])
                                    .filter(inv => (inv as any).archiveRequested || inv.archiveUrl)
                                    .map((inv, idx) => {
                                        const isUploaded = !!inv.archiveUrl;
                                        const isCurrentUploading = uploading && selectedInvoiceId === inv.id;

                                        return (
                                            <div key={inv.id} className={cn(
                                                "bg-white rounded-3xl border p-6 transition-all relative overflow-hidden group",
                                                isUploaded ? "border-slate-200" : "border-slate-900 shadow-xl shadow-slate-100"
                                            )}>
                                                <div className="flex items-center justify-between gap-8">
                                                    <div className="flex items-center gap-5 min-w-0">
                                                        <div className={cn(
                                                            "h-12 w-12 rounded-xl flex items-center justify-center font-black text-xs shrink-0 transition-colors",
                                                            isUploaded ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-900 text-white"
                                                        )}>
                                                            {isUploaded ? <CheckCircle2 size={20} /> : idx + 1}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 leading-none">Faktura №</p>
                                                            <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight truncate mb-3 leading-none">
                                                                {inv.invoiceNumber || "---"}
                                                            </h4>
                                                            {inv.orders && inv.orders.length > 0 && (
                                                                <div className="flex items-center gap-2">
                                                                    <div className="flex items-center gap-2.5 bg-slate-100 text-slate-600 px-3.5 py-1.5 rounded-xl border border-slate-200/60 shadow-sm">
                                                                        <Calendar size={14} className="text-slate-400" />
                                                                        <span className="text-[11px] font-black uppercase tracking-wider">
                                                                            Müqavilə: {inv.orders[0].contractDate || "---"}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3 shrink-0">
                                                        {isUploaded ? (
                                                            <>
                                                                <a
                                                                    href={inv.archiveUrl}
                                                                    target="_blank"
                                                                    className="h-11 px-6 flex items-center gap-2.5 bg-slate-50 text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-900 hover:text-white transition-all border border-slate-200"
                                                                >
                                                                    Sənədə Bax <ExternalLink size={14} className="opacity-40" />
                                                                </a>
                                                                <button
                                                                    onClick={() => handleRemoveFile(selectedCustomer, inv.id)}
                                                                    className="h-11 w-11 flex items-center justify-center text-red-400 bg-white border border-slate-200 hover:bg-red-500 hover:text-white rounded-xl transition-all"
                                                                    title="Sənədi Sil"
                                                                >
                                                                    <Trash2 size={18} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <label className={cn(
                                                                "h-11 px-8 flex items-center gap-3 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all shadow-md group-hover:scale-[1.02] active:scale-95",
                                                                isCurrentUploading ? "bg-slate-200 text-slate-500 pointer-events-none" : "bg-slate-900 text-white hover:bg-black"
                                                            )}>
                                                                {isCurrentUploading ? (
                                                                    <Loader2 size={14} className="animate-spin" />
                                                                ) : (
                                                                    <>Sənəd Yüklə <FileUp size={14} /></>
                                                                )}
                                                                <input
                                                                    type="file"
                                                                    className="hidden"
                                                                    accept=".pdf"
                                                                    disabled={uploading}
                                                                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], inv.id)}
                                                                />
                                                            </label>
                                                        )}
                                                    </div>
                                                </div>

                                                {isUploaded && (
                                                    <div className="mt-4 pt-4 border-t border-slate-50 flex items-center gap-2">
                                                        <FileText size={12} className="text-slate-300" />
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate max-w-[400px]">
                                                            {inv.archiveName}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                {selectedCustomer.details?.invoices?.length === 0 && (
                                    <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">Heç bir faktura tapılmadı</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AuthGuard>
    );
}
