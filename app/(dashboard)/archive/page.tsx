"use client";

import { useState, useCallback, useEffect, useMemo, memo } from "react";
import {
    Trash2,
    Loader2,
    Search,
    X,
    AlertTriangle,
    Edit2,
    Check,
    User,
    MapPin,
    Box,
    Tag,
    DollarSign,
    UserCircle,
    FileText,
    Smartphone,
    Minus,
    Zap,
    RefreshCw,
    Download,
    UserPlus,
    Users,
    Calendar,
    Upload,
    FileUp,
    Shield,
    ChevronDown,
    Store,
    FolderArchive
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getCustomers, deleteCustomer, updateCustomer, getAllUsers, getStores } from "@/lib/db";
import AuthGuard from "@/components/auth/AuthGuard";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "@/lib/firebase";

/** Internal helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

import { ProcessStatus, STATUS_ORDER, STATUS_LABELS } from "../dashboard/page";

interface CustomerRow {
    id?: string;
    customerCode: string;
    fullName: string;
    debtAmount: string;
    createdAt?: string;
    fullData?: boolean;
    gender?: string;
    process_status?: ProcessStatus;
    assignedTo?: string;
    assignedAt?: string;
    isArchived?: boolean;
    store?: string;
    details?: {
        address?: string;
        actualAddress?: string;
        phone?: string;
        gender?: string;
        passportSeries?: string;
        passportNumber?: string;
        birthDate?: string;
        issueDate?: string;
        authority?: string;
        contractNumber?: string;
        contractDate?: string;
        itemModel?: string;
        paymentPeriod?: string;
        monthlyPayment?: string;
        initialPayment?: string;
        totalPrice?: string;
        paidAmount?: string;
        unpaidAmount?: string;
        fee?: string;
        penalty?: string;
        totalUnpaid?: string;
        fin?: string;
        productDescription?: string;
        phoneCount?: number;
        discountAmount?: string;
        isWarningSent?: boolean;
        warningDate?: string;
        executorName?: string;
        invoices?: Array<{
            id: string;
            invoiceNumber: string;
            archiveUrl?: string;
            archiveBase64?: string;
            archiveName?: string;
            orders: Array<{
                id: string;
                productDescription: string;
                phoneCount: number;
                contractDate: string;
                paymentPeriod: string;
                monthlyPayment: string;
                initialPayment: string;
                totalPrice: string;
            }>;
        }>;
    };
}

const CustomerField = memo(({ label, path, placeholder, className, isFin, isCemi, isSelect, value, onChange, isEditing, maxLength, action }: any) => {
    const handleValueChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        let val = e.target.value;
        const datePaths = ['details.contractDate', 'details.issueDate', 'details.warningDate', 'details.birthDate'];
        if (datePaths.includes(path)) {
            val = val.replace(/\D/g, '').slice(0, 8);
            if (val.length >= 4) val = val.slice(0, 2) + '.' + val.slice(2, 4) + '.' + val.slice(4);
            else if (val.length >= 2) val = val.slice(0, 2) + '.' + val.slice(2);
        }
        if (isFin) val = val.toUpperCase();
        onChange(path, val);
    };

    return (
        <div className={cn("space-y-1.5", className)}>
            <label className="text-[10px] font-semibold text-slate-600 ml-1">{label}</label>
            <div className="flex items-center gap-2">
                {isSelect ? (
                    <select
                        disabled={!isEditing}
                        className={cn("w-full px-3.5 py-2.5 rounded-xl border outline-none text-[13px] transition-all appearance-none", isEditing ? "bg-white border-slate-200 shadow-sm" : "bg-slate-100 border-slate-200")}
                        value={value || ""}
                        onChange={handleValueChange}
                    >
                        <option value="">-</option>
                        <option value="Kişi">Kişi</option>
                        <option value="Qadın">Qadın</option>
                    </select>
                ) : (
                    <input
                        type="text"
                        readOnly={!isEditing}
                        maxLength={maxLength}
                        className={cn("w-full px-3.5 py-2 rounded-xl border outline-none text-[13px] transition-all", isEditing ? "bg-white border-slate-200 focus:border-slate-400 focus:ring-4 focus:ring-slate-100 font-semibold" : "bg-slate-100 border-slate-200 cursor-default")}
                        value={value || ""}
                        onChange={handleValueChange}
                        placeholder={placeholder || (['details.contractDate', 'details.issueDate', 'details.warningDate', 'details.birthDate'].includes(path) ? "GG.AA.İİİİ" : "-")}
                    />
                )}
                {action}
            </div>
        </div>
    );
});
CustomerField.displayName = "CustomerField";

const CustomerCard = memo(({ row, index, totalRows, canUpdate, canDelete, stores, onSave, onDelete }: any) => {
    const router = useRouter();
    const { user } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [localData, setLocalData] = useState<CustomerRow>(JSON.parse(JSON.stringify(row)));
    const [uploading, setUploading] = useState<string | null>(null);

    useEffect(() => {
        if (!isEditing) setLocalData(JSON.parse(JSON.stringify(row)));
    }, [row, isEditing]);

    const handleFieldChange = useCallback((path: string, value: string) => {
        setLocalData(prev => {
            const newData = { ...prev };
            const details = { ...(newData.details || {}) };
            if (path.startsWith('details.')) {
                (details as any)[path.split('.')[1]] = value;
            } else {
                (newData as any)[path] = value;
            }
            newData.details = details;
            return newData;
        });
    }, []);

    const updateInvoice = (invId: string, field: string, value: any) => {
        setLocalData(prev => {
            const invoices = [...(prev.details?.invoices || [])];
            const idx = invoices.findIndex(i => i.id === invId);
            if (idx === -1) return prev;
            invoices[idx] = { ...invoices[idx], [field]: value };
            return { ...prev, details: { ...prev.details, invoices } };
        });
    };

    const handleUpload = async (invId: string, file: File) => {
        if (!file.name.endsWith(".pdf")) {
            toast.error("Yalnız PDF faylları yüklənə bilər");
            return;
        }
        try {
            setUploading(invId);
            const storagePath = `UploadedPDFs/${row.id}/${invId}.pdf`;
            const storageRef = ref(storage, storagePath);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            const updatedInvoices = [...(localData.details?.invoices || [])];
            const invIdx = updatedInvoices.findIndex(i => i.id === invId);
            if (invIdx !== -1) {
                updatedInvoices[invIdx] = {
                    ...updatedInvoices[invIdx],
                    archiveUrl: downloadURL,
                    archiveName: file.name
                };
            }
            const updatedData = { ...localData, process_status: 'ARCHIVE_UPLOADED' as ProcessStatus, details: { ...localData.details, invoices: updatedInvoices } };
            await onSave(updatedData);
            setLocalData(updatedData);
            toast.success("Sənəd uğurla yükləndi!");
        } catch (err) {
            toast.error("Yükləmə xətası");
        } finally {
            setUploading(null);
        }
    };

    const handleRemoveFile = async (invId: string) => {
        try {
            const inv = localData.details?.invoices?.find(i => i.id === invId);
            if (inv?.archiveUrl) {
                const storageRef = ref(storage, `UploadedPDFs/${row.id}/${invId}.pdf`);
                await deleteObject(storageRef).catch(() => { });
            }
            const updatedInvoices = [...(localData.details?.invoices || [])];
            const invIdx = updatedInvoices.findIndex(i => i.id === invId);
            if (invIdx !== -1) {
                updatedInvoices[invIdx] = { ...updatedInvoices[invIdx], archiveUrl: "", archiveName: "" };
            }
            const updatedData = { ...localData, details: { ...localData.details, invoices: updatedInvoices } };
            await onSave(updatedData);
            setLocalData(updatedData);
            toast.success("Sənəd silindi");
        } catch (err) {
            toast.error("Silmə xətası");
        }
    };

    const handleRestore = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = { ...localData, isArchived: false };
        toast.promise(onSave(updated), {
            loading: 'Bərpa edilir...',
            success: 'Müştəri Dashboard-a qaytarıldı',
            error: 'Xəta baş verdi'
        });
    };

    return (
        <div className="flex items-stretch gap-4 group/row">
            <div className="hidden lg:flex flex-col gap-2 shrink-0 w-[120px] transition-all opacity-90 group-hover/row:opacity-100 cursor-default">
                {row.createdAt && (
                    <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm text-center">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Daxil Edilib</span>
                        <div className="flex flex-col items-center leading-none">
                            <span className="text-[10px] font-black text-slate-700 tracking-tight">
                                {new Date(row.createdAt).toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, '.')}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 mt-1 tracking-tighter">
                                {new Date(row.createdAt).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                        </div>
                    </div>
                )}
                {row.assignedAt && (
                    <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm border-l-slate-400 border-l-[3px] text-center">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Təyinat Edilib</span>
                        <div className="flex flex-col items-center leading-none">
                            <span className="text-[10px] font-black text-slate-700 tracking-tight">
                                {new Date(row.assignedAt).toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, '.')}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 mt-1 tracking-tighter">
                                {new Date(row.assignedAt).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <div className={cn("relative bg-white rounded-xl border transition-all duration-300 overflow-hidden flex-1", isExpanded ? "border-slate-300 shadow-lg ring-1 ring-slate-200" : "border-slate-200 hover:border-slate-400 hover:shadow-md cursor-pointer group")}>
                <div className={cn("flex flex-col transition-all cursor-pointer", isExpanded ? "bg-slate-50/50" : "hover:bg-slate-50/30")} onClick={() => setIsExpanded(!isExpanded)}>
                    <div className="px-6 pt-4 pb-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-5 flex-1 min-w-0">
                            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-[12px] font-black transition-all shrink-0 border", isExpanded ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-600 border-slate-100")}>
                                {index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-[17px] font-black text-slate-900 uppercase tracking-tight leading-none truncate">{row.fullName}</h3>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">KOD: {row.customerCode}</span>
                                    <span className="h-1 w-1 rounded-full bg-slate-200"></span>
                                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">BORC: {row.debtAmount} AZN</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={handleRestore} className="h-9 px-4 flex items-center gap-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all font-bold text-[10px] uppercase tracking-wider border border-emerald-100">
                                <RefreshCw size={14} /> Bərpa Et
                            </button>
                            {canDelete && (
                                <button onClick={(e) => { e.stopPropagation(); onDelete(index); }} className="h-9 w-9 flex items-center justify-center bg-red-50 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-100">
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {isExpanded && (
                    <div className="p-6 border-t border-slate-100 animate-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                            <div className="space-y-4 p-5 bg-slate-50/50 rounded-2xl border border-slate-100">
                                <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-900 uppercase tracking-widest mb-2"><User size={14} /> Şəxsi Məlumatlar</h4>
                                <div className="grid gap-4">
                                    <CustomerField label="FİN" value={row.details?.fin} isEditing={false} />
                                    <CustomerField label="Telefon" value={row.details?.phone} isEditing={false} />
                                </div>
                            </div>
                            <div className="space-y-4 p-5 bg-slate-50/50 rounded-2xl border border-slate-100">
                                <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-900 uppercase tracking-widest mb-2"><MapPin size={14} /> Ünvan</h4>
                                <div className="grid gap-4">
                                    <CustomerField label="Qeydiyyat" value={row.details?.address} isEditing={false} />
                                    <CustomerField label="Faktiki" value={row.details?.actualAddress} isEditing={false} />
                                </div>
                            </div>
                            <div className="space-y-4 p-5 bg-slate-50/50 rounded-2xl border border-slate-100">
                                <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-900 uppercase tracking-widest mb-2"><Smartphone size={14} /> Status</h4>
                                <div className="flex flex-col gap-3">
                                    <div className={cn(
                                        "px-4 py-3 rounded-xl border font-bold text-[11px] uppercase tracking-wider",
                                        STATUS_LABELS[(row.process_status || 'INSPECTOR_ENTERED') as ProcessStatus].bg,
                                        STATUS_LABELS[(row.process_status || 'INSPECTOR_ENTERED') as ProcessStatus].color
                                    )}>
                                        {STATUS_LABELS[(row.process_status || 'INSPECTOR_ENTERED') as ProcessStatus].label}
                                    </div>
                                    <div className="px-4 py-3 bg-white border border-slate-100 rounded-xl font-bold text-[11px] text-slate-600 uppercase tracking-wider">
                                        Mağaza: {row.store || "-"}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* INVOICES SECTION WITH UPLOAD */}
                        <div className="space-y-4">
                            <h4 className="flex items-center gap-2 text-[11px] font-black text-slate-900 uppercase tracking-[0.15em] mb-4">
                                <Box size={16} /> Faktura və Arxiv Sənədləri
                            </h4>
                            <div className="grid gap-4">
                                {(localData.details?.invoices || []).map((inv: any) => (
                                    <div key={inv.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 font-bold">
                                                    <FileText size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-[14px] font-black text-slate-800">{inv.invoiceNumber || "Nömrəsiz Faktura"}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Faktura Detalları</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {inv.archiveUrl ? (
                                                    <div className="flex items-center gap-2">
                                                        <a href={inv.archiveUrl} target="_blank" className="h-9 px-4 flex items-center gap-2 bg-emerald-50 text-emerald-600 rounded-xl font-bold text-[10px] uppercase border border-emerald-100 hover:bg-emerald-100 transition-all">
                                                            <Download size={14} /> Bax
                                                        </a>
                                                        <button onClick={() => handleRemoveFile(inv.id)} className="h-9 w-9 flex items-center justify-center bg-red-50 text-red-400 rounded-xl border border-red-100 hover:bg-red-500 hover:text-white transition-all">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <label className="h-9 px-4 flex items-center gap-2 bg-blue-50 text-blue-600 rounded-xl font-bold text-[10px] uppercase border border-blue-100 hover:bg-blue-100 cursor-pointer transition-all">
                                                        {uploading === inv.id ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                                                        {uploading === inv.id ? "Yüklənir..." : "Sənəd Yüklə"}
                                                        <input type="file" className="hidden" accept=".pdf" disabled={!!uploading} onChange={(e) => e.target.files?.[0] && handleUpload(inv.id, e.target.files[0])} />
                                                    </label>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-2 pl-14">
                                            {inv.orders?.map((ord: any) => (
                                                <div key={ord.id} className="flex items-center justify-between text-[12px] py-1 border-b border-slate-50 last:border-0 opacity-70">
                                                    <span className="font-semibold text-slate-700">{ord.productDescription}</span>
                                                    <span className="font-bold text-slate-900">{ord.totalPrice} AZN</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});
CustomerCard.displayName = "CustomerCard";

export default function ArchivePage() {
    const { user } = useAuth();
    const [rows, setRows] = useState<CustomerRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; index: number | null }>({ isOpen: false, index: null });
    const [stores, setStores] = useState<any[]>([]);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [custData, storeData] = await Promise.all([
                getCustomers(),
                getStores()
            ]);
            setRows(custData as CustomerRow[]);
            setStores(storeData);
        } catch (e) {
            toast.error("Məlumatlar yüklənmədi");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (data: CustomerRow) => {
        if (!data.id) return;
        await updateCustomer(data.id, data);
        setRows(prev => prev.map(r => r.id === data.id ? data : r));
    };

    const confirmDelete = async () => {
        if (deleteModal.index !== null) {
            const customer = filteredRows[deleteModal.index];
            if (customer.id) {
                await deleteCustomer(customer.id);
                setRows(prev => prev.filter(r => r.id !== customer.id));
                toast.success("Müştəri silindi");
            }
        }
        setDeleteModal({ isOpen: false, index: null });
    };

    const filteredRows = useMemo(() => {
        const lowSearch = searchTerm.toLowerCase();
        return rows.filter(c => {
            if (!c.isArchived) return false;
            return !searchTerm || c.fullName.toLowerCase().includes(lowSearch) || (c.customerCode || "").toLowerCase().includes(lowSearch);
        });
    }, [rows, searchTerm]);

    if (!user || (user.role !== 'SUPERADMIN' && user.role !== 'ARCHIVIST' && user.role !== 'ARCHIVER')) {
        return (
            <AuthGuard>
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                    <div className="h-20 w-20 rounded-full bg-red-50 flex items-center justify-center mb-6"><AlertTriangle size={32} className="text-red-400" /></div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Giriş Məhdudlaşdırılıb</h2>
                    <p className="text-sm text-slate-500">Yalnız Arxivçi və Admin bu səhifəni görə bilər.</p>
                </div>
            </AuthGuard>
        );
    }

    return (
        <AuthGuard>
            <div className="max-w-[1400px] mx-auto pb-20 px-4">
                <div className="mb-10 pt-4 flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <div className="h-14 w-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-xl shadow-slate-200"><FolderArchive size={28} /></div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Arxivlənmiş Müştərilər</h1>
                            <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Tamamlanmış işlərin idarə edilməsi</p>
                        </div>
                    </div>
                </div>

                <div className="mb-8 relative max-w-2xl">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Arxivdə axtar (Ad, Kod, FİN)..." className="w-full pl-14 pr-6 py-5 bg-white border border-slate-200 rounded-3xl text-sm font-bold text-slate-800 outline-none focus:border-slate-400 focus:ring-8 focus:ring-slate-100 transition-all shadow-sm" />
                </div>

                <div className="space-y-4">
                    {loading ? (
                        <div className="py-20 flex flex-col items-center gap-4"><Loader2 className="animate-spin text-slate-300" size={40} /><p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Arxiv Yüklənir...</p></div>
                    ) : filteredRows.map((row, idx) => (
                        <CustomerCard key={row.id || idx} row={row} index={idx} totalRows={filteredRows.length} canDelete={user.role === 'SUPERADMIN'} stores={[]} onSave={handleSave} onDelete={(idx: number) => setDeleteModal({ isOpen: true, index: idx })} />
                    ))}
                    {!loading && filteredRows.length === 0 && (
                        <div className="py-20 text-center opacity-20"><Search size={60} className="mx-auto mb-4" /><p className="font-black text-2xl uppercase tracking-widest italic">Arxiv Boşdur</p></div>
                    )}
                </div>

                {deleteModal.isOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white rounded-xl p-8 max-w-sm w-full shadow-2xl border border-slate-200 animate-in zoom-in duration-200">
                            <div className="flex flex-col items-center text-center gap-6">
                                <div className="h-16 w-16 bg-red-50 text-red-600 rounded-xl flex items-center justify-center border border-red-100"><Trash2 size={32} /></div>
                                <div><h3 className="text-xl font-black text-slate-800 uppercase">Arxivdən Silinsin?</h3><p className="text-sm text-slate-600 mt-2 font-medium">Bu əməliyyat geri qaytarıla bilməz.</p></div>
                                <div className="flex flex-col w-full gap-3">
                                    <button onClick={confirmDelete} className="w-full bg-red-600 text-white py-4 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all active:scale-95">Silinsin</button>
                                    <button onClick={() => setDeleteModal({ isOpen: false, index: null })} className="w-full bg-slate-50 text-slate-600 py-4 rounded-lg font-black text-[10px] uppercase tracking-widest border border-slate-200 hover:bg-slate-100 transition-all">Ləğv Et</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
