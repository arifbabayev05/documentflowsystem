"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Plus, Save, X, Zap, History, Calendar } from "lucide-react";
import { toast } from "sonner";
import { bulkAddCustomers, getInspectorCustomers } from "@/lib/db";
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
    { key: "customer_code", label: "Müştəri Kodu", width: "120px" },
    { key: "full_name", label: "Müştəri (Soyad, Ad, Ata adı)", width: "0.9fr", uppercase: true },
    { key: "fin", label: "FİN", width: "120px", uppercase: true, maxLen: 7 },
    { key: "serial_number", label: "Seriya", width: "125px", uppercase: true },
    { key: "total_debt", label: "Borc (AZN)", width: "130px" },

];

export default function InspectorPage() {
    const { user } = useAuth();
    const [rows, setRows] = useState<EntryRow[]>([{ ...EMPTY_ROW }]);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dateRange, setDateRange] = useState({ start: "", end: "" });
    const tableRef = useRef<HTMLDivElement>(null);

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
        e.preventDefault();

        const parsed: EntryRow[] = lines.map(line => {
            const p = line.split("\t");
            // If the name is spread across p[1], p[2], p[3], join them. 
            // If it's just one field, it will take p[1].
            const possibleFullName = [p[1], p[2], p[3]].filter(Boolean).map(x => x.trim()).join(" ");
            return {
                customer_code: p[0]?.trim() || "",
                full_name: possibleFullName || "",
                total_debt: p[4]?.trim() || "",
                fin: p[5]?.trim() || "",
                serial_number: p[6]?.trim() || "",
            };
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
        const valid = rows.filter(r => r.customer_code && r.full_name);
        if (valid.length === 0) {
            toast.error("Ən azı 1 tam sətir daxil edin");
            return;
        }
        try {
            setSaving(true);
            const payload = valid.map(r => ({
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
            }));
            await bulkAddCustomers(payload, user?.email);
            toast.success(`${payload.length} müştəri yadda saxlanıldı`);
            setRows([{ ...EMPTY_ROW }]);
            fetchHistory();
        } catch {
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
                                                updateCell(ri, col.key, v);
                                            }}
                                            onKeyDown={e => handleKeyDown(e, ri, ci)}
                                            className="w-full  h-12 px-4 rounded-xl border border-border-soft focus:border-blue-500 focus:bg-white focus:shadow-sm outline-none text-[17px] font-black text-slate-900 bg-transparent transition-all"
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
                            <div className="relative group">
                                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="date"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                    className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-[12px] font-bold text-slate-800 outline-none focus:border-slate-400 transition-all shadow-sm"
                                />
                            </div>
                            <span className="text-slate-300 font-bold">—</span>
                            <div className="relative group">
                                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="date"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                    className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-[12px] font-bold text-slate-800 outline-none focus:border-slate-400 transition-all shadow-sm"
                                />
                            </div>
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
                        {/* header */}
                        <div
                            className="grid bg-[#fcfdfe] border-b border-slate-200"
                            style={{ gridTemplateColumns: "60px 160px 120px 1fr 110px 110px 110px 150px" }}
                        >
                            {["#", "Daxil Edilib", "Kod", "Müştəri (S.A.A)", "Borc", "FİN", "Seriya", "Status"].map(h => (
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
                                    style={{ gridTemplateColumns: "60px 160px 120px 1fr 110px 110px 110px 150px" }}
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
                                    <div className="px-4 py-4 text-[14px] font-black text-slate-600 flex items-center">{row.debtAmount || "0.00"} AZN</div>
                                    <div className="px-4 py-4 text-[13px] font-black text-slate-600 uppercase flex items-center">{row.details?.fin || "-"}</div>
                                    <div className="px-4 py-4 text-[13px] font-black text-slate-600 uppercase flex items-center">{row.details?.passportSeries || "-"}</div>
                                    <div className="px-4 py-4">
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
        </AuthGuard>
    );
}
