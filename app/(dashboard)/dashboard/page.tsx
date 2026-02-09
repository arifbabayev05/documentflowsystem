"use client";

import { useState, useCallback, useEffect, useMemo, memo } from "react";
import {
    Plus,
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
    FileText
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getCustomers, bulkAddCustomers, deleteCustomer, updateCustomer } from "@/lib/db";
import AuthGuard from "@/components/auth/AuthGuard";

/** Internal helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

interface CustomerRow {
    id?: string;
    customerCode: string;
    fullName: string;
    debtAmount: string;
    createdAt?: string;
    fullData?: boolean;
    gender?: string;
    details?: {
        address?: string;
        actualAddress?: string;
        phone?: string;
        gender?: string;
        passportSeries?: string;
        passportNumber?: string;
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
    };
}

/** 
 * Isolated Field Component to prevent extensive re-rendering and focus loss 
 */
const CustomerField = memo(({ label, path, placeholder, className, isFin, isCemi, isSelect, value, onChange, isEditing }: any) => {
    // Basic date masking for DD/MM/YYYY
    const handleValueChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        let val = e.target.value;
        if (path === 'details.contractDate') {
            val = val.replace(/\D/g, '').slice(0, 8);
            if (val.length >= 4) val = val.slice(0, 2) + '/' + val.slice(2, 4) + '/' + val.slice(4);
            else if (val.length >= 2) val = val.slice(0, 2) + '/' + val.slice(2);
        }
        onChange(path, val);
    };

    return (
        <div className={cn("space-y-2", className)}>
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] ml-1">
                {label}
            </label>
            {isSelect ? (
                <select
                    disabled={!isEditing}
                    className={cn(
                        "w-full px-5 py-4 rounded-2xl border border-transparent outline-none text-[15px] transition-all appearance-none",
                        isEditing ? "bg-white border-primary/20 text-text-main font-bold shadow-sm" : "bg-bg-main/40 text-text-soft font-semibold"
                    )}
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
                    className={cn(
                        "w-full px-5 py-4 rounded-2xl border border-transparent outline-none text-[15px] transition-all",
                        isEditing
                            ? "bg-white border-primary/20 focus:border-primary focus:ring-4 focus:ring-primary/5 text-text-main font-bold shadow-sm"
                            : "bg-bg-main/40 text-text-soft font-semibold cursor-default",
                        isFin ? "uppercase" : "",
                        isCemi ? "text-primary font-black scale-[1.05] origin-left" : ""
                    )}
                    value={value || ""}
                    onChange={handleValueChange}
                    placeholder={placeholder || (path === 'details.contractDate' ? "GG/AA/İİİİ" : "-")}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && isEditing) {
                            const inputs = Array.from(document.querySelectorAll('input:not([readonly]), select:not([disabled])')) as HTMLElement[];
                            const index = inputs.indexOf(e.currentTarget);
                            if (index > -1 && index < inputs.length - 1) {
                                inputs[index + 1].focus();
                            }
                        }
                    }}
                />
            )}
        </div>
    );
});
CustomerField.displayName = "CustomerField";

/** 
 * CUSTOMER CARD COMPONENT
 */
const CustomerCard = memo(({
    row,
    index,
    totalRows,
    canUpdate,
    canDelete,
    onSave,
    onDelete
}: {
    row: CustomerRow;
    index: number;
    totalRows: number;
    canUpdate: boolean;
    canDelete: boolean;
    onSave: (data: CustomerRow) => Promise<void>;
    onDelete: (index: number) => void;
}) => {
    const router = useRouter();
    // New rows start expanded and editing
    const [isEditing, setIsEditing] = useState(!row.id);
    const [isExpanded, setIsExpanded] = useState(!row.id);
    const [localData, setLocalData] = useState<CustomerRow>(JSON.parse(JSON.stringify(row)));

    useEffect(() => {
        if (!isEditing) {
            setLocalData(JSON.parse(JSON.stringify(row)));
        }
    }, [row, isEditing]);

    const handleFieldChange = useCallback((path: string, value: string) => {
        if (!path) return;
        setLocalData(prev => {
            const newData = { ...prev };
            const details = { ...(newData.details || {}) };
            if (path === 'customerCode') {
                const finVal = value.toUpperCase().slice(0, 7);
                newData.customerCode = finVal;
                details.fin = finVal;
            } else if (path.startsWith('details.')) {
                const detailField = path.split('.')[1];
                (details as any)[detailField] = value;

                const financialFields = ['totalPrice', 'paidAmount', 'fee', 'penalty'];
                if (financialFields.includes(detailField)) {
                    const price = parseFloat(details.totalPrice || "0") || 0;
                    const paid = parseFloat(details.paidAmount || "0") || 0;
                    const fee = parseFloat(details.fee || "0") || 0;
                    const penalty = parseFloat(details.penalty || "0") || 0;
                    const totalUnpaid = (price - paid + fee + penalty).toFixed(2);
                    details.totalUnpaid = totalUnpaid;
                    newData.debtAmount = totalUnpaid;
                } else if (detailField === 'totalUnpaid') {
                    newData.debtAmount = value;
                }
            } else {
                (newData as any)[path] = value;
            }
            newData.details = details;
            return newData;
        });
    }, []);

    const handleSave = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const savePromise = onSave(localData);
        toast.promise(savePromise, {
            loading: 'Yadda saxlanılır...',
            success: 'Məlumatlar güncəlləndi',
            error: 'Xəta baş verdi'
        });
        await savePromise;
        setIsEditing(false);
    };

    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation();
        setLocalData(JSON.parse(JSON.stringify(row)));
        setIsEditing(false);
        if (!row.id) onDelete(index); // If it's a new unsaved row, remove it
    };

    const toggleExpand = () => {
        if (!isEditing) setIsExpanded(!isExpanded);
    };

    const getValue = (path: string) => {
        if (path.startsWith('details.')) {
            return localData.details?.[path.split('.')[1] as keyof typeof localData.details] || "";
        }
        return (localData as any)[path] || "";
    };

    return (
        <div className={cn(
            "relative bg-white rounded-[2rem] border transition-all duration-300 overflow-hidden",
            isExpanded
                ? "border-primary/30 shadow-[0_20px_40px_-12px_rgba(37,99,235,0.08)] ring-1 ring-primary/5"
                : "border-border-soft hover:border-primary/20 hover:shadow-xl cursor-pointer group"
        )} onClick={toggleExpand}>
            {/* HEADER / COMPACT VIEW */}
            <div className={cn(
                "px-10 py-6 flex items-center justify-between transition-colors",
                isExpanded ? "bg-bg-main/5 border-b border-border-soft/50" : "hover:bg-primary/[0.02]"
            )}>
                <div className="flex items-center gap-8 flex-1">
                    <div className={cn(
                        "h-12 w-12 rounded-2xl flex items-center justify-center text-xs font-black transition-all shrink-0",
                        isExpanded ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-bg-main/50 text-text-soft border border-border-soft group-hover:bg-primary/10 group-hover:text-primary group-hover:border-primary/20"
                    )}>
                        {totalRows - index}
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-12 flex-1">
                        <div className="min-w-[300px]">
                            {isEditing ? (
                                <input
                                    autoFocus
                                    value={localData.fullName || ""}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => handleFieldChange("fullName", e.target.value)}
                                    className="bg-transparent border-b-2 border-primary/30 outline-none text-xl font-black text-text-main uppercase tracking-tight w-full"
                                    placeholder="AD SOYAD ATA ADI"
                                />
                            ) : (
                                <h3 className="text-lg font-black text-text-main uppercase tracking-tight leading-none truncate">{row.fullName || "YENİ MÜŞTƏRİ"}</h3>
                            )}
                        </div>

                        <div className="flex items-center gap-8">
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[15px] font-black text-text-soft/100 uppercase tracking-widest">FİN:</span>
                                {isEditing ? (
                                    <input
                                        value={localData.customerCode || ""}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => handleFieldChange("customerCode", e.target.value)}
                                        className="bg-transparent text-xs font-black text-text-main outline-none w-20 uppercase border-b border-primary/20"
                                    />
                                ) : (
                                    <span className="text-sm font-black text-text-black tracking-wider bg-bg-main/50 px-2.5 py-1 rounded-lg border border-border-soft/50">{row.customerCode || "-"}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-12">
                    <div className={cn(
                        "flex flex-col items-end transition-all",
                        isExpanded ? "opacity-100" : "opacity-80 group-hover:opacity-100"
                    )}>
                        <span className="text-[10px] font-black text-text-soft/40 uppercase tracking-[0.2em] mb-1">Qalıq Borc</span>
                        <div className="flex items-baseline gap-1">
                            <span className={cn(
                                "text-2xl font-black tracking-tighter",
                                parseFloat(localData.debtAmount || "0") > 0 ? "text-primary" : "text-green-500"
                            )}>{localData.debtAmount || "0.00"}</span>
                            <span className="text-[10px] font-black text-text-soft/40 uppercase">AZN</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {isEditing ? (
                            <>
                                <button onClick={handleSave} className="h-12 px-6 bg-green-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-green-600 shadow-lg shadow-green-100 transition-all flex items-center gap-2">
                                    <Check size={16} className="stroke-[3px]" />
                                    SAXLA
                                </button>
                                <button onClick={handleCancel} className="h-12 w-12 flex items-center justify-center bg-gray-100 text-text-soft rounded-xl hover:bg-gray-200 transition-all">
                                    <X size={20} />
                                </button>
                            </>
                        ) : (
                            <>
                                {canUpdate && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setIsEditing(true); setIsExpanded(true); }}
                                        className="h-12 w-12 md:w-auto md:px-6 flex items-center justify-center gap-2 bg-primary/5 text-primary rounded-xl hover:bg-primary hover:text-white transition-all font-black text-[10px] uppercase tracking-widest"
                                    >
                                        <Edit2 size={16} />
                                        <span className="hidden md:inline">DÜZƏLİŞ</span>
                                    </button>
                                )}
                                {row.id && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); router.push(`/reports/generate?id=${row.id}`); }}
                                        className="h-12 w-12 md:w-auto md:px-6 flex items-center justify-center gap-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all font-black text-[10px] uppercase tracking-widest shadow-sm shadow-red-100"
                                    >
                                        <FileText size={16} />
                                        <span className="hidden md:inline">SƏNƏD YARAT</span>
                                    </button>
                                )}
                                {canDelete && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDelete(index); }}
                                        className="h-12 w-12 flex items-center justify-center text-text-soft/30 hover:text-red-500 bg-gray-50 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* EXPANDED CONTENT */}
            {isExpanded && (
                <div className="p-10 grid grid-cols-1 md:grid-cols-4 gap-10 animate-in slide-in-from-top-4 duration-300">
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 border-b-2 border-primary/10 pb-4">
                            <div className="h-8 w-8 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                <User size={16} className="stroke-[2.5px]" />
                            </div>
                            <h4 className="text-[12px] font-black text-text-main uppercase tracking-[0.2em]">Şəxsi Məlumatlar</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <CustomerField label="Cins" isSelect={true} path="details.gender" value={getValue("details.gender")} onChange={handleFieldChange} isEditing={isEditing} />
                            <CustomerField label="Seriya" path="details.passportNumber" placeholder="AA..." value={getValue("details.passportNumber")} onChange={handleFieldChange} isEditing={isEditing} />
                        </div>
                        <CustomerField label="Telefon Nömrəsi" path="details.phone" placeholder="+994" value={getValue("details.phone")} onChange={handleFieldChange} isEditing={isEditing} />
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center gap-3 border-b-2 border-primary/10 pb-4">
                            <div className="h-8 w-8 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                <MapPin size={16} className="stroke-[2.5px]" />
                            </div>
                            <h4 className="text-[12px] font-black text-text-main uppercase tracking-[0.2em]">Ünvan Məlumatları</h4>
                        </div>
                        <CustomerField label="Qeydiyyat Ünvanı" path="details.address" placeholder="Şəhər, Rayon..." value={getValue("details.address")} onChange={handleFieldChange} isEditing={isEditing} />
                        <CustomerField label="Faktiki Yaşayış" path="details.actualAddress" placeholder="Küçə, Bina, Mənzil..." value={getValue("details.actualAddress")} onChange={handleFieldChange} isEditing={isEditing} />
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center gap-3 border-b-2 border-primary/10 pb-4">
                            <div className="h-8 w-8 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                <Box size={16} className="stroke-[2.5px]" />
                            </div>
                            <h4 className="text-[12px] font-black text-text-main uppercase tracking-[0.2em]">Sifariş Detalları</h4>
                        </div>
                        <CustomerField label="Əşya Modeli" path="details.itemModel" placeholder="məs: Samsung S24" value={getValue("details.itemModel")} onChange={handleFieldChange} isEditing={isEditing} />
                        <div className="grid grid-cols-2 gap-4">
                            <CustomerField label="Müq. Tarixi" path="details.contractDate" placeholder="00/00/0000" value={getValue("details.contractDate")} onChange={handleFieldChange} isEditing={isEditing} />
                            <CustomerField label="Müddət (Ay)" path="details.paymentPeriod" placeholder="ay" value={getValue("details.paymentPeriod")} onChange={handleFieldChange} isEditing={isEditing} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <CustomerField label="Aylıq Ödəniş" path="details.monthlyPayment" value={getValue("details.monthlyPayment")} onChange={handleFieldChange} isEditing={isEditing} />
                            <CustomerField label="İlkin Ödəniş" path="details.initialPayment" value={getValue("details.initialPayment")} onChange={handleFieldChange} isEditing={isEditing} />
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center gap-3 border-b-2 border-primary/10 pb-4">
                            <div className="h-8 w-8 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                <DollarSign size={16} className="stroke-[2.5px]" />
                            </div>
                            <h4 className="text-[12px] font-black text-text-main uppercase tracking-[0.2em]">Maliyyə Hesabatı</h4>
                        </div>
                        <div className="bg-primary/[0.02] p-6 rounded-3xl border border-primary/10 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <CustomerField label="Cəmi Qiymət" path="details.totalPrice" value={getValue("details.totalPrice")} onChange={handleFieldChange} isEditing={isEditing} />
                                <CustomerField label="Ödənilən" path="details.paidAmount" value={getValue("details.paidAmount")} onChange={handleFieldChange} isEditing={isEditing} />
                            </div>
                            <div className="grid grid-cols-2 gap-4 border-t border-primary/5 pt-4">
                                <CustomerField label="Dövlət Rüsumu" path="details.fee" isCemi={true} value={getValue("details.fee")} onChange={handleFieldChange} isEditing={isEditing} />
                                <CustomerField label="Gecikmə C.." path="details.penalty" isCemi={true} value={getValue("details.penalty")} onChange={handleFieldChange} isEditing={isEditing} />
                            </div>
                            <div className="pt-2">
                                <CustomerField label="Yekun Borc (AZN)" path="details.totalUnpaid" isCemi={true} value={getValue("details.totalUnpaid")} onChange={handleFieldChange} isEditing={isEditing} />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

CustomerCard.displayName = "CustomerCard";

/**
 * DASHBOARD PAGE COMPONENT
 */
export default function DashboardPage() {
    const { user, can } = useAuth();
    const [rows, setRows] = useState<CustomerRow[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    // Filters
    const [searchTerm, setSearchTerm] = useState("");

    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; index: number | null }>({
        isOpen: false,
        index: null
    });

    const fetchCustomers = async (isInitial = false) => {
        if (isInitial) {
            const cached = localStorage.getItem("legal12_customers");
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    setRows(parsed);
                    setLoadingData(false);
                } catch (e) { }
            }
        }

        try {
            const data = await getCustomers() as CustomerRow[];
            const sorted = data.sort((a, b) =>
                new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );

            const mergedRows = sorted.map(row => ({
                ...row,
                customerCode: row.customerCode || row.details?.fin || ""
            }));

            const finalRows = mergedRows.length > 0 ? mergedRows : [{ customerCode: "", fullName: "", debtAmount: "", createdAt: new Date().toISOString() }];

            setRows(finalRows);
            localStorage.setItem("legal12_customers", JSON.stringify(finalRows));
        } catch (err) {
            console.error("Failed to load customers:", err);
            toast.error("Məlumatları yükləmək mümkün olmadı");
        } finally {
            setLoadingData(false);
        }
    };

    useEffect(() => {
        fetchCustomers(true);
    }, []);

    const addRow = () => {
        const newRow: CustomerRow = {
            customerCode: "",
            fullName: "",
            debtAmount: "",
            createdAt: new Date().toISOString(),
            details: {
                fee: "23.6",
                penalty: "0"
            }
        };
        setRows([newRow, ...rows]);
        toast.info("Yeni müştəri kartı əlavə edildi");
    };

    // Memoize handleSave to ensure stable reference for CustomerCard
    const handleSave = useCallback(async (dataToSave: CustomerRow) => {
        try {
            if (dataToSave.id) {
                await updateCustomer(dataToSave.id, {
                    ...dataToSave,
                    fullData: !!(dataToSave.details?.fin && dataToSave.details?.totalUnpaid)
                }, user?.email);
            } else {
                await bulkAddCustomers([dataToSave], user?.email);
            }
            fetchCustomers();
        } catch (error) {
            console.error("Save error:", error);
            throw error;
        }
    }, [user?.email]);

    const onDelete = useCallback((index: number) => {
        setDeleteModal({ isOpen: true, index });
    }, []);

    const confirmDelete = async () => {
        if (deleteModal.index !== null) {
            const index = deleteModal.index;
            const rowToDelete = rows[index];

            try {
                if (rowToDelete.id) {
                    await deleteCustomer(rowToDelete.id, user?.email);
                }

                if (rows.length > 1) {
                    setRows(rows.filter((_, i) => i !== index));
                    toast.error("Məlumat silindi");
                } else {
                    setRows([{ customerCode: "", fullName: "", debtAmount: "", createdAt: new Date().toISOString() }]);
                }
            } catch (e) {
                toast.error("Silmək mümkün olmadı");
            }
        }
        setDeleteModal({ isOpen: false, index: null });
    };

    const filteredRows = useMemo(() => {
        const lowSearch = searchTerm.toLowerCase();
        return rows.filter(c =>
            !searchTerm ||
            c.fullName.toLowerCase().includes(lowSearch) ||
            (c.customerCode || "").toLowerCase().includes(lowSearch) ||
            (c.details?.fin || "").toLowerCase().includes(lowSearch)
        );
    }, [rows, searchTerm]);

    if (loadingData && rows.length === 0) {
        return (
            <div className="flex h-[70vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-primary" size={48} />
                    <p className="text-sm font-black text-text-soft uppercase tracking-widest animate-pulse">Sistem yüklənir...</p>
                </div>
            </div>
        );
    }

    return (
        <AuthGuard>
            <div className="max-w-[1500px] mx-auto pb-16 relative px-4">

                {/* 1. STICKY FILTER BAR */}
                <div className="sticky top-0 z-50 bg-bg-main/90 backdrop-blur-xl -mx-4 px-4 pt-6 pb-8">
                    <div className="bg-white p-4 rounded-[3rem] border border-border-soft soft-shadow flex items-center justify-between gap-8">
                        <div className="flex items-center gap-6 flex-1 max-w-4xl">
                            <div className="relative flex-1 group">
                                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-text-soft group-focus-within:text-primary transition-colors" size={20} />
                                <input
                                    type="text"
                                    placeholder="Müştəri axtar (Ad, FİN)..."
                                    className="w-full pl-16 pr-12 py-5 bg-bg-main/30 rounded-[2rem] border border-transparent focus:border-primary/20 focus:bg-white outline-none text-[15px] font-bold transition-all shadow-inner"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <button onClick={() => setSearchTerm("")} className="absolute right-6 top-1/2 -translate-y-1/2 text-text-soft hover:text-primary">
                                        <X size={18} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={addRow}
                            className="bg-primary text-white h-16 w-16 rounded-[2rem] flex items-center justify-center hover:translate-y-[-2px] hover:shadow-2xl transition-all active:scale-95 shadow-xl shadow-primary/20"
                            title="Yeni Müştəri"
                        >
                            <Plus size={32} className="stroke-[3.5px]" />
                        </button>
                    </div>
                </div>

                {/* 2. CARD LIST */}
                <div className="grid grid-cols-1 gap-3 mt-4">
                    {filteredRows.map((row, idx) => (
                        <CustomerCard
                            // Important: use a unique key if possible, but fallback to idx for stability if id is missing on new rows
                            key={row.id || idx}
                            row={row}
                            index={idx}
                            totalRows={rows.length}
                            canUpdate={can("customers_update")}
                            canDelete={can("customers_delete")}
                            onSave={handleSave}
                            onDelete={onDelete}
                        />
                    ))}

                    {filteredRows.length === 0 && (
                        <div className="py-40 text-center flex flex-col items-center gap-6 opacity-20">
                            <div className="p-10 bg-gray-100 rounded-full">
                                <Search size={80} />
                            </div>
                            <p className="font-black text-3xl uppercase tracking-[0.2em] italic">Məlumat Tapılmadı</p>
                        </div>
                    )}
                </div>

                {/* DELETE MODAL */}
                {deleteModal.isOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-text-main/20 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white rounded-[2.5rem] p-10 max-w-md w-full soft-shadow border border-border-soft animate-in zoom-in duration-200">
                            <div className="flex flex-col items-center text-center gap-8">
                                <div className="h-24 w-24 bg-red-50 text-red-500 rounded-[2rem] flex items-center justify-center border-2 border-red-100 mb-2">
                                    <AlertTriangle size={48} className="stroke-[2.5px]" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-text-main tracking-tight uppercase">Məlumat Silinsin?</h3>
                                    <p className="text-md text-text-soft mt-4 font-semibold leading-relaxed px-4">Bu müştəri kartını silmək istədiyinizə əminsiniz? Bu əməliyyatı geri qaytarmaq mümkün olmayacaq.</p>
                                </div>
                                <div className="flex flex-col w-full gap-4">
                                    <button
                                        onClick={confirmDelete}
                                        className="w-full bg-red-500 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:bg-red-600 transition-all shadow-xl shadow-red-100 active:scale-95"
                                    >
                                        Bəli, Silinsin
                                    </button>
                                    <button
                                        onClick={() => setDeleteModal({ isOpen: false, index: null })}
                                        className="w-full bg-white text-text-soft py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] border-2 border-border-soft hover:bg-gray-50 transition-all active:scale-95"
                                    >
                                        Ləğv Et
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
