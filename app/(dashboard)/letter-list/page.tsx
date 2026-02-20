"use client";

import { useEffect, useState, useMemo } from "react";
import {
    Mail,
    Search,
    Loader2,
    Clock,
    User,
    MapPin,
    ArrowUpDown,
    Filter,
    X,
    ShieldCheck,
    Calendar,
    ChevronRight,
    SearchX,
    Printer,
    CheckSquare,
    Square
} from "lucide-react";
import { getCustomers, getTemplates } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";
import { saveAs } from "file-saver";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { toast } from "sonner";

/** Internal helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

interface CustomerRow {
    id: string;
    fullName: string;
    isArchived?: boolean;
    process_status?: string;
    details?: {
        address?: string;
        isWarningSent?: boolean;
        warningDate?: string;
    };
}

export default function LetterListPage() {
    const { user, can } = useAuth();
    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Date parser for DD.MM.YYYY
    const parseDate = (dateStr?: string) => {
        if (!dateStr) return 0;
        const [day, month, year] = dateStr.split('.').map(Number);
        return new Date(year, month - 1, day).getTime();
    };

    // Helper to format date object to DD.MM.YYYY string
    const formatDate = (date: Date) => {
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const y = date.getFullYear();
        return `${d}.${m}.${y}`;
    };

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const data = await getCustomers();
            setCustomers(data as CustomerRow[]);
        } catch (error) {
            console.error("Error fetching customers:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) fetchCustomers();
    }, [user]);

    const filteredAndSortedCustomers = useMemo(() => {
        return customers
            .filter(c => {
                // Warning logic
                const hasWarning = c.details?.isWarningSent === true && !!c.details?.warningDate;
                // Exclude archived and completed
                const isNotArchived = !c.isArchived;
                const isNotCompleted = c.process_status !== 'COMPLETED';

                if (!hasWarning || !isNotArchived || !isNotCompleted) return false;

                const search = searchTerm.toLowerCase();
                const matchesSearch = c.fullName?.toLowerCase().includes(search) ||
                    c.details?.address?.toLowerCase().includes(search);
                if (!matchesSearch) return false;

                // Date range filter
                const warningTime = parseDate(c.details?.warningDate);
                if (startDate) {
                    const startRaw = new Date(startDate);
                    const start = new Date(startRaw.getFullYear(), startRaw.getMonth(), startRaw.getDate()).getTime();
                    if (warningTime < start) return false;
                }
                if (endDate) {
                    const endRaw = new Date(endDate);
                    const end = new Date(endRaw.getFullYear(), endRaw.getMonth(), endRaw.getDate(), 23, 59, 59, 999).getTime();
                    if (warningTime > end) return false;
                }

                return true;
            })
            .sort((a, b) => {
                // Most recent warning date first
                const dateA = parseDate(a.details?.warningDate);
                const dateB = parseDate(b.details?.warningDate);
                return dateB - dateA;
            });
    }, [customers, searchTerm, startDate, endDate]);

    const handleSelectAll = () => {
        if (selectedIds.length === filteredAndSortedCustomers.length && filteredAndSortedCustomers.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredAndSortedCustomers.map(c => c.id));
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handlePrint = async () => {
        const selectedData = filteredAndSortedCustomers.filter(c => selectedIds.includes(c.id));
        if (selectedData.length === 0) {
            toast.error("Zəhmət olmasa ən azı bir müştəri seçin");
            return;
        }

        const loadingId = toast.loading("Word faylı hazırlanır...");
        try {
            // Fetch templates from database
            const templates = await getTemplates() as any[];
            const specificTemplate = templates.find(t => t.name === "Məktubların_103_Siyahısı_Template.docx");

            if (!specificTemplate) {
                throw new Error("Sistemdə 'Məktubların_103_Siyahısı_Template.docx' şablonu tapılmadı. Zəhmət olmasa 'Hesabatlar' bölməsində bu adda şablon yükləyin.");
            }

            // Robust Base64 to ArrayBuffer conversion
            const cleanBase64 = specificTemplate.content.trim().replace(/\s/g, '');
            const binaryString = window.atob(cleanBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const arrayBuffer = bytes.buffer;
            const zip = new PizZip(arrayBuffer);
            let doc;
            try {
                doc = new Docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                    delimiters: { start: "{{", end: "}}" },
                    nullGetter: () => ""
                });
            } catch (initErr: any) {
                // If it's a multi-error during initialization (e.g. tag syntax error)
                if (initErr.properties && initErr.properties.errors instanceof Array) {
                    const errorDetails = initErr.properties.errors.map((e: any) => e.message).join(" | ");
                    console.error("Docxtemplater Init Multi-Error:", errorDetails);
                    throw new Error("Şablon strukturunda xəta (Init): " + errorDetails);
                }
                console.error("Docxtemplater Init Error:", initErr);
                throw new Error("Şablonun oxunmasında xəta (Init): " + (initErr.message || ""));
            }

            // Map data to the format requested by user (ad_soyad, unvan)
            try {
                doc.render({
                    title: "Məktubların 103 siyahısı",
                    date: formatDate(new Date()),
                    customers: selectedData.map((c, i) => ({
                        nn: i + 1,
                        ad_soyad: (c.fullName || "").trim().toUpperCase(),
                        unvan: c.details?.address || "-"
                    }))
                });
            } catch (renderErr: any) {
                if (renderErr.properties && renderErr.properties.errors instanceof Array) {
                    const errorMessages = renderErr.properties.errors.map((e: any) => e.message).join("\n");
                    console.error("Docxtemplater Render Multi-Error:", errorMessages);
                    throw new Error("Şablonda xəta var (Render): " + errorMessages);
                }
                throw renderErr;
            }

            const buf = doc.getZip().generate({ type: "blob" });

            // Trigger print iframe
            const printContainer = document.getElementById('print-iframe') as HTMLIFrameElement;
            if (printContainer) {
                const printDoc = printContainer.contentDocument || printContainer.contentWindow?.document;
                if (printDoc) {
                    printDoc.open();
                    printDoc.write('<html><head></head><body><div id="print-mount"></div></body></html>');
                    printDoc.close();

                    const style = printDoc.createElement('style');
                    style.textContent = `
                        @page { size: A4; margin: 0; }
                        body { margin: 0; padding: 0; font-family: 'Times New Roman', serif; }
                        .docx-wrapper { background: white !important; padding: 0 !important; }
                        .docx { box-shadow: none !important; margin: 0 !important; padding: 2.54cm !important; width: 100% !important; box-sizing: border-box; }
                    `;
                    printDoc.head.appendChild(style);

                    const mountPoint = printDoc.getElementById('print-mount');
                    const { renderAsync } = await import("docx-preview");
                    if (mountPoint) {
                        await renderAsync(buf, mountPoint, undefined, {
                            className: "docx-viewer",
                            inWrapper: false,
                            ignoreWidth: true,
                            ignoreHeight: true,
                            breakPages: true,
                        });
                    }

                    setTimeout(() => {
                        printContainer.contentWindow?.focus();
                        printContainer.contentWindow?.print();
                    }, 500);
                }
            }

            toast.success("Çap pəncərəsi açıldı", { id: loadingId });
        } catch (error: any) {
            console.error("Detailed Print error:", error);
            const msg = error.message || "Word faylı yaradılarkən xəta baş verdi.";
            toast.error(msg, { id: loadingId, duration: 6000 });
        }
    };

    if (!user || !can("page_letter_list")) {
        return (
            <AuthGuard>
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                    <div className="h-16 w-16 rounded-3xl bg-red-50 flex items-center justify-center mb-6">
                        <ShieldCheck size={32} className="text-red-400" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Giriş Məhdudlaşdırılıb</h2>
                    <p className="text-slate-500 max-w-[300px]">Bu bölməyə daxil olmaq üçün xüsusi icazəniz olmalıdır.</p>
                </div>
            </AuthGuard>
        );
    }

    if (loading && customers.length === 0) {
        return (
            <div className="flex h-[80vh] items-center justify-center bg-slate-50/10">
                <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                        <div className="h-16 w-16 rounded-full border-[3px] border-slate-200 border-t-indigo-600 animate-spin" />
                        <Mail className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600/50" size={24} />
                    </div>
                    <p className="text-[13px] font-bold text-slate-500 uppercase tracking-[0.2em]">Siyahı hazırlanır...</p>
                </div>
            </div>
        );
    }

    return (
        <AuthGuard>
            <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-1000 pb-20 px-8">

                {/* --- PROFESSIONAL HEADER --- */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 pt-10 border-b border-slate-100 pb-8">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200/50">
                                <Mail size={20} className="text-white" />
                            </div>
                            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Məktubların 103 Siyahısı</h1>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        {/* Selection Info & Actions */}
                        <div className="flex items-center gap-3">
                            {selectedIds.length > 0 && (
                                <>
                                    <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-lg border border-indigo-100 animate-in fade-in slide-in-from-right-4">
                                        <div className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
                                        <span className="text-[13px] font-bold text-indigo-700 uppercase tracking-wider">
                                            {selectedIds.length} müştəri seçilib
                                        </span>
                                    </div>
                                    <button
                                        onClick={handlePrint}
                                        className="bg-slate-900 text-white px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-all shadow-md active:scale-95 flex items-center gap-2"
                                    >
                                        <Printer size={15} /> ÇAP ET (WORD)
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Filters Container */}
                        <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-xl border border-slate-200/60 shadow-inner">
                            <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors border-r border-slate-100">
                                    <Calendar size={13} className="text-slate-400" />
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="bg-transparent text-[13px] font-bold outline-none text-slate-700 cursor-pointer w-[110px]"
                                    />
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors">
                                    <Calendar size={13} className="text-slate-400" />
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="bg-transparent text-[13px] font-bold outline-none text-slate-700 cursor-pointer w-[110px]"
                                    />
                                </div>
                                {(startDate || endDate) && (
                                    <button
                                        onClick={() => { setStartDate(""); setEndDate(""); }}
                                        className="p-2 text-slate-400 hover:text-red-500 transition-colors border-l border-slate-100"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <div className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={14} />
                                <input
                                    type="text"
                                    placeholder="Axtarış..."
                                    className="w-[220px] pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-600/5 focus:border-indigo-600 transition-all font-semibold text-xs text-slate-700 shadow-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- MINIMALIST DATA TABLE --- */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-bottom-5 duration-700">
                    <div className="overflow-x-auto scrollbar-thin">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50/80 border-b border-slate-200 text-left">
                                    <th className="px-6 py-4 w-[80px]">
                                        <div className="flex items-center justify-center">
                                            <button
                                                onClick={handleSelectAll}
                                                className={cn(
                                                    "h-4 w-4 rounded border transition-all flex items-center justify-center",
                                                    selectedIds.length === filteredAndSortedCustomers.length && filteredAndSortedCustomers.length > 0
                                                        ? "bg-indigo-600 border-indigo-600 text-white"
                                                        : "bg-white border-slate-300 hover:border-indigo-500"
                                                )}
                                            >
                                                {selectedIds.length === filteredAndSortedCustomers.length && filteredAndSortedCustomers.length > 0 ? (
                                                    <CheckSquare size={10} strokeWidth={3} />
                                                ) : selectedIds.length > 0 ? (
                                                    <div className="h-1.5 w-1.5 bg-indigo-500 rounded-sm" />
                                                ) : null}
                                            </button>
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 text-[13px] font-bold text-slate-500 uppercase tracking-wider">№</th>
                                    <th className="px-6 py-4 text-[13px] font-bold text-slate-500 uppercase tracking-wider">Müştəri (Ad Soyad Ata adı)</th>
                                    <th className="px-6 py-4 text-[13px] font-bold text-slate-500 uppercase tracking-wider">Qeydiyyat Ünvanı</th>
                                    <th className="px-6 py-4 text-[13px] font-bold text-slate-500 uppercase tracking-wider text-right">Xəbərdarlıq Tarixi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredAndSortedCustomers.length > 0 ? (
                                    filteredAndSortedCustomers.map((customer, index) => {
                                        const isSelected = selectedIds.includes(customer.id);
                                        return (
                                            <tr
                                                key={customer.id}
                                                onClick={() => toggleSelect(customer.id)}
                                                className={cn(
                                                    "hover:bg-slate-50/50 transition-colors group cursor-pointer",
                                                    isSelected ? "bg-indigo-50/40" : ""
                                                )}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-center">
                                                        <div className={cn(
                                                            "h-4 w-4 rounded border transition-all flex items-center justify-center",
                                                            isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 group-hover:border-indigo-400"
                                                        )}>
                                                            {isSelected && <CheckSquare size={10} strokeWidth={3} />}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-[12px] font-bold text-slate-400">
                                                        {index + 1}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn(
                                                            "h-9 w-9 rounded-lg flex items-center justify-center font-bold text-xs shadow-sm transition-all",
                                                            isSelected ? "bg-white text-indigo-600 border border-indigo-100" : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-indigo-600 group-hover:border-indigo-100"
                                                        )}>
                                                            {customer.fullName?.[0]?.toUpperCase() || "M"}
                                                        </div>
                                                        <span className={cn(
                                                            "text-sm font-bold tracking-tight transition-colors",
                                                            isSelected ? "text-indigo-700" : "text-slate-700 group-hover:text-indigo-600 font-semibold"
                                                        )}>
                                                            {customer.fullName}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2 text-slate-500 group-hover:text-slate-600 transition-colors">
                                                        <MapPin size={13} className="shrink-0 text-slate-300" />
                                                        <span className="text-xs font-medium leading-relaxed max-w-[400px]">
                                                            {customer.details?.address || "Qeyd edilməyib"}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className={cn(
                                                        "inline-flex items-center gap-2 px-3 py-1 rounded-md border transition-all",
                                                        isSelected
                                                            ? "bg-indigo-700 border-indigo-700 text-white"
                                                            : "bg-slate-100 border-slate-200 text-slate-600 font-bold group-hover:bg-indigo-600 group-hover:border-indigo-600 group-hover:text-white"
                                                    )}>
                                                        <Calendar size={12} />
                                                        <span className="text-[13px] font-bold">
                                                            {customer.details?.warningDate}
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="py-24 text-center">
                                            <div className="flex flex-col items-center gap-4 text-slate-300">
                                                <SearchX size={40} strokeWidth={1.5} />
                                                <div className="space-y-1">
                                                    <p className="text-sm font-bold text-slate-500">Məlumat tapılmadı</p>
                                                    <p className="text-[13px] text-slate-400 font-medium">Seçilmiş kriteriyalara uyğun müştəri yoxdur</p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* --- PROFESSIONAL FOOTER --- */}
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-6">
                        <div className="text-[13px] font-semibold text-slate-500 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200/60">
                            Cəmi: <span className="text-indigo-600 font-bold">{filteredAndSortedCustomers.length} reyestr qeydi</span>
                        </div>
                        {selectedIds.length > 0 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setSelectedIds([]); }}
                                className="text-[13px] font-bold text-slate-400 hover:text-red-500 flex items-center gap-1.5 transition-colors underline underline-offset-4 decoration-slate-200 decoration-2"
                            >
                                Seçimi təmizlə
                            </button>
                        )}
                    </div>
                </div>

                {/* Hidden Print Iframe */}
                <iframe id="print-iframe" className="hidden" style={{ display: 'none' }} />
            </div>
        </AuthGuard>
    );
}
