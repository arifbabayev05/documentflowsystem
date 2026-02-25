"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { bulkAddCustomers } from "@/lib/db";
import { Loader2, Database, ArrowLeft, CheckCircle2, AlertTriangle, FileUp } from "lucide-react";
import AuthGuard from "@/components/auth/AuthGuard";

export default function SeedPage() {
    const { user, can } = useAuth();
    const router = useRouter();
    const [inputText, setInputText] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults] = useState<{ success: number; errors: string[] } | null>(null);

    const formatAzTitleCase = (str: string) => {
        if (!str) return "";
        return str.trim().toLowerCase()
            .replace(/i/g, 'i') // Ensure dotted i stays dotted
            .replace(/ı/g, 'ı')
            .split(/\s+/)
            .map(word => {
                if (word.length === 0) return "";
                // Specific handling for Azerbaijani 'i' vs 'ı' at start
                let firstChar = word.charAt(0);
                if (firstChar === 'i') firstChar = 'İ';
                else if (firstChar === 'ı') firstChar = 'I';
                else firstChar = firstChar.toUpperCase();

                return firstChar + word.slice(1);
            })
            .join(' ');
    };

    const processData = async () => {
        if (!inputText.trim()) {
            toast.error("Zəhmət olmasa data daxil edin");
            return;
        }

        setIsProcessing(true);
        setResults(null);

        try {
            const lines = inputText.split("\n").filter(line => line.trim());
            const customersToInsert: any[] = [];
            const errors: string[] = [];

            lines.forEach((line, index) => {
                const parts = line.split("\t").map(p => p.trim());

                // Expected 8 columns based on prompt: ID, Name, Debt, BirthDate, Gender, Passport, FIN, Phone
                if (parts.length < 8) {
                    errors.push(`Sətir ${index + 1}: Sütun sayı azdır (${parts.length}/8). Data: ${line.substring(0, 30)}...`);
                    return;
                }

                const [id, fullName, debtAmount, birthDateRaw, gender, passport, fin, phone] = parts;
                const staticEmail = "aziza.nasirova@abc-telecom.az";

                // Format Date: MM/DD/YYYY to DD.MM.YYYY
                let formattedBirthDate = birthDateRaw;
                if (birthDateRaw.includes("/")) {
                    const dateParts = birthDateRaw.split("/");
                    if (dateParts.length === 3) {
                        const m = dateParts[0].padStart(2, '0');
                        const d = dateParts[1].padStart(2, '0');
                        const y = dateParts[2];
                        formattedBirthDate = `${d}.${m}.${y}`;
                    }
                }

                // Default structure based on user's sample
                const customerData = {
                    customerCode: id,
                    fullName: formatAzTitleCase(fullName),
                    debtAmount: debtAmount.replace(",", "."),
                    process_status: "INSPECTOR_ENTERED",
                    fullData: false,
                    details: {
                        birthDate: formattedBirthDate,
                        executorName: "Əzizə F. Nəsirova",
                        fin: fin.toUpperCase(),
                        gender: gender,
                        passportSeries: passport.toUpperCase(),
                        phone: phone,
                        isWarningSent: false,
                        invoices: [
                            {
                                id: "def",
                                invoiceNumber: "",
                                archiveRequested: false,
                                archiveUrl: "",
                                archiveBase64: "",
                                archiveName: "",
                                orders: [
                                    {
                                        id: "o_def",
                                        productDescription: "",
                                        phoneCount: 1,
                                        contractDate: "",
                                        paymentPeriod: "",
                                        monthlyPayment: "",
                                        initialPayment: "",
                                        paidAmount: "0.00",
                                        totalPrice: "0.00"
                                    }
                                ]
                            }
                        ]
                    }
                };

                customersToInsert.push(customerData);
            });

            if (customersToInsert.length > 0) {
                await bulkAddCustomers(customersToInsert, "aziza.nasirova@abc-telecom.az");
                setResults({ success: customersToInsert.length, errors });
                toast.success(`${customersToInsert.length} müştəri uğurla əlavə edildi`);
                setInputText("");
            } else if (errors.length > 0) {
                setResults({ success: 0, errors });
                toast.error("Heç bir data emal edilə bilmədi");
            }

        } catch (error: any) {
            console.error("Seed error:", error);
            toast.error("Xəta baş verdi: " + error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#f8fafc] p-8">
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => router.back()}
                                className="p-2 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                            >
                                <ArrowLeft size={20} className="text-slate-600" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Bulk Sənəd Daxiletmə</h1>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Excel-dən toplu data idxalı</p>
                            </div>
                        </div>
                    </div>

                    {/* Instruction Card */}
                    <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200 overflow-hidden relative">
                        <div className="relative z-10">
                            <h3 className="text-lg font-black uppercase tracking-tight mb-2">Təlimat</h3>
                            <p className="text-sm opacity-90 leading-relaxed font-medium">
                                Excel faylında olan dataları kopyalayıb aşağıdakı sahəyə yapışdırın.
                                Sütunların ardıcıllığı belə olmalıdır: <br />
                                <span className="bg-white/20 px-1.5 py-0.5 rounded font-black text-[10px] mt-2 inline-block">
                                    Müştəri Kodu (ID) | Ad Soyad Ata Adı | Borc Məbləği | Doğum Tarixi | Cins | Passport Seriya | FİN | Telefon
                                </span>
                            </p>
                        </div>
                        <Database className="absolute -right-8 -bottom-8 opacity-10" size={180} />
                    </div>

                    {/* Main Input */}
                    <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Data Sahəsi (Tab-separated)</label>
                                {inputText.length > 0 && (
                                    <button
                                        onClick={() => setInputText("")}
                                        className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:opacity-70"
                                    >
                                        Təmizlə
                                    </button>
                                )}
                            </div>
                            <textarea
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                placeholder="971447	 ABBASOV RASİF YUSİF	226,1	02/01/1983	Kişi	AZE17911693	4GC9KE0	(050)795-28-92..."
                                className="w-full h-80 bg-slate-50 border border-slate-100 rounded-2xl p-6 text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 transition-all font-mono placeholder:text-slate-300"
                            />

                            <button
                                onClick={processData}
                                disabled={isProcessing || !inputText.trim()}
                                className="w-full bg-slate-900 text-white rounded-2xl py-4 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-xl shadow-slate-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Emal Edilir...
                                    </>
                                ) : (
                                    <>
                                        <FileUp size={18} />
                                        Dataları İdxal Et
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Results Area */}
                    {results && (
                        <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 space-y-6">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                    <Database size={16} className="text-indigo-500" />
                                    Əməliyyat Nəticəsi
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                                            <CheckCircle2 size={24} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Uğurlu</p>
                                            <p className="text-2xl font-black text-slate-900">{results.success} <span className="text-xs text-slate-400">müştəri</span></p>
                                        </div>
                                    </div>

                                    {results.errors.length > 0 && (
                                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-center gap-4">
                                            <div className="h-12 w-12 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-200">
                                                <AlertTriangle size={24} />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Səhvlər</p>
                                                <p className="text-2xl font-black text-slate-900">{results.errors.length} <span className="text-xs text-slate-400">sətir</span></p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {results.errors.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Xəta Detalları</p>
                                        <div className="bg-slate-50 rounded-2xl p-4 max-h-40 overflow-y-auto border border-slate-100">
                                            {results.errors.map((err, i) => (
                                                <p key={i} className="text-[11px] font-bold text-slate-600 border-b border-slate-200/50 py-2 last:border-0 truncate">
                                                    {err}
                                                </p>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="pt-2">
                                    <button
                                        onClick={() => router.push("/dashboard")}
                                        className="w-full bg-slate-100 text-slate-600 rounded-xl py-3 font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all"
                                    >
                                        Dashboard-a qayıt
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AuthGuard>
    );
}
