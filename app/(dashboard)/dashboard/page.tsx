"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
    Plus,
    Trash2,
    Save,
    Upload,
    Table as TableIcon,
    Database,
    Loader2,
    Search,
    X,
    AlertTriangle,
    RefreshCw,
    Edit2,
    Check,
    RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

/** Internal helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

interface CustomerRow {
    id?: string;
    customerCode: string;
    fullName: string;
    debtAmount: string;
    createdAt?: string;
}

export default function DashboardPage() {
    const [rows, setRows] = useState<CustomerRow[]>([]);
    const [originalRows, setOriginalRows] = useState<Record<string, CustomerRow>>({});
    const [editingId, setEditingId] = useState<string | number | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // Modal states
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; index: number | null }>({
        isOpen: false,
        index: null
    });

    const { user, can } = useAuth();

    const fetchCustomers = async (isInitial = false) => {
        if (isInitial) {
            const cached = localStorage.getItem("legal12_customers");
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    setRows(parsed);
                    setIsLoading(false);
                } catch (e) { }
            }
        } else {
            // Only show full loader if we have zero rows
            if (rows.length === 0) setIsLoading(true);
        }

        try {
            const res = await fetch('/api/customers');
            const data = await res.json();
            if (Array.isArray(data)) {
                const sorted = data.sort((a, b) =>
                    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
                );
                const finalRows = sorted.length > 0 ? sorted : [{ customerCode: "", fullName: "", debtAmount: "", createdAt: new Date().toISOString() }];
                setRows(finalRows);
                localStorage.setItem("legal12_customers", JSON.stringify(finalRows));

                const originals: Record<string, CustomerRow> = {};
                sorted.forEach(row => {
                    if (row.id) originals[row.id] = { ...row };
                });
                setOriginalRows(originals);
            }
        } catch (err) {
            console.error("Failed to load customers:", err);
            toast.error("Məlumatları yükləmək mümkün olmadı");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCustomers(true);
    }, []);

    const addRow = () => {
        const newId = Date.now(); // Temp ID for new row
        const newRow = {
            customerCode: "",
            fullName: "",
            debtAmount: "",
            createdAt: new Date().toISOString()
        };
        setRows([newRow, ...rows]);
        setEditingId(0); // Activate the first row (the new one)
        toast.info("Yeni sətir əlavə edildi");
    };

    const updateRow = (index: number, field: keyof CustomerRow, value: string) => {
        const newRows = [...rows];
        newRows[index] = { ...newRows[index], [field]: value };
        setRows(newRows);
    };

    const startEditing = (idx: number, id?: string) => {
        setEditingId(id || idx);
    };

    const cancelEditing = (idx: number, id?: string) => {
        if (id && originalRows[id]) {
            // Revert to original
            const newRows = [...rows];
            newRows[idx] = { ...originalRows[id] };
            setRows(newRows);
        } else if (!id) {
            // If it was a new unsaved row, we might want to keep it or remove it. 
            // For now just stop editing.
        }
        setEditingId(null);
    };

    const openDeleteModal = (index: number) => {
        setDeleteModal({ isOpen: true, index });
    };

    const confirmDelete = () => {
        if (deleteModal.index !== null) {
            const index = deleteModal.index;
            if (rows.length > 1) {
                setRows(rows.filter((_, i) => i !== index));
                toast.error("Sətir silindi");
            } else {
                setRows([{ customerCode: "", fullName: "", debtAmount: "", createdAt: new Date().toISOString() }]);
            }
        }
        setDeleteModal({ isOpen: false, index: null });
    };

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const pasteData = e.clipboardData.getData('text');
        const lines = pasteData.split(/\r?\n/).filter(line => line.trim() !== "");

        if (lines.length > 0) {
            e.preventDefault();
            const newRowsFromPaste = lines.map(line => {
                const columns = line.split('\t');
                return {
                    customerCode: columns[0]?.trim() || "",
                    fullName: columns[1]?.trim() || "",
                    debtAmount: columns[2]?.trim().replace(',', '.') || "",
                    createdAt: new Date().toISOString()
                };
            }).filter(row => row.customerCode || row.fullName);

            if (newRowsFromPaste.length > 0) {
                setRows([...newRowsFromPaste, ...rows]);
                toast.success(`${newRowsFromPaste.length} sətir əlavə edildi`);
            }
        }
    }, [rows]);

    const handleSave = async (specificRow?: CustomerRow) => {
        const dataToSave = specificRow ? [specificRow] : rows.filter(r => r.customerCode && r.fullName);

        if (dataToSave.length === 0) {
            toast.error("Yadda saxlamaq üçün məlumatları doldurun");
            return;
        }

        setIsSaving(true);
        try {
            const response = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSave)
            });

            if (response.ok) {
                toast.success(specificRow ? "Məlumat güncəlləndi" : "Bütün məlumatlar yadda saxlanıldı");
                setEditingId(null);
                fetchCustomers();
            } else {
                throw new Error("Xəta");
            }
        } catch (error) {
            toast.error("Bazaya yazmaq mümkün olmadı");
        } finally {
            setIsSaving(false);
        }
    };

    const filteredRows = useMemo(() => {
        if (!searchTerm) return rows;
        const lower = searchTerm.toLowerCase();
        return rows.filter(row =>
            row.customerCode.toLowerCase().includes(lower) ||
            row.fullName.toLowerCase().includes(lower) ||
            row.debtAmount.includes(lower)
        );
    }, [rows, searchTerm]);

    if (isLoading) {
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
        <div className="max-w-[1400px] mx-auto space-y-6 animate-in fade-in duration-700 pb-16 relative">

            {/* Search and Action Header */}
            <div className="sticky top-0 z-20 bg-[#F7F9FC]/80 backdrop-blur-md pt-2 pb-4">
                <div className="bg-white p-4 rounded-[2rem] border border-border-soft soft-shadow flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="relative w-full md:w-[400px]">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-text-soft" size={20} />
                            <input
                                type="text"
                                placeholder="Müştəri kodu və ya ad ilə axtarın..."
                                className="w-full pl-14 pr-12 py-4 bg-bg-main/50 rounded-[1.5rem] border border-transparent focus:border-primary/20 focus:bg-white outline-none text-sm font-bold transition-all shadow-inner"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm("")}
                                    className="absolute right-5 top-1/2 -translate-y-1/2 text-text-soft hover:text-primary p-1 hover:bg-bg-main rounded-lg transition-all"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                        {can("customers_create") && (
                            <button
                                onClick={addRow}
                                className="flex items-center gap-2 bg-primary text-white pl-5 pr-7 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider hover:translate-y-[-2px] hover:shadow-xl transition-all active:scale-95 shrink-0"
                            >
                                <Plus size={22} className="stroke-[3px]" />
                                Yeni Sətir
                            </button>
                        )}
                        {(can("customers_create") || can("customers_update")) && (
                            <button
                                onClick={() => handleSave()}
                                disabled={isSaving}
                                className="flex items-center gap-2 bg-text-main text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider hover:translate-y-[-2px] hover:shadow-xl transition-all active:scale-95 disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                Yadda Saxla
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-[3rem] border border-border-soft soft-shadow overflow-hidden">
                <div className="overflow-x-auto min-h-[500px]">
                    <table className="w-full border-collapse">
                        <thead className="sticky top-0 z-10 bg-white">
                            <tr className="bg-bg-main/50 border-b border-border-soft">
                                <th className="w-16 px-6 py-6 text-left text-[11px] font-black text-text-soft uppercase tracking-widest border-r border-border-soft/20">№</th>
                                <th className="px-8 py-6 text-left text-[11px] font-black text-text-soft uppercase tracking-widest border-r border-border-soft/20">Müştəri Kodu</th>
                                <th className="px-8 py-6 text-left text-[11px] font-black text-text-soft uppercase tracking-widest border-r border-border-soft/20">Ad Soyad Ata adı</th>
                                <th className="px-8 py-6 text-left text-[11px] font-black text-text-soft uppercase tracking-widest border-r border-border-soft/20">Borc (AZN)</th>
                                <th className="w-48 px-6 py-6 text-center text-[11px] font-black text-text-soft uppercase tracking-widest">Əməliyyatlar</th>
                            </tr>
                        </thead>
                        <tbody onPaste={handlePaste}>
                            {filteredRows.map((row, idx) => {
                                const globalIndex = rows.indexOf(row);
                                const isEditing = editingId === (row.id || globalIndex);

                                return (
                                    <tr key={row.id || globalIndex} className={cn(
                                        "border-b border-border-soft/40 transition-all duration-300",
                                        isEditing ? "bg-primary-soft/30 shadow-inner" : "hover:bg-primary-soft/5"
                                    )}>
                                        <td className="px-6 py-5 text-center text-xs font-black text-text-soft/30 bg-bg-main/10 border-r border-border-soft/20">
                                            {rows.length - globalIndex}
                                        </td>
                                        <td className="p-0 border-r border-border-soft/20 min-w-[200px]">
                                            <input
                                                type="text"
                                                readOnly={!isEditing}
                                                className={cn(
                                                    "w-full px-8 py-5 bg-transparent outline-none text-sm font-bold transition-all",
                                                    isEditing ? "bg-white focus:ring-2 focus:ring-primary/20 text-text-main" : "text-text-soft cursor-default"
                                                )}
                                                value={row.customerCode}
                                                onChange={(e) => updateRow(globalIndex, "customerCode", e.target.value)}
                                                placeholder="Kod..."
                                            />
                                        </td>
                                        <td className="p-0 border-r border-border-soft/20 min-w-[400px]">
                                            <input
                                                type="text"
                                                readOnly={!isEditing}
                                                className={cn(
                                                    "w-full px-8 py-5 bg-transparent outline-none text-sm font-bold transition-all",
                                                    isEditing ? "bg-white focus:ring-2 focus:ring-primary/20 text-text-main" : "text-text-soft cursor-default"
                                                )}
                                                value={row.fullName}
                                                onChange={(e) => updateRow(globalIndex, "fullName", e.target.value)}
                                                placeholder="Tam ad daxil edin..."
                                            />
                                        </td>
                                        <td className="p-0 border-r border-border-soft/20 min-w-[200px]">
                                            <input
                                                type="text"
                                                readOnly={!isEditing}
                                                className={cn(
                                                    "w-full px-8 py-5 bg-transparent outline-none text-base font-black transition-all",
                                                    isEditing ? "bg-white focus:ring-2 focus:ring-primary/20 text-primary" : "text-primary/60 cursor-default"
                                                )}
                                                value={row.debtAmount}
                                                onChange={(e) => updateRow(globalIndex, "debtAmount", e.target.value)}
                                                placeholder="0.00"
                                            />
                                        </td>
                                        <td className="px-4 py-5">
                                            <div className="flex items-center justify-center gap-3">
                                                {isEditing ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleSave(row)}
                                                            title="Yadda saxla"
                                                            className="flex items-center justify-center bg-green-500 text-white p-2.5 rounded-xl hover:bg-green-600 shadow-md transition-all animate-in zoom-in duration-200"
                                                        >
                                                            <Check size={18} className="stroke-[3px]" />
                                                        </button>
                                                        <button
                                                            onClick={() => cancelEditing(globalIndex, row.id)}
                                                            title="Ləğv et"
                                                            className="flex items-center justify-center bg-gray-100 text-text-soft p-2.5 rounded-xl hover:bg-gray-200 transition-all"
                                                        >
                                                            <X size={18} className="stroke-[3px]" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        {can("customers_update") && (
                                                            <button
                                                                onClick={() => startEditing(globalIndex, row.id)}
                                                                title="Düzəliş et"
                                                                className="flex items-center justify-center bg-blue-50 text-blue-600 p-2.5 rounded-xl hover:bg-blue-100 hover:text-blue-700 transition-all border border-blue-100"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                        )}
                                                        {can("customers_delete") && (
                                                            <button
                                                                onClick={() => openDeleteModal(globalIndex)}
                                                                title="Sil"
                                                                className="flex items-center justify-center text-text-soft/30 hover:text-red-500 bg-gray-50 hover:bg-red-50 p-2.5 rounded-xl transition-all border border-transparent hover:border-red-100"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredRows.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-32 text-center">
                                        <div className="flex flex-col items-center gap-4 opacity-20">
                                            <div className="p-6 bg-gray-100 rounded-full">
                                                <Search size={64} />
                                            </div>
                                            <p className="font-black text-xl uppercase tracking-tighter italic">Nəticə tapılmadı</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer Info */}
                <div className="p-8 bg-bg-main/30 flex items-center justify-between border-t border-border-soft">
                    <div className="flex items-center gap-10 text-[11px] font-black text-text-soft uppercase tracking-widest">
                        <div className="px-5 py-2.5 bg-white rounded-2xl border border-border-soft shadow-inner flex items-center gap-3">
                            <TableIcon size={16} className="text-primary" />
                            <span>SİSTEMDƏ CƏMİ: <span className="text-primary text-sm ml-1">{rows.length}</span> SƏTİR</span>
                        </div>
                        <div className="hidden lg:flex items-center gap-2 lowercase font-bold opacity-30 bg-white px-4 py-2.5 rounded-2xl border border-dashed border-border-soft">
                            <Upload size={14} />
                            Ipucu: Excel-dən toplu kopyalayıb yapışdıra bilərsiniz
                        </div>
                    </div>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {deleteModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-text-main/20 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full soft-shadow border border-border-soft animate-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center gap-6">
                            <div className="h-20 w-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center border-2 border-red-100 mb-2">
                                <AlertTriangle size={40} className="stroke-[2.5px]" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-text-main tracking-tight uppercase">Sətiri Silmək?</h3>
                                <p className="text-sm text-text-soft mt-3 font-semibold leading-relaxed">Bu məlumatı silməyə əminsiniz? Bu əməliyyat geri qaytarıla bilməz.</p>
                            </div>
                            <div className="flex flex-col w-full gap-3">
                                <button
                                    onClick={confirmDelete}
                                    className="w-full bg-red-500 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-red-600 transition-all shadow-lg shadow-red-100 active:scale-95"
                                >
                                    Bəli, Silinsin
                                </button>
                                <button
                                    onClick={() => setDeleteModal({ isOpen: false, index: null })}
                                    className="w-full bg-white text-text-soft py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] border border-border-soft hover:bg-gray-50 transition-all active:scale-95"
                                >
                                    Xeyr, Qalsın
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
