"use client";

import { useState, useEffect } from "react";
import { getCustomers } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";
import { Copy, Loader2, FileCode, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function ExportCodesPage() {
    const { user, can } = useAuth();
    const [codes, setCodes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const fetchCodes = async () => {
            try {
                const data = await getCustomers();
                // Filter out archived customers and extract customerCode
                const extracted = data
                    .filter((c: any) => !c.isArchived)
                    .map((c: any) => c.customerCode || c.id)
                    .filter(Boolean)
                    .sort();
                setCodes(extracted);
            } catch (error) {
                toast.error("Məlumatlar yüklənmədi");
            } finally {
                setLoading(false);
            }
        };

        if (user) {
            fetchCodes();
        }
    }, [user]);

    const handleCopy = () => {
        const text = codes.join("\n");
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Bütün kodlar kopyalandı!");
        setTimeout(() => setCopied(false), 2000);
    };

    if (!user || (!can("page_customers") && user.role !== "SUPERADMIN")) {
        return <AuthGuard><div className="p-12 text-center opacity-50">Girişə icazə yoxdur</div></AuthGuard>;
    }

    return (
        <AuthGuard>
            <div className="max-w-4xl mx-auto py-12 px-6">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
                            <FileCode size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Müştəri Kodları</h1>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Bütün aktiv kodların siyahısı</p>
                        </div>
                    </div>

                    {codes.length > 0 && (
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl active:scale-95"
                        >
                            {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                            {copied ? "Kopyalandı" : "Hamısını Kopyala"}
                        </button>
                    )}
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden relative">
                    {loading ? (
                        <div className="h-[500px] flex flex-col items-center justify-center text-slate-400 opacity-50">
                            <Loader2 size={32} className="animate-spin mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Məlumatlar emal olunur...</p>
                        </div>
                    ) : (
                        <div className="p-6">
                            <div className="mb-4 flex items-center justify-between px-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Cəmi: {codes.length} Müştəri Kodu
                                </span>
                            </div>
                            <textarea
                                readOnly
                                value={codes.join("\n")}
                                className="w-full h-[600px] bg-slate-50 border border-slate-100 rounded-2xl p-6 font-mono text-sm text-slate-700 outline-none resize-none custom-scrollbar"
                                placeholder="Kodlar burada görünəcək..."
                            />
                        </div>
                    )}
                </div>
            </div>
        </AuthGuard>
    );
}
