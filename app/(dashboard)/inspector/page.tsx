"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Plus, Save, X, Zap, History, Calendar, ChevronLeft, ChevronRight, Shield, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bulkAddCustomers, getInspectorCustomers, getCustomer } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";
import { STATUS_LABELS, ProcessStatus } from "../dashboard/page";

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
    { key: "full_name", label: "Müştəri (Soyad, Ad, Ata adı)", width: "0.98fr", uppercase: true },
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
        return `${day}.${month}.${year}`;
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
                                    w-9 h-9 rounded-xl text-[13px] font-semibold transition-all
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

    const tableRef = useRef<HTMLDivElement>(null);

    const formatAZDate = (val: any) => {
        if (!val) return "naməlum";
        let d: Date;
        if (val && typeof val.toDate === 'function') d = val.toDate();
        else d = new Date(val);

        if (isNaN(d.getTime())) return "naməlum";
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}.${month}.${year}`;
    };

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

    /* ── fetch history ── */
    const fetchHistory = useCallback(async () => {
        if (!user?.email) return;
        try {
            setLoading(true);
            const data = await getInspectorCustomers(user.email);
            data.sort((a: any, b: any) =>
                new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );
            setHistory(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [user?.email]);

    useEffect(() => {
        if (user) fetchHistory();
    }, [user, fetchHistory]);

    const filteredHistory = useMemo(() => {
        if (!dateRange.start && !dateRange.end) return history;

        return history.filter(row => {
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

            return true;
        });
    }, [history, dateRange]);

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
                    full_name: [p[1], p[2], p[3]].filter(Boolean).join(" "),
                    fin: p[4] || "",
                    serial_number: p[5] || "",
                    total_debt: p[6] || "",
                };
            } else if (p.length === 6) {
                // Layout from screenshot: Code | Name | (Blank) | FIN | Seriya | Borc
                return {
                    customer_code: p[0] || "",
                    full_name: p[1] || "",
                    fin: p[3] || "",
                    serial_number: p[4] || "",
                    total_debt: p[5] || "",
                };
            } else {
                // Standard Layout: Code | Name | FIN | Seriya | Borc
                return {
                    customer_code: p[0] || "",
                    full_name: p[1] || "",
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
                // Check for duplicates in DB
                const existing = await getCustomer(r.customer_code) as any;
                if (existing) {
                    const dateStr = formatAZDate(existing.createdAt);
                    const confirmed = await askConfirmation(
                        `Müştəri ${r.customer_code} (${r.full_name}) artıq ${dateStr} tarixində sistemə qeyd edilib.\nYenidən daxil etmək istəyirsiniz?`
                    );
                    if (!confirmed) continue;
                }

                finalPayload.push({
                    customerCode: r.customer_code,
                    fullName: r.full_name,
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
            date: `${day}/${month}/${year}`,
            time: `${hours}:${minutes}`,
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
                    `[data-r="${rowIdx + 1}"][data-c="${colIdx}"]`
                );
                next?.focus();
            }, 0);
        }
        if (e.key === "Tab" && !e.shiftKey && colIdx === COLUMNS.length - 1) {
            e.preventDefault();
            if (rowIdx === rows.length - 1) setRows(prev => [...prev, { ...EMPTY_ROW }]);
            setTimeout(() => {
                const next = tableRef.current?.querySelector<HTMLInputElement>(
                    `[data-r="${rowIdx + 1}"][data-c="0"]`
                );
                next?.focus();
            }, 0);
        }
    };

    return (
        <AuthGuard>
            <div className="max-w-[1500px] mx-auto pb-20 px-4" onPaste={handlePaste}>

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
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 px-1">
                        <div className="flex items-center gap-2">
                            <History size={16} className="text-slate-400" />
                            <span className="text-sm font-bold text-slate-600">Daxil etdiklərim</span>
                            <span className="text-[12px] text-slate-600 font-bolder ml-1">({filteredHistory.length})</span>
                        </div>

                        <div className="flex items-center gap-3">
                            <CustomDatePicker
                                value={dateRange.start}
                                onChange={(val) => setDateRange(prev => ({ ...prev, start: val }))}
                                placeholder="Başlanğıc"
                            />
                            <span className="text-slate-300 font-bold">—</span>
                            <CustomDatePicker
                                value={dateRange.end}
                                onChange={(val) => setDateRange(prev => ({ ...prev, end: val }))}
                                placeholder="Son"
                            />
                            {(dateRange.start || dateRange.end) && (
                                <button
                                    onClick={() => setDateRange({ start: "", end: "" })}
                                    className="p-2 text-slate-400 hover:text-red-500 transition-colors bg-white border border-slate-200 rounded-xl shadow-sm"
                                    title="Filteri təmizlə"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div
                        className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-md"
                        style={{ fontSize: 18 }}
                    >
                        {/* header - Borc moved after Seriya */}
                        <div
                            className="grid bg-[#fcfdfe] border-b border-slate-200"
                            style={{ gridTemplateColumns: "60px 160px 120px 0.8fr 110px 110px 110px 150px" }}
                        >
                            {["#", "Daxil Edilib", "Kod", "Müştəri (S.A.A)", "FİN", "Seriya", "Borc", "Status"].map(h => (
                                <div key={h} className="px-4 py-4.5 text-[13px] font-black text-slate-600 uppercase tracking-widest">
                                    {h}
                                </div>
                            ))}
                        </div>

                        {/* body */}
                        {loading ? (
                            <div className="py-10 text-center text-xs text-slate-300">Yüklənir...</div>
                        ) : filteredHistory.length === 0 ? (
                            <div className="py-10 text-center text-xs text-slate-300">Seçilmiş tarixlərdə məlumat yoxdur</div>
                        ) : (
                            filteredHistory.map((row: any, idx: number) => (
                                <div
                                    key={row.id || idx}
                                    className="grid border-b border-slate-50 last:border-b-0 hover:bg-slate-50 transition-colors items-center"
                                    style={{ gridTemplateColumns: "60px 160px 120px 0.8fr 110px 110px 110px 150px" }}
                                >
                                    <div className="px-5 py-4 text-[13px] font-black text-slate-400 flex items-center">{filteredHistory.length - idx}</div>
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
                                    <div className="px-4 py-4 text-[14px] font-black text-slate-900 uppercase flex items-center truncate">{row.fullName || "-"}</div>
                                    <div className="px-4 py-4 text-[13px] font-black text-slate-600 uppercase flex items-center">{row.details?.fin || "-"}</div>
                                    <div className="px-4 py-4 text-[13px] font-black text-slate-600 uppercase flex items-center">{row.details?.passportSeries || "-"}</div>
                                    <div className="px-4 py-4 text-[14px] font-black text-slate-600 flex items-center">{row.debtAmount || "0.00"} ₼</div>
                                    <div className="px-4 py-4 w-100">
                                        <span
                                            className={`text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider ${STATUS_LABELS[row.process_status as ProcessStatus]?.bg || "bg-slate-100"
                                                } ${STATUS_LABELS[row.process_status as ProcessStatus]?.color || "text-slate-500"
                                                }`}
                                        >
                                            {STATUS_LABELS[row.process_status as ProcessStatus]?.label || "Daxil edildi"}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Duplicate Confirm Modal */}
            <DuplicateConfirmModal
                isOpen={confirmModal?.isOpen || false}
                message={confirmModal?.message || ""}
                onConfirm={confirmModal?.onConfirm || (() => { })}
                onCancel={confirmModal?.onCancel || (() => { })}
            />
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