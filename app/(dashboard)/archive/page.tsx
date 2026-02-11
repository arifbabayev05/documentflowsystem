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
    CheckCircle2
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
}

export default function ArchiveDocumentsPage() {
    const { user } = useAuth();
    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    const fetchCustomers = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getCustomers();
            const filtered = (data as CustomerRow[]).filter(c =>
                c.process_status === 'COMPLETED' ||
                c.process_status === 'ARCHIVE_UPLOADED' ||
                (c.details?.invoices && c.details.invoices.some(inv => inv.archiveUrl))
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

    const handleUpload = async (file: File) => {
        if (!selectedCustomer || !selectedInvoiceId) return;
        if (!file.name.endsWith(".pdf")) {
            toast.error("Yalnız PDF faylları yüklənə bilər");
            return;
        }

        try {
            setUploading(true);
            const storagePath = `UploadedPDFs/${selectedCustomer.id}/${selectedInvoiceId}.pdf`;
            const storageRef = ref(storage, storagePath);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            const updatedInvoices = [...(selectedCustomer.details?.invoices || [])];
            const invIdx = updatedInvoices.findIndex(i => i.id === selectedInvoiceId);

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
        return customers.filter(c =>
            c.fullName.toLowerCase().includes(s) ||
            (c.customerCode || "").toLowerCase().includes(s)
        );
    }, [customers, searchTerm]);

    const activeInvoice = useMemo(() => {
        if (!selectedCustomer || !selectedInvoiceId) return null;
        return selectedCustomer.details?.invoices?.find(i => i.id === selectedInvoiceId);
    }, [selectedCustomer, selectedInvoiceId]);

    const uploadedDocuments = useMemo(() => {
        if (!selectedCustomer) return [];
        return (selectedCustomer.details?.invoices || []).filter(inv => inv.archiveUrl);
    }, [selectedCustomer]);

    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ARCHIVIST' && user.role !== 'ARCHIVER')) {
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
                <div className="w-[380px] border-r border-slate-200 bg-white flex flex-col shrink-0 shadow-sm relative z-10">
                    <div className="p-8 pb-4 shrink-0">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] leading-none">Arxiv Portfeli</h2>
                            <div className="h-6 px-2 bg-slate-900 text-white rounded-md flex items-center justify-center text-[10px] font-black">
                                {filteredCustomers.length}
                            </div>
                        </div>
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={18} />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Axtar..."
                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-[14px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all shadow-sm"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 pb-8 space-y-2 scrollbar-thin scrollbar-thumb-slate-300">
                        {loading ? (
                            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-200" size={24} /></div>
                        ) : filteredCustomers.length === 0 ? (
                            <div className="text-center py-20">
                                <SearchX size={32} className="mx-auto text-slate-200 mb-2" />
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Məlumat yoxdur</p>
                            </div>
                        ) : (
                            filteredCustomers.map(c => {
                                const isSelected = selectedCustomer?.id === c.id;
                                const hasFiles = c.details?.invoices?.some(inv => inv.archiveUrl);
                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => {
                                            setSelectedCustomer(c);
                                            setSelectedInvoiceId(null);
                                        }}
                                        className={cn(
                                            "w-full p-5 rounded-2xl text-left transition-all relative border outline-none group",
                                            isSelected
                                                ? "bg-slate-900 border-slate-900 shadow-xl shadow-slate-200"
                                                : "bg-white border-slate-200 hover:border-slate-400"
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="min-w-0 flex-1">
                                                <p className={cn(
                                                    "text-[15px] font-black uppercase leading-tight truncate mb-1",
                                                    isSelected ? "text-white" : "text-slate-900"
                                                )}>
                                                    {c.fullName}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <span className={cn("text-[10px] font-bold", isSelected ? "text-slate-400" : "text-slate-500")}>#{c.customerCode || "---"}</span>
                                                    <div className={cn("w-1 h-1 rounded-full", isSelected ? "bg-slate-700" : "bg-slate-300")} />
                                                    <span className={cn("text-[10px] font-black", isSelected ? "text-white/60" : "text-red-500")}>{c.debtAmount} AZN</span>
                                                </div>
                                            </div>
                                            {hasFiles && (
                                                <div className={cn(
                                                    "h-8 w-8 rounded-xl flex items-center justify-center transition-all",
                                                    isSelected ? "bg-white/10 text-white" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                                                )}>
                                                    <FileArchive size={14} />
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
                <div className="flex-1 overflow-y-auto bg-slate-50/20 scrollbar-thin scrollbar-thumb-slate-300">
                    {!selectedCustomer ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-30">
                            <Box size={60} strokeWidth={1} className="text-slate-300 mb-6" />
                            <p className="font-black text-[14px] uppercase tracking-[0.4em] text-slate-400 italic">Məlumat Portfeli</p>
                        </div>
                    ) : (
                        <div className="max-w-5xl mx-auto py-16 px-10 space-y-12 animate-in fade-in slide-in-from-bottom-3 duration-500">

                            {/* Profile Header */}
                            <div className="bg-white rounded-[2rem] border border-slate-300 p-8 flex items-center justify-between shadow-xl shadow-slate-200/50">
                                <div className="flex items-center gap-8">
                                    <div className="h-20 w-20 rounded-3xl bg-slate-900 flex items-center justify-center text-white shadow-lg">
                                        <User size={36} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-2">
                                            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">{selectedCustomer.fullName}</h2>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2 text-xs font-black text-slate-400 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                                                <span>KOD:</span>
                                                <span className="text-slate-900 font-black">{selectedCustomer.customerCode}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs font-black text-red-500 bg-red-50 px-3 py-1.5 rounded-xl border border-red-200">
                                                <span>BORC:</span>
                                                <span className="text-red-700 font-black">{selectedCustomer.debtAmount} AZN</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setSelectedCustomer(null); setSelectedInvoiceId(null); }}
                                    className="h-12 w-12 flex items-center justify-center bg-slate-50 border border-slate-200 text-slate-400 hover:bg-red-500 hover:text-white rounded-2xl transition-all shadow-sm"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="grid grid-cols-12 gap-10">
                                {/* Invoices List */}
                                <div className="col-span-12 lg:col-span-5 space-y-6">
                                    <div className="flex items-center gap-3 px-2 border-l-4 border-slate-900 py-1">
                                        <CreditCard size={18} className="text-slate-900" />
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none">FAKTURA SEÇİMİ</h3>
                                    </div>
                                    <div className="grid gap-3">
                                        {(selectedCustomer.details?.invoices || []).map((inv, idx) => {
                                            const isSelected = selectedInvoiceId === inv.id;
                                            const isUploaded = !!inv.archiveUrl;
                                            return (
                                                <button
                                                    key={inv.id}
                                                    onClick={() => setSelectedInvoiceId(inv.id)}
                                                    className={cn(
                                                        "w-full px-6 py-8 rounded-3xl border transition-all text-left relative group outline-none",
                                                        isSelected
                                                            ? "bg-slate-900 border-slate-900 shadow-2xl shadow-slate-400 text-white"
                                                            : "bg-white border-slate-300 hover:border-slate-900 shadow-sm"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className={cn(
                                                            "text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg",
                                                            isSelected ? "bg-white/10 text-white" : "bg-slate-100 text-slate-500"
                                                        )}>
                                                            Faktura #{idx + 1}
                                                        </span>
                                                        {isUploaded && (
                                                            <CheckCircle2 size={18} className={isSelected ? "text-emerald-400" : "text-emerald-600"} />
                                                        )}
                                                    </div>
                                                    <p className={cn(
                                                        "text-[20px] font-black uppercase tracking-tighter leading-tight truncate",
                                                        isSelected ? "text-white" : "text-slate-900"
                                                    )}>
                                                        {inv.invoiceNumber || "Faktura..."}
                                                    </p>
                                                    {!isUploaded && isSelected && (
                                                        <p className="text-[10px] font-bold text-white/40 uppercase mt-2 tracking-widest">Seçilib</p>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Upload & Status */}
                                <div className="col-span-12 lg:col-span-7 space-y-8">
                                    {!selectedInvoiceId ? (
                                        <div className="h-full min-h-[400px] border border-slate-300 rounded-[2.5rem] flex flex-col items-center justify-center text-slate-300 bg-white shadow-inner">
                                            <FileUp size={48} strokeWidth={1} className="mb-4 opacity-50" />
                                            <p className="text-sm font-black uppercase tracking-widest opacity-50">Sənəd İdarəsi Üçün Faktura Seçin</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                                            {/* Upload Zone */}
                                            <div className="bg-white border-2 border-slate-900 shadow-2xl shadow-slate-200 rounded-[3rem] p-12 flex flex-col items-center text-center relative overflow-hidden">
                                                <div className="h-24 w-24 bg-slate-50 rounded-full flex items-center justify-center text-slate-900 mb-8 border border-slate-200">
                                                    {uploading ? <Loader2 size={40} className="animate-spin" /> : <FileUp size={40} />}
                                                </div>
                                                <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">{activeInvoice?.invoiceNumber}</h4>
                                                <p className="text-sm font-bold text-slate-400 mb-10 max-w-[280px]">Faktura üçün PDF arxiv sənədini təmin edin</p>

                                                <label className="w-full h-20 bg-slate-900 text-white rounded-[1.5rem] flex items-center justify-center gap-4 text-[13px] font-black uppercase tracking-[0.25em] cursor-pointer hover:bg-slate-800 transition-all shadow-xl shadow-slate-300 active:scale-95">
                                                    {uploading ? "Hazırlanır..." : "Sənəd Seçin"}
                                                    {!uploading && <ArrowRight size={20} />}
                                                    <input
                                                        type="file"
                                                        className="hidden"
                                                        accept=".pdf"
                                                        disabled={uploading}
                                                        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                                                    />
                                                </label>
                                            </div>

                                            {/* Files associated with this invoice */}
                                            {activeInvoice?.archiveUrl && (
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-2 px-4 py-1 border-l-4 border-emerald-500">
                                                        <h3 className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.2em]">YÜKLƏNMİŞ ARXIV SƏNƏDİ</h3>
                                                    </div>
                                                    <div className="bg-white border border-slate-300 p-6 rounded-3xl flex items-center justify-between group shadow-lg shadow-slate-100">
                                                        <div className="flex items-center gap-5">
                                                            <div className="h-14 w-14 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center border border-emerald-100 shadow-sm transition-transform group-hover:scale-105">
                                                                <FileText size={24} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-base font-black text-slate-900 truncate max-w-[200px] uppercase tracking-tighter">{activeInvoice.archiveName || "PDF Sənəd"}</p>
                                                                <p className="text-[10px] text-emerald-600 font-black uppercase mt-1 tracking-widest">Sistemdə Mövcuddur</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <a
                                                                href={activeInvoice.archiveUrl}
                                                                target="_blank"
                                                                className="h-12 px-8 flex items-center justify-center bg-slate-100 text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all border border-slate-200 shadow-sm"
                                                            >
                                                                Bax <ExternalLink size={14} className="ml-3 opacity-40 group-hover:opacity-100" />
                                                            </a>
                                                            <button
                                                                onClick={() => handleRemoveFile(selectedCustomer, activeInvoice.id)}
                                                                className="h-12 w-12 flex items-center justify-center text-red-500 bg-red-50 hover:bg-red-500 hover:text-white rounded-2xl transition-all border border-red-100 shadow-sm"
                                                            >
                                                                <Trash2 size={20} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AuthGuard>
    );
}
