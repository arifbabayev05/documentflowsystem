"use client";

import { useState, useEffect } from "react";
import { getCustomers, moveCustomer } from "@/lib/db";
import { AlertCircle, User, Code, ArrowRight, RefreshCw, CheckCircle2 } from "lucide-react";
import AuthGuard from "@/components/auth/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function DebugDuplicatesPage() {
    const { user } = useAuth();
    const [duplicates, setDuplicates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [fixingId, setFixingId] = useState<string | null>(null);

    const check = async () => {
        setLoading(true);
        const all = await getCustomers() as any[];
        const map: Record<string, any[]> = {};

        all.forEach(c => {
            const code = (c.customerCode || "").toString().trim();
            if (code) {
                if (!map[code]) map[code] = [];
                map[code].push(c);
            }
        });

        const found: any[] = [];
        Object.keys(map).forEach(code => {
            if (map[code].length > 1) {
                found.push({ code, items: map[code].map(item => ({ ...item, editedCode: item.customerCode })) });
            }
        });

        setDuplicates(found);
        setLoading(false);
    };

    useEffect(() => {
        check();
    }, []);

    const handleFix = async (item: any) => {
        if (!user?.email) return;
        if (item.editedCode === item.customerCode) {
            toast.error("Zəhmət olmasa yeni fərqli kod daxil edin");
            return;
        }

        try {
            setFixingId(item.id);
            await moveCustomer(item.id, item.editedCode, user.email);
            toast.success(`Müştəri yeni koda keçirildi: ${item.editedCode}`);
            await check();
        } catch (e: any) {
            toast.error(e.message || "Xəta baş verdi");
        } finally {
            setFixingId(null);
        }
    };

    const updateEditedCode = (groupIndex: number, itemIndex: number, newCode: string) => {
        setDuplicates(prev => {
            const next = [...prev];
            next[groupIndex].items[itemIndex].editedCode = newCode;
            return next;
        });
    };

    return (
        <AuthGuard>
            <div className="max-w-4xl mx-auto py-12 px-4">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 mb-2">Dublikat Müştəri Kodları</h1>
                        <p className="text-slate-500 font-medium">Sistemdə eyni kodla qeydiyyatdan keçmiş bütün müştərilər aşağıda göstərilir.</p>
                    </div>
                    <button
                        onClick={check}
                        className="h-12 w-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-200 transition-all shadow-sm"
                        title="Yenilə"
                    >
                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center gap-3 text-slate-400 font-bold animate-pulse">
                        <div className="h-5 w-5 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
                        Məlumatlar yoxlanılır...
                    </div>
                ) : duplicates.length === 0 ? (
                    <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl text-emerald-700 flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                            <CheckCircle2 size={24} />
                        </div>
                        <div>
                            <p className="font-black uppercase tracking-tight">Dublikat tapılmadı</p>
                            <p className="text-sm opacity-80">Bütün müştəri kodları unikaldır.</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-10">
                        {duplicates.map((group, gIdx) => (
                            <div key={gIdx} className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                                <div className="bg-slate-50 px-8 py-5 border-b border-slate-200 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-xl bg-slate-200 flex items-center justify-center text-slate-500">
                                            <Code size={16} />
                                        </div>
                                        <span className="text-sm font-black text-slate-900 uppercase tracking-widest">KOD: {group.code}</span>
                                    </div>
                                    <span className="bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider">{group.items.length} Müştəri</span>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {group.items.map((item: any, iIdx: number) => (
                                        <div key={iIdx} className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-slate-50/50 transition-colors">
                                            <div className="flex items-center gap-5 flex-1">
                                                <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xl">
                                                    {iIdx + 1}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-black text-slate-900 truncate text-lg uppercase tracking-tight">{item.fullName}</p>
                                                    <p className="text-xs text-slate-400 font-bold mt-1">ID: <span className="text-slate-500">{item.id}</span> • Daxil edən: <span className="text-slate-500">{item.createdBy || "Naməlum"}</span></p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
                                                <input
                                                    type="text"
                                                    value={item.editedCode}
                                                    onChange={(e) => updateEditedCode(gIdx, iIdx, e.target.value)}
                                                    className="w-32 px-4 py-2 rounded-xl bg-slate-50 border-none text-sm font-black text-slate-800 focus:ring-2 focus:ring-blue-500/20 outline-none"
                                                    placeholder="Yeni Kod"
                                                />
                                                <button
                                                    onClick={() => handleFix(item)}
                                                    disabled={fixingId === item.id || item.editedCode === item.customerCode}
                                                    className="h-10 px-6 rounded-xl bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-30 disabled:grayscale transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                                                >
                                                    {fixingId === item.id ? "..." : "Həll Et"}
                                                </button>
                                                <button
                                                    onClick={() => window.open(`/dashboard?search=${item.id}`, '_blank')}
                                                    className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all"
                                                    title="Dashboard-da gör"
                                                >
                                                    <ArrowRight size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-12 p-8 bg-slate-900 rounded-[2.5rem] text-white shadow-xl shadow-slate-900/20">
                    <div className="flex items-center gap-3 mb-4">
                        <AlertCircle size={20} className="text-blue-400" />
                        <h4 className="font-black uppercase text-[12px] tracking-widest text-slate-200">Təlimat</h4>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed font-medium">
                        Dublikatları təmizləmək üçün siyahıdakı müştərilərdən birinin kodunu dəyişərək <b>"Həll Et"</b> düyməsinə klikləyin.
                        Məsələn, əgər kod <i>"644167"</i> dublikatdırsa, birini <i>"644167-2"</i> edə bilərsiniz.
                        Sistem avtomatik olaraq keçmiş qeydi yeni ID ilə əvəzləyəcək.
                    </p>
                </div>
            </div>
        </AuthGuard>
    );
}
