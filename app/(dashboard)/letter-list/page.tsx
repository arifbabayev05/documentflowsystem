"use client";

import { useEffect, useState, useMemo, useRef } from "react";
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
    Square,
    RefreshCw,
    ChevronDown
} from "lucide-react";
import { getCustomers, getTemplates, getAllUsers } from "@/lib/db";
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
    statusHistory?: Array<{
        action: string;
        user: string;
        timestamp: string;
        label: string;
    }>;
    details?: {
        address?: string;
        isWarningSent?: boolean;
        warningDate?: string;
    };
}

/**
 * Searchable User Select Component
 */
const UserSelect = ({ users, value, onChange }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedUser = users.find((u: any) => u.email === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const filteredUsers = users.filter((u: any) =>
        (u.displayName || "").toLowerCase().includes(search.toLowerCase()) ||
        (u.email || "").toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="relative w-[210px]" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-full flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 transition-all text-left shadow-sm",
                    isOpen ? "ring-2 ring-indigo-600/10 border-indigo-600/40" : "hover:border-slate-300"
                )}
            >
                <div className="flex items-center gap-2 min-w-0 pr-1">
                    <User size={13} className={selectedUser ? "text-indigo-600" : "text-slate-400"} />
                    <span className={cn(
                        "text-xs font-bold truncate leading-tight",
                        selectedUser ? "text-slate-900" : "text-slate-400"
                    )}>
                        {selectedUser ? (selectedUser.displayName || selectedUser.email) : "Əməkdaş seç..."}
                    </span>
                </div>
                <ChevronDown size={12} className={cn("text-slate-400 transition-transform shrink-0", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute z-[100] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="p-1.5 border-b border-slate-50 bg-slate-50/50">
                        <div className="relative">
                            <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                autoFocus
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Email və ya ad ilə axtar..."
                                className="w-full bg-white border border-slate-200 rounded-md pl-7 pr-2 py-1 text-[10px] outline-none focus:border-indigo-600/30 font-bold"
                            />
                        </div>
                    </div>
                    <div className="max-h-[220px] overflow-y-auto scrollbar-none">
                        <button
                            onClick={() => { onChange(""); setIsOpen(false); setSearch(""); }}
                            className="w-full text-left px-3 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 border-b border-slate-50 transition-colors"
                        >
                            Sıfırla
                        </button>
                        {filteredUsers.length === 0 ? (
                            <div className="p-3 text-center text-[9px] font-bold text-slate-400 uppercase">İstifadəçi tapılmadı</div>
                        ) : (
                            filteredUsers.map((u: any) => {
                                const isSelected = u.email === value;
                                return (
                                    <button
                                        key={u.id}
                                        onClick={() => { onChange(u.email); setIsOpen(false); setSearch(""); }}
                                        className={cn(
                                            "w-full text-left px-3 py-2 flex flex-col hover:bg-indigo-50 transition-all",
                                            isSelected && "bg-indigo-50 border-l-2 border-indigo-600"
                                        )}
                                    >
                                        <span className={cn(
                                            "text-[10px] font-bold truncate",
                                            isSelected ? "text-indigo-700" : "text-slate-700"
                                        )}>
                                            {u.displayName || "İsimsiz"}
                                        </span>
                                        <span className="text-[8px] font-medium text-slate-400 truncate">
                                            {u.email}
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default function LetterListPage() {
    const { user, can } = useAuth();
    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [senderSearch, setSenderSearch] = useState("");
    const [appUsers, setAppUsers] = useState<any[]>([]);

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
        if (user) {
            fetchCustomers();

            // Fetch users for the sender filter
            getAllUsers().then(users => {
                const adminsAndManagers = users.filter((u: any) =>
                    u.role === 'ADMIN' || u.role === 'MANAGER'
                );
                setAppUsers(adminsAndManagers);

                // Default to current user for Admin and Inspector as requested
                // Only if senderSearch is empty initially
                if ((user.role === "ADMIN" || user.role === "INSPECTOR") && !senderSearch) {
                    setSenderSearch(user.email);
                }
            });
        }
    }, [user]);

    const filteredAndSortedCustomers = useMemo(() => {
        return customers
            .filter(c => {
                // Only show rows where a warning was sent
                const hasWarning = c.details?.isWarningSent === true && !!c.details?.warningDate;
                if (!hasWarning) return false;

                // Find warning sender from statusHistory
                const warningLog = [...(c.statusHistory || [])]
                    .reverse()
                    .find(log => log.action === "WARNING_SENT");
                const senderEmail = warningLog?.user || "";

                const search = searchTerm.toLowerCase();
                const matchesSearch = c.fullName?.toLowerCase().includes(search) ||
                    c.details?.address?.toLowerCase().includes(search);
                if (!matchesSearch) return false;

                // Sender filter
                if (senderSearch && senderEmail) {
                    const sSearch = senderSearch.toLowerCase();
                    if (!senderEmail.toLowerCase().includes(sSearch)) return false;
                } else if (senderSearch && !senderEmail) {
                    return false;
                }

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
    }, [customers, searchTerm, startDate, endDate, senderSearch]);

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
                        <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-1.5 rounded-xl border border-slate-200/60 shadow-inner">
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

                            <UserSelect
                                users={appUsers}
                                value={senderSearch}
                                onChange={setSenderSearch}
                            />

                            <div className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={14} />
                                <input
                                    type="text"
                                    placeholder="Axtarış..."
                                    className="w-[200px] pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-600/5 focus:border-indigo-600 transition-all font-semibold text-xs text-slate-700 shadow-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={fetchCustomers}
                                className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-indigo-600 hover:border-indigo-600 transition-all flex items-center justify-center shadow-sm"
                                title="Yenilə"
                            >
                                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                            </button>
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
                                    <th className="px-6 py-4 text-[13px] font-bold text-slate-500 uppercase tracking-wider">Əməkdaş</th>
                                    <th className="px-6 py-4 text-[13px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
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
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2 text-slate-500 group-hover:text-slate-600 transition-colors">
                                                        <User size={13} className="shrink-0 text-slate-300" />
                                                        <span className="text-[11px] font-bold truncate max-w-[120px]">
                                                            {[...(customer.statusHistory || [])].reverse().find(l => l.action === "WARNING_SENT")?.user?.split('@')[0] || "-"}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {customer.isArchived ? (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-100 text-slate-500 uppercase tracking-tight border border-slate-200">Arxivdə</span>
                                                    ) : customer.process_status === 'COMPLETED' ? (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-50 text-emerald-600 uppercase tracking-tight border border-emerald-100">Tamamlanıb</span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-50 text-indigo-600 uppercase tracking-tight border border-indigo-100">Aktiv</span>
                                                    )}
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
                                        <td colSpan={7} className="py-24 text-center">
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
