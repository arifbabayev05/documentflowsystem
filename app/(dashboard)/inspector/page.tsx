"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Plus, Save, X, Zap, History, Calendar, ChevronLeft, ChevronRight, Shield, AlertTriangle, Users, DollarSign, UserCheck, Search, Filter, FileDown, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatPhoneInput, toTitleCase, formatAZDate } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";
import { STATUS_LABELS, ProcessStatus } from "../dashboard/page";
import { bulkAddCustomers, getInspectorCustomers, getCustomer, getCustomers } from "@/lib/db";
import * as XLSX from "xlsx";

interface EntryRow {
    customer_code: string;
    full_name: string;
    total_debt: string;
    fin: string;
    serial_number: string;
}


const EMPTY_ROW: EntryRow = {
    customer_code: "",
    full_name: "",
    total_debt: "",
    fin: "",
    serial_number: "",
};

const COLUMNS: { key: keyof EntryRow; label: string; width: string; uppercase?: boolean; maxLen?: number }[] = [
    { key: "customer_code", label: "Müştəri Kodu", width: "180px" },
    { key: "full_name", label: "Müştəri (Soyad, Ad, Ata adı)", width: "0.98fr" },
    { key: "fin", label: "FİN", width: "180px", uppercase: true, maxLen: 7 },
    { key: "serial_number", label: "Seriya", width: "180px", uppercase: true },
    { key: "total_debt", label: "Borc (AZN)", width: "180px" },
];

/* ── Custom Date Picker Component ── */
interface CustomDatePickerProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

const MONTHS_AZ = [
    "Yanvar", "Fevral", "Mart", "Aprel", "May", "İyun",
    "İyul", "Avqust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"
];

const WEEKDAYS_AZ = ["Bz", "Be", "Ça", "Çə", "Ca", "Cü", "Şə"];

function CustomDatePicker({ value, onChange, placeholder = "Tarix seçin" }: CustomDatePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(() => {
        if (value) return new Date(value);
        return new Date();
    });
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedDate = value ? new Date(value) : null;

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (year: number, month: number) => {
        return new Date(year, month, 1).getDay();
    };

    const generateCalendarDays = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        const daysInPrevMonth = getDaysInMonth(year, month - 1);

        const days: { day: number; isCurrentMonth: boolean; date: Date }[] = [];

        // Previous month days
        for (let i = firstDay - 1; i >= 0; i--) {
            const day = daysInPrevMonth - i;
            days.push({
                day,
                isCurrentMonth: false,
                date: new Date(year, month - 1, day),
            });
        }

        // Current month days
        for (let i = 1; i <= daysInMonth; i++) {
            days.push({
                day: i,
                isCurrentMonth: true,
                date: new Date(year, month, i),
            });
        }

        // Next month days
        const remaining = 42 - days.length;
        for (let i = 1; i <= remaining; i++) {
            days.push({
                day: i,
                isCurrentMonth: false,
                date: new Date(year, month + 1, i),
            });
        }

        return days;
    };

    const handlePrevMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    };

    const handleSelectDate = (date: Date) => {
        const formatted = date.toISOString().split("T")[0];
        onChange(formatted);
        setIsOpen(false);
    };

    const handleToday = () => {
        const today = new Date();
        setViewDate(today);
        handleSelectDate(today);
    };

    const handleClear = () => {
        onChange("");
        setIsOpen(false);
    };

    const isSelected = (date: Date) => {
        if (!selectedDate) return false;
        return (
            date.getDate() === selectedDate.getDate() &&
            date.getMonth() === selectedDate.getMonth() &&
            date.getFullYear() === selectedDate.getFullYear()
        );
    };

    const isToday = (date: Date) => {
        const today = new Date();
        return (
            date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear()
        );
    };

    const formatDisplayDate = (dateStr: string) => {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}.${month}.${year} `;
    };

    const days = generateCalendarDays();

    return (
        <div ref={containerRef} className="relative">
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 pl-3 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-[12px] font-bold text-slate-800 cursor-pointer hover:border-slate-300 transition-all shadow-sm min-w-[140px]"
            >
                <Calendar size={14} className="text-slate-400" />
                <span className={value ? "text-slate-800" : "text-slate-400"}>
                    {value ? formatDisplayDate(value) : placeholder}
                </span>
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 min-w-[300px] animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <button
                            onClick={handlePrevMonth}
                            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            <ChevronLeft size={18} className="text-slate-600" />
                        </button>
                        <div className="text-[14px] font-black text-slate-800">
                            {MONTHS_AZ[viewDate.getMonth()]} {viewDate.getFullYear()}
                        </div>
                        <button
                            onClick={handleNextMonth}
                            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            <ChevronRight size={18} className="text-slate-600" />
                        </button>
                    </div>

                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {WEEKDAYS_AZ.map((day) => (
                            <div
                                key={day}
                                className="text-center text-[11px] font-bold text-slate-400 py-2"
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar days */}
                    <div className="grid grid-cols-7 gap-1">
                        {days.map((dayInfo, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleSelectDate(dayInfo.date)}
                                className={`
w - 9 h - 9 rounded - xl text - [13px] font - semibold transition - all
                                    ${!dayInfo.isCurrentMonth ? "text-slate-300" : "text-slate-700"}
                                    ${isSelected(dayInfo.date)
                                        ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30"
                                        : isToday(dayInfo.date)
                                            ? "bg-blue-50 text-blue-600 ring-2 ring-blue-200"
                                            : "hover:bg-slate-100"
                                    }
`}
                            >
                                {dayInfo.day}
                            </button>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                        <button
                            onClick={handleClear}
                            className="text-[12px] font-bold text-slate-400 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
                        >
                            Təmizlə
                        </button>
                        <button
                            onClick={handleToday}
                            className="text-[12px] font-bold text-blue-600 hover:text-blue-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-50"
                        >
                            Bu gün
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function InspectorPage() {
    const { user, can } = useAuth();
    const router = useRouter();

    const [rows, setRows] = useState<EntryRow[]>([{ ...EMPTY_ROW }]);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dateRange, setDateRange] = useState({ start: "", end: "" });
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        message: string;
        onConfirm: () => void;
        onCancel: () => void;
    } | null>(null);

    // Search & Pagination & Filter
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [selectedInspector, setSelectedInspector] = useState("ALL");

    // Export Modal State
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportStartDate, setExportStartDate] = useState("");
    const [exportEndDate, setExportEndDate] = useState("");
    const [exportInspectors, setExportInspectors] = useState<string[]>([]);
    const [exportSearchTerm, setExportSearchTerm] = useState("");
    const [isExportComboboxOpen, setIsExportComboboxOpen] = useState(false);

    const tableRef = useRef<HTMLDivElement>(null);

    const askConfirmation = (message: string) => {
        return new Promise<boolean>((resolve) => {
            setConfirmModal({
                isOpen: true,
                message,
                onConfirm: () => {
                    setConfirmModal(null);
                    resolve(true);
                },
                onCancel: () => {
                    setConfirmModal(null);
                    resolve(false);
                }
            });
        });
    };

    const isLeadOrAdmin = user?.role === "INSPECTOR_LEAD" || user?.role === "SUPERADMIN" || user?.role === "DEP_HEAD" || user?.role === "MANAGER";

    /* ── fetch history ── */
    const fetchHistory = useCallback(async () => {
        if (!user?.email) return;
        try {
            setLoading(true);
            let data;
            if (isLeadOrAdmin) {
                data = await getCustomers();
            } else {
                data = await getInspectorCustomers(user.email);
            }
            data.sort((a: any, b: any) =>
                new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );
            setHistory(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [user?.email, isLeadOrAdmin]);

    useEffect(() => {
        if (user) fetchHistory();
    }, [user, fetchHistory]);

    const stats = useMemo(() => {
        let sourceData = history;
        if (isLeadOrAdmin && selectedInspector !== "ALL") {
            sourceData = history.filter(h => h.createdBy === selectedInspector);
        }

        const total = sourceData.length;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayCount = sourceData.filter(h => {
            if (!h.createdAt) return false;
            const d = new Date(h.createdAt);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === today.getTime();
        }).length;

        const completedCount = sourceData.filter(h => h.process_status === "COMPLETED").length;
        const waitingCount = sourceData.filter(h => h.process_status === "WAITING_FOR_ARCHIVE").length;
        const distinctInspectors = new Set(sourceData.map(h => h.createdBy)).size;

        return { total, todayCount, completedCount, waitingCount, distinctInspectors };
    }, [history, selectedInspector, isLeadOrAdmin]);

    const filteredHistory = useMemo(() => {
        return history.filter(row => {
            // 1. Date Range Filter
            if (dateRange.start || dateRange.end) {
                if (!row.createdAt) return false;
                const rowDate = new Date(row.createdAt);
                rowDate.setHours(0, 0, 0, 0);

                if (dateRange.start) {
                    const startDate = new Date(dateRange.start);
                    startDate.setHours(0, 0, 0, 0);
                    if (rowDate < startDate) return false;
                }

                if (dateRange.end) {
                    const endDate = new Date(dateRange.end);
                    endDate.setHours(0, 0, 0, 0);
                    if (rowDate > endDate) return false;
                }
            }

            // 2. Inspector Filter (for Lead/Admin)
            if (isLeadOrAdmin && selectedInspector !== "ALL") {
                if (row.createdBy !== selectedInspector) return false;
            }

            // 3. Search Term Filter
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase().trim();
                const matches = [
                    row.customerCode,
                    row.fullName,
                    row.details?.fin,
                    row.details?.passportSeries
                ].some(val => val?.toString()?.toLowerCase()?.includes(term));

                if (!matches) return false;
            }

            return true;
        });
    }, [history, dateRange, selectedInspector, searchTerm, isLeadOrAdmin]);

    const inspectors = useMemo(() => {
        if (!isLeadOrAdmin) return [];
        const unique = Array.from(new Set(history.map(h => h.createdBy).filter(Boolean)));
        return unique.sort();
    }, [history, isLeadOrAdmin]);

    const paginatedHistory = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredHistory.slice(start, start + itemsPerPage);
    }, [filteredHistory, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedInspector, dateRange]);

    if (!user || !can("page_inspector")) {
        return (
            <AuthGuard>
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                    <div className="h-16 w-16 rounded-3xl bg-red-50 flex items-center justify-center mb-6">
                        <Shield size={32} className="text-red-400" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Giriş Məhdudlaşdırılıb</h2>
                    <p className="text-slate-500 max-w-[300px]">Bu bölməyə daxil olmaq üçün Müfəttiş icazəniz olmalıdır.</p>
                </div>
            </AuthGuard>
        );
    }



    /* ── excel export handler ── */
    const handleExcelExport = () => {
        let dataToExport = history;

        if (exportStartDate || exportEndDate) {
            dataToExport = dataToExport.filter(row => {
                if (!row.createdAt) return false;
                const rowDate = new Date(row.createdAt);
                rowDate.setHours(0, 0, 0, 0);

                if (exportStartDate) {
                    const start = new Date(exportStartDate);
                    start.setHours(0, 0, 0, 0);
                    if (rowDate < start) return false;
                }
                if (exportEndDate) {
                    const end = new Date(exportEndDate);
                    end.setHours(0, 0, 0, 0);
                    if (rowDate > end) return false;
                }
                return true;
            });
        }

        if (exportInspectors.length > 0) {
            dataToExport = dataToExport.filter(row => exportInspectors.includes(row.createdBy));
        }

        const statsMap = new Map<string, { SAA: string, count: number }>();

        dataToExport.forEach(row => {
            const email = row.createdBy || "Bilinmir";
            const saa = row.details?.executorName || email.split('@')[0];

            if (statsMap.has(email)) {
                statsMap.get(email)!.count += 1;
            } else {
                statsMap.set(email, { SAA: saa, count: 1 });
            }
        });

        const excelData = Array.from(statsMap.values()).map(stat => ({
            "Daxil Edən": stat.SAA,
            "Sayı": stat.count
        }));

        if (excelData.length === 0) {
            toast.error("Seçilmiş kriteriyalara uyğun məlumat tapılmadı.");
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Müfəttiş_Statistika");

        XLSX.writeFile(workbook, `Mufettis_Statistika_${new Date().toISOString().split('T')[0]}.xlsx`);
        setIsExportModalOpen(false);
    };

    /* ── paste handler ── */
    const handlePaste = (e: React.ClipboardEvent) => {
        const text = e.clipboardData.getData("text");
        if (!text) return;

        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length === 0) return;

        // If it's a single line AND doesn't have tabs, it's a normal paste into a focused field
        if (lines.length === 1 && !text.includes("\t")) {
            return;
        }

        e.preventDefault();

        const parsed: EntryRow[] = lines.map(line => {
            const p = line.split("\t").map(x => x.trim());

            if (p.length >= 7) {
                // Layout: Code | Soyad | Ad | Ata Adı | FIN | Seriya | Borc
                return {
                    customer_code: p[0] || "",
                    full_name: toTitleCase([p[1], p[2], p[3]].filter(Boolean).join(" ")),
                    fin: p[4] || "",
                    serial_number: p[5] || "",
                    total_debt: p[6] || "",
                };
            } else if (p.length === 6) {
                // Layout from screenshot: Code | Name | (Blank) | FIN | Seriya | Borc
                return {
                    customer_code: p[0] || "",
                    full_name: toTitleCase(p[1] || ""),
                    fin: p[3] || "",
                    serial_number: p[4] || "",
                    total_debt: p[5] || "",
                };
            } else {
                // Standard Layout: Code | Name | FIN | Seriya | Borc
                return {
                    customer_code: p[0] || "",
                    full_name: toTitleCase(p[1] || ""),
                    fin: p[2] || "",
                    serial_number: p[3] || "",
                    total_debt: p[4] || "",
                };
            }
        }).filter(r => r.customer_code || r.full_name || r.fin);

        if (parsed.length > 0) {
            setRows(prev => {
                const isEmpty = prev.length === 1 && !prev[0].customer_code && !prev[0].full_name;
                return isEmpty ? parsed : [...prev, ...parsed];
            });
            toast.success(`${parsed.length} sətir yapışdırıldı`);
        }
    };

    /* ── cell edit ── */
    const updateCell = (idx: number, key: keyof EntryRow, val: string) => {
        setRows(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], [key]: val };
            return next;
        });
    };

    const removeRow = (idx: number) => {
        if (rows.length <= 1) {
            setRows([{ ...EMPTY_ROW }]);
            return;
        }
        setRows(prev => prev.filter((_, i) => i !== idx));
    };

    /* ── save ── */
    const saveAll = async () => {
        const validRows = rows.filter(r => r.customer_code && r.full_name);
        if (validRows.length === 0) {
            toast.error("Ən azı 1 tam sətir daxil edin");
            return;
        }
        try {
            setSaving(true);
            const finalPayload = [];

            for (const r of validRows) {
                const cleanCode = r.customer_code.trim();
                // Check for duplicates in DB
                const existing = await getCustomer(cleanCode) as any;
                if (existing) {
                    const dateStr = formatAZDate(existing.createdAt);
                    const confirmed = await askConfirmation(
                        `Müştəri ${cleanCode} (${r.full_name}) artıq ${dateStr} tarixində sistemə qeyd edilib.\nYenidən daxil etmək istəyirsiniz ? `
                    );
                    if (!confirmed) continue;
                }

                finalPayload.push({
                    customerCode: cleanCode,
                    fullName: toTitleCase(r.full_name),
                    debtAmount: r.total_debt,
                    process_status: "INSPECTOR_ENTERED" as ProcessStatus,
                    createdBy: user?.email,
                    createdAt: new Date().toISOString(),
                    details: {
                        fin: r.fin,
                        passportSeries: r.serial_number,
                        executorName: user?.displayName || "",
                        isWarningSent: false,
                    },
                });
            }

            if (finalPayload.length === 0) {
                setSaving(false);
                return;
            }

            await bulkAddCustomers(finalPayload, user?.email);
            toast.success(`${finalPayload.length} müştəri yadda saxlanıldı`);
            setRows([{ ...EMPTY_ROW }]);
            fetchHistory();
        } catch (err) {
            console.error(err);
            toast.error("Xəta baş verdi");
        } finally {
            setSaving(false);
        }
    };

    const formatDateTime = (value?: string | Date) => {
        if (!value) return null;

        const date = new Date(value);

        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();

        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");

        return {
            date: `${day} /${month}/${year} `,
            time: `${hours}:${minutes} `,
        };
    };

    /* ── keyboard (Tab on last cell → new row, Enter → next row) ── */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
        if (e.key === "Enter") {
            e.preventDefault();
            // go to same column next row
            if (rowIdx === rows.length - 1) setRows(prev => [...prev, { ...EMPTY_ROW }]);
            setTimeout(() => {
                const next = tableRef.current?.querySelector<HTMLInputElement>(
                    `[data - r= "${rowIdx + 1}"][data - c="${colIdx}"]`
                );
                next?.focus();
            }, 0);
        }
        if (e.key === "Tab" && !e.shiftKey && colIdx === COLUMNS.length - 1) {
            e.preventDefault();
            if (rowIdx === rows.length - 1) setRows(prev => [...prev, { ...EMPTY_ROW }]);
            setTimeout(() => {
                const next = tableRef.current?.querySelector<HTMLInputElement>(
                    `[data - r= "${rowIdx + 1}"][data - c="0"]`
                );
                next?.focus();
            }, 0);
        }
    };

    return (
        <AuthGuard>
            <div className="max-w-[1500px] mx-auto pb-20 px-4" onPaste={handlePaste}>

                {/* ═══ STATS CARDS ═══ */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {selectedInspector !== "ALL" ? "Daxil etdiyi Müştəri" : "Cəmi Müştəri"}
                            </span>
                            <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center">
                                <Users size={18} />
                            </div>
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-2xl font-black text-slate-900 leading-none">{stats.total}</span>
                            <span className="text-[10px] font-bold text-slate-400 mb-0.5 uppercase tracking-tighter">Qeydiyyat</span>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bugünkü Daxilolma</span>
                            <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
                                <Zap size={18} />
                            </div>
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-2xl font-black text-slate-900 leading-none">{stats.todayCount}</span>
                            <span className="text-[10px] font-bold text-slate-400 mb-0.5 uppercase tracking-tighter">İş</span>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tamamlanmış İşlər</span>
                            <div className="h-8 w-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
                                <Shield size={18} />
                            </div>
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-2xl font-black text-slate-900 leading-none">{stats.completedCount}</span>
                            <span className="text-[10px] font-bold text-slate-400 mb-0.5 uppercase tracking-tighter">Arxivdə</span>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sorğu Gözləyən</span>
                            <div className="h-8 w-8 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center">
                                <History size={18} />
                            </div>
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-2xl font-black text-slate-900 leading-none">{stats.waitingCount}</span>
                            <span className="text-[10px] font-bold text-slate-400 mb-0.5 uppercase tracking-tighter">Aktiv</span>
                        </div>
                    </div>
                </div>


                {/* ═══ ENTRY TABLE ═══ */}
                <div ref={tableRef} className="mt-6">
                    <div
                        className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-md transition-shadow"
                        style={{ fontSize: 18 }}
                    >
                        {/* header */}
                        <div
                            className="grid bg-[#fcfdfe] border-b border-slate-200"
                            style={{
                                gridTemplateColumns: `60px ${COLUMNS.map(c => c.width).join(" ")} 50px`,
                            }}
                        >
                            <div className="px-2 py-4.5 text-center text-[14px] font-black text-slate-600 uppercase tracking-widest">#</div>
                            {COLUMNS.map(c => (
                                <div key={c.key} className="px-3 py-4.5 text-[14px] font-black text-slate-800 uppercase tracking-widest">
                                    {c.label}
                                </div>
                            ))}
                            <div />
                        </div>

                        {/* rows */}
                        {rows.map((row, ri) => (
                            <div
                                key={ri}
                                className="grid border-b border-slate-100 last:border-b-0 hover:bg-blue-50/40 transition-colors"
                                style={{
                                    gridTemplateColumns: `60px ${COLUMNS.map(c => c.width).join(" ")} 50px`,
                                }}
                            >
                                <div className="px-2 py-3 flex items-center justify-center text-[14px] font-black text-slate-500">
                                    {ri + 1}
                                </div>
                                {COLUMNS.map((col, ci) => (
                                    <div key={col.key} className="px-1 py-2 flex items-center">
                                        <input
                                            data-r={ri}
                                            data-c={ci}
                                            value={row[col.key]}
                                            maxLength={col.maxLen}
                                            onChange={e => {
                                                let v = e.target.value;
                                                if (col.uppercase) v = v.toUpperCase();

                                                // Handle numeric restriction for debt field
                                                if (col.key === "total_debt") {
                                                    // Allow only digits, dots, and commas
                                                    v = v.replace(/[^0-9.,]/g, "");
                                                    // Convert comma to dot
                                                    v = v.replace(/,/g, ".");
                                                    // Allow only one dot
                                                    const parts = v.split(".");
                                                    if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
                                                }

                                                updateCell(ri, col.key, v);
                                            }}
                                            onBlur={e => {
                                                if (col.key === "full_name") {
                                                    updateCell(ri, col.key, toTitleCase(e.target.value));
                                                }
                                            }}
                                            onKeyDown={e => handleKeyDown(e, ri, ci)}
                                            className="w-full h-12 px-4 rounded-xl border border-border-soft focus:border-blue-500 focus:bg-white focus:shadow-sm outline-none text-[17px] font-black text-slate-900 bg-transparent transition-all"
                                            style={col.uppercase ? { textTransform: "uppercase" } : undefined}
                                        />
                                    </div>
                                ))}
                                <div className="flex items-center justify-center">
                                    <button
                                        onClick={() => removeRow(ri)}
                                        className="text-slate-300 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                                        tabIndex={-1}
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* bottom bar */}
                    <div className="flex items-center justify-between mt-3">
                        <button
                            onClick={() => setRows(prev => [...prev, { ...EMPTY_ROW }])}
                            className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-800 hover:text-slate-600 transition-colors px-3 py-2 rounded-lg hover:bg-slate-100"
                        >
                            <Plus size={14} /> Sətir
                        </button>

                        <div className="flex items-center gap-4">
                            <span className="text-[11px] text-slate-400">
                                {rows.filter(r => r.customer_code).length} / {rows.length} sətir dolu
                            </span>
                            <button
                                onClick={saveAll}
                                disabled={saving}
                                className="flex items-center gap-2 bg-red-600 text-white px-8 py-2.5 rounded-lg text-xs font-bold hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all disabled:opacity-40 active:scale-95"
                            >
                                {saving ? <Zap size={14} className="animate-spin" /> : <Save size={14} />}
                                {saving ? "Saxlanılır..." : "Yadda Saxla"}
                            </button>
                        </div>
                    </div>

                    <p className="text-[10px] font-bold text-slate-600 mt-2 ml-1">
                        Excel-dən kopyalayıb Ctrl+V ilə yapışdırın · Enter = növbəti sətir · Tab = növbəti xana
                    </p>
                </div>

                {/* ═══ HISTORY ═══ */}
                <div className="mt-14">
                    <div className="flex flex-col gap-6 mb-6">
                        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 px-1">
                            <div className="flex items-center gap-2 min-w-max">
                                <History size={20} className="text-slate-400" />
                                <span className="text-lg font-black text-slate-700">
                                    {isLeadOrAdmin ? "Bütün Məlumatlar" : "Daxil etdiklərim"}
                                </span>
                                <span className="bg-slate-100 text-slate-500 text-[11px] font-bold px-2 py-0.5 rounded-full ml-2">
                                    {filteredHistory.length} qeyd
                                </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
                                {/* Search Bar - Integrated into the row */}
                                <div className="relative flex-1 min-w-[200px] max-w-[400px]">
                                    <input
                                        type="text"
                                        placeholder="Axtar..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[13px] font-bold text-slate-800 placeholder:text-slate-400 shadow-sm hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all outline-none"
                                    />
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                </div>

                                {/* Inspector Filter */}
                                {isLeadOrAdmin && (
                                    <div className="relative">
                                        <select
                                            value={selectedInspector}
                                            onChange={(e) => setSelectedInspector(e.target.value)}
                                            className="appearance-none pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-[12px] font-bold text-slate-800 cursor-pointer hover:border-slate-300 transition-all shadow-sm focus:ring-2 focus:ring-blue-500/10 outline-none min-w-[160px]"
                                        >
                                            <option value="ALL">Müfəttişlər</option>
                                            {inspectors.map(email => (
                                                <option key={email} value={email}>{email.split('@')[0]}</option>
                                            ))}
                                        </select>
                                        <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 rotate-90" />
                                    </div>
                                )}

                                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-1 py-1 shadow-sm">
                                    <CustomDatePicker
                                        value={dateRange.start}
                                        onChange={(val) => setDateRange(prev => ({ ...prev, start: val }))}
                                        placeholder="Başlanğıc"
                                    />
                                    <span className="text-slate-200 font-bold">—</span>
                                    <CustomDatePicker
                                        value={dateRange.end}
                                        onChange={(val) => setDateRange(prev => ({ ...prev, end: val }))}
                                        placeholder="Son"
                                    />
                                </div>

                                {(dateRange.start || dateRange.end || selectedInspector !== "ALL" || searchTerm) && (
                                    <button
                                        onClick={() => {
                                            setDateRange({ start: "", end: "" });
                                            setSelectedInspector("ALL");
                                            setSearchTerm("");
                                        }}
                                        className="p-2 text-slate-400 hover:text-red-500 transition-colors bg-white border border-slate-200 rounded-xl shadow-sm"
                                        title="Filteri təmizlə"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                                {isLeadOrAdmin && (
                                    <button
                                        onClick={() => {
                                            setExportStartDate("");
                                            setExportEndDate("");
                                            setExportInspectors([]);
                                            setExportSearchTerm("");
                                            setIsExportModalOpen(true);
                                        }}
                                        className="flex items-center gap-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 px-3 py-2 rounded-xl text-[13px] font-bold transition-colors shadow-sm ml-2"
                                        title="Excel Export"
                                    >
                                        <FileDown size={14} />
                                        <span className="hidden sm:inline">Export</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div
                        className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-md"
                        style={{ fontSize: 18 }}
                    >
                        {/* header - Borc moved after Seriya */}
                        <div
                            className="grid bg-[#fcfdfe] border-b border-slate-200"
                            style={{ gridTemplateColumns: "60px 160px 120px 0.8fr 110px 110px 110px 200px" }}
                        >
                            {["#", "Daxil Edilib", "Kod", "Müştəri (S.A.A)", "FİN", "Seriya", "Borc", "Daxil edən"].map(h => (
                                <div key={h} className="px-4 py-4.5 text-[13px] font-black text-slate-600 uppercase tracking-widest">
                                    {h}
                                </div>
                            ))}
                        </div>

                        {/* body */}
                        {loading ? (
                            <div className="py-10 text-center text-xs text-slate-300 font-bold">Yüklənir...</div>
                        ) : paginatedHistory.length === 0 ? (
                            <div className="py-10 text-center text-xs text-slate-300 font-bold">Məlumat yoxdur</div>
                        ) : (
                            paginatedHistory.map((row: any, idx: number) => (
                                <div
                                    key={row.id || idx}
                                    className="grid border-b border-slate-50 last:border-b-0 hover:bg-slate-50 transition-colors items-center"
                                    style={{ gridTemplateColumns: "60px 160px 120px 0.8fr 110px 110px 110px 200px" }}
                                >
                                    <div className="px-5 py-4 text-[13px] font-black text-slate-400 flex items-center">
                                        {filteredHistory.length - ((currentPage - 1) * itemsPerPage + idx)}
                                    </div>
                                    {(() => {
                                        const formatted = formatDateTime(row.createdAt);

                                        return (
                                            <div className="px-4 py-4 text-[13px] font-semibold text-slate-800 flex flex-col leading-tight">
                                                <span className="text-[12px] font-black">
                                                    {formatted?.date || "-"}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-bold mt-0.5">
                                                    {formatted?.time || ""}
                                                </span>
                                            </div>
                                        );
                                    })()}

                                    <div className="px-4 py-4 text-[14px] font-black text-slate-900 flex items-center">{row.customerCode || "-"}</div>
                                    <div className="px-4 py-4 text-[14px] font-black text-slate-900 flex items-center truncate">{row.fullName || "-"}</div>
                                    <div className="px-4 py-4 text-[13px] font-black text-slate-600 uppercase flex items-center">{row.details?.fin || "-"}</div>
                                    <div className="px-4 py-4 text-[13px] font-black text-slate-600 uppercase flex items-center">{row.details?.passportSeries || "-"}</div>
                                    <div className="px-4 py-4 text-[14px] font-black text-slate-600 flex items-center">{row.debtAmount || "0.00"} ₼</div>
                                    <div className="px-4 py-4 truncate">
                                        <div className="flex flex-col leading-tight">
                                            <span className="text-[11px] font-black text-slate-900 truncate">{row.details?.executorName || row.createdBy?.split('@')[0]}</span>
                                            <span className="text-[9px] font-bold text-slate-400 truncate mt-0.5">{row.createdBy}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-6 px-1">
                            <div className="text-[12px] font-bold text-slate-500">
                                Göstərilir {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredHistory.length)} / {filteredHistory.length} qeyd
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-sm"
                                >
                                    <ChevronLeft size={18} />
                                </button>

                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum;
                                        if (totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (currentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i;
                                        } else {
                                            pageNum = currentPage - 2 + i;
                                        }

                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={`
                                                    w-10 h-10 rounded-xl text-[13px] font-black transition-all shadow-sm
                                                    ${currentPage === pageNum
                                                        ? "bg-blue-600 text-white shadow-blue-200"
                                                        : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                                                    }
                                                `}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-sm"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Duplicate Confirm Modal */}
            <DuplicateConfirmModal
                isOpen={confirmModal?.isOpen || false}
                message={confirmModal?.message || ""}
                onConfirm={confirmModal?.onConfirm || (() => { })}
                onCancel={confirmModal?.onCancel || (() => { })}
            />

            {/* Export Modal */}
            {isExportModalOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsExportModalOpen(false)} />
                    <div className="relative bg-white rounded-3xl p-8 max-w-xl w-full shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
                                <FileDown className="text-emerald-500" />
                                Məlumatları Export Et
                            </h3>
                            <button
                                onClick={() => setIsExportModalOpen(false)}
                                className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-xl transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-6">
                            {/* Date Range */}
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Tarix Aralığı</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="relative">
                                        <input
                                            type="date"
                                            value={exportStartDate}
                                            onChange={(e) => setExportStartDate(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-bold text-slate-700 shadow-sm hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                                        />
                                        <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="date"
                                            value={exportEndDate}
                                            onChange={(e) => setExportEndDate(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-bold text-slate-700 shadow-sm hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                                        />
                                        <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    </div>
                                </div>
                            </div>

                            {/* Inspector Combobox */}
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Müfəttişlər</label>
                                <div className="relative">
                                    <div
                                        className="w-full flex flex-wrap items-center gap-2 pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-bold text-slate-700 shadow-sm hover:border-slate-300 transition-all cursor-pointer min-h-[48px]"
                                        onClick={() => setIsExportComboboxOpen(!isExportComboboxOpen)}
                                    >
                                        {exportInspectors.length === 0 ? (
                                            <span className="text-slate-400">Bütün müfəttişlər</span>
                                        ) : (
                                            exportInspectors.map(email => (
                                                <span key={email} className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg flex items-center gap-1 text-[11px]">
                                                    {email.split('@')[0]}
                                                    <X
                                                        size={12}
                                                        className="cursor-pointer hover:text-red-500"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExportInspectors(prev => prev.filter(i => i !== email));
                                                        }}
                                                    />
                                                </span>
                                            ))
                                        )}
                                        <ChevronRight size={16} className={`absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${isExportComboboxOpen ? 'rotate-[-90deg]' : 'rotate-90'}`} />
                                    </div>

                                    {isExportComboboxOpen && (
                                        <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 shadow-xl rounded-xl z-50 overflow-hidden">
                                            <div className="p-2 border-b border-slate-100">
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        placeholder="Müfəttiş axtar..."
                                                        value={exportSearchTerm}
                                                        onChange={(e) => setExportSearchTerm(e.target.value)}
                                                        className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-bold text-slate-700 outline-none focus:border-blue-500"
                                                    />
                                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                </div>
                                            </div>
                                            <div className="max-h-[200px] overflow-y-auto">
                                                {inspectors.filter(email => email.toLowerCase().includes(exportSearchTerm.toLowerCase())).map(email => {
                                                    const isSelected = exportInspectors.includes(email);
                                                    return (
                                                        <div
                                                            key={email}
                                                            onClick={() => {
                                                                if (isSelected) {
                                                                    setExportInspectors(prev => prev.filter(i => i !== email));
                                                                } else {
                                                                    setExportInspectors(prev => [...prev, email]);
                                                                }
                                                            }}
                                                            className={`px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50/50' : ''}`}
                                                        >
                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                                                                {isSelected && <Check size={12} className="text-white" />}
                                                            </div>
                                                            <span className="text-[13px] font-bold text-slate-700">{email}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-4 mt-8 pt-6 border-t border-slate-100">
                            <button
                                onClick={() => setIsExportModalOpen(false)}
                                className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-black uppercase text-[12px] hover:bg-slate-50 transition-colors shadow-sm tracking-widest"
                            >
                                Ləğv Et
                            </button>
                            <button
                                onClick={handleExcelExport}
                                className="flex-1 px-4 py-3 bg-emerald-500 text-white rounded-xl font-black uppercase text-[12px] hover:bg-emerald-600 hover:shadow-lg hover:shadow-emerald-500/20 transition-all tracking-widest flex items-center justify-center gap-2"
                            >
                                <FileDown size={16} />
                                Export Yarat
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AuthGuard>
    );
}

function DuplicateConfirmModal({ isOpen, message, onConfirm, onCancel }: { isOpen: boolean, message: string, onConfirm: () => void, onCancel: () => void }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white rounded-[2.5rem] p-10 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="h-20 w-20 rounded-3xl bg-amber-50 flex items-center justify-center mx-auto mb-8">
                    <AlertTriangle size={40} className="text-amber-500" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 text-center mb-4 uppercase tracking-tighter">Məlumat mövcuddur</h3>
                <p className="text-slate-600 text-center mb-10 font-medium leading-relaxed">
                    {message.split('\n').map((line, i) => (
                        <span key={i} className="block">{line}</span>
                    ))}
                </p>
                <div className="flex gap-4">
                    <button
                        onClick={onCancel}
                        className="flex-1 h-14 rounded-2xl border border-slate-200 text-slate-500 font-bold hover:bg-slate-50 transition-all font-black uppercase text-[12px] tracking-widest"
                    >
                        Xeyr
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 h-14 rounded-2xl bg-amber-500 text-white font-bold hover:bg-amber-600 shadow-lg shadow-amber-500/20 transition-all font-black uppercase text-[12px] tracking-widest"
                    >
                        Bəli, əlavə et
                    </button>
                </div>
            </div>
        </div>
    );
}