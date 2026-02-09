"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
    FileText,
    Loader2,
    Search,
    X,
    User,
    ArrowRight,
    FileType,
    Trash2,
} from "lucide-react";
import { getCustomers, getTemplates, addTemplate, deleteTemplate } from "@/lib/db";
import { toast } from "sonner";
import AuthGuard from "@/components/auth/AuthGuard";
import { useAuth } from "@/hooks/useAuth";

interface Customer {
    id: string;
    customerCode: string;
    fullName: string;
    debtAmount: string;
}

interface Template {
    id: string;
    name: string;
    content: string;
}

export default function ReportsPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<"customers" | "templates">("customers");
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setIsLoading(true);
        try {
            const [custData, tempData] = await Promise.all([
                getCustomers(),
                getTemplates()
            ]);

            setCustomers(custData.map((d: any) => ({
                id: d.id,
                customerCode: d.customerCode || d.details?.fin || "",
                fullName: d.fullName || "Adsız Müştəri",
                debtAmount: d.debtAmount || "0.00"
            })));

            setTemplates(tempData as Template[]);
        } catch (error) {
            console.error("Error fetching data:", error);
            toast.error("Məlumatları yükləyərkən xəta baş verdi");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith(".docx")) {
            toast.error("Yalnız .docx formatında fayllar qəbul edilir");
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const arrayBuffer = event.target?.result as ArrayBuffer;

                // Convert ArrayBuffer to Base64 safely
                const blob = new Blob([arrayBuffer]);
                const base64Reader = new FileReader();
                base64Reader.onloadend = async () => {
                    const fullBase64 = base64Reader.result as string;
                    const base64Content = fullBase64.split(',')[1];

                    const newTemp = await addTemplate({
                        name: file.name,
                        content: base64Content
                    });

                    setTemplates(prev => [...prev, newTemp as Template]);
                    toast.success(`${file.name} şablonu yaddaşa əlavə edildi`);
                };
                base64Reader.readAsDataURL(blob);
            } catch (err) {
                console.error("Upload error:", err);
                toast.error("Fayl yüklənərkən xəta baş verdi");
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleDeleteTemplate = async (id: string) => {
        try {
            await deleteTemplate(id);
            setTemplates(prev => prev.filter(t => t.id !== id));
            toast.info("Şablon silindi");
        } catch (err) {
            toast.error("Silərkən xəta baş verdi");
        }
    };

    const filteredCustomers = useMemo(() => {
        const lowSearch = searchTerm.toLowerCase();
        return customers.filter(c =>
            !searchTerm ||
            c.fullName.toLowerCase().includes(lowSearch) ||
            c.customerCode.toLowerCase().includes(lowSearch)
        );
    }, [customers, searchTerm]);

    return (
        <AuthGuard>
            <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500 pb-24 relative min-h-screen px-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-blue-100">
                    <div className="space-y-1 text-center lg:text-left">
                        <h1 className="text-3xl lg:text-4xl font-black text-slate-800 tracking-tight">Sənəd Dövriyyəsi</h1>
                        <p className="text-slate-500 font-medium text-sm lg:text-base italic">Müştəri seçin və sənədləri sürətli hazırlayın</p>
                    </div>

                    <div className="flex bg-slate-100/50 p-1.5 rounded-[1.2rem] gap-1 self-center lg:self-auto border border-blue-50">
                        <button
                            onClick={() => setActiveTab("customers")}
                            className={`px-8 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === "customers" ? "bg-white text-primary shadow-sm border border-blue-100" : "text-slate-500 hover:text-primary hover:bg-white/50"}`}
                        >
                            Müştəri Seçimi
                        </button>
                        <button
                            onClick={() => setActiveTab("templates")}
                            className={`px-8 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === "templates" ? "bg-white text-primary shadow-sm border border-blue-100" : "text-slate-500 hover:text-primary hover:bg-white/50"}`}
                        >
                            Şablonlar
                        </button>
                    </div>
                </div>

                {activeTab === "customers" ? (
                    <div className="space-y-8">
                        {/* Search Bar */}
                        <div className="max-w-2xl mx-auto">
                            <div className="relative group">
                                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={24} />
                                <input
                                    type="text"
                                    placeholder="Müştəri axtar (Ad, Soyad, FİN)..."
                                    className="w-full pl-16 pr-12 py-6 bg-white rounded-[2.5rem] border border-blue-100 soft-shadow focus:border-primary/20 focus:ring-8 focus:ring-primary/5 outline-none transition-all font-bold text-lg"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <button onClick={() => setSearchTerm("")} className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors">
                                        <X size={20} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="py-40 text-center flex flex-col items-center gap-6">
                                <Loader2 className="animate-spin text-primary" size={60} />
                                <p className="text-sm font-black text-slate-500 uppercase tracking-widest animate-pulse">Məlumatlar Yüklenir...</p>
                            </div>
                        ) : filteredCustomers.length === 0 ? (
                            <div className="py-40 text-center opacity-20 flex flex-col items-center gap-6">
                                <Search size={100} />
                                <p className="text-3xl font-black uppercase tracking-widest italic">Nəticə Tapılmadı</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {filteredCustomers.map((customer) => (
                                    <button
                                        key={customer.id}
                                        onClick={() => router.push(`/reports/generate?id=${customer.id}`)}
                                        className="bg-white p-8 rounded-[2.5rem] border border-blue-50 soft-shadow hover:border-primary/30 hover:shadow-2xl hover:translate-y-[-4px] transition-all group text-left relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/[0.02] rounded-full translate-x-16 -translate-y-16 group-hover:scale-150 transition-transform duration-500" />

                                        <div className="flex flex-col h-full gap-6 relative">
                                            <div className="flex items-center justify-between">
                                                <div className="h-14 w-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 group-hover:bg-primary group-hover:text-white group-hover:border-transparent transition-all">
                                                    <User size={28} className="stroke-[2.5px]" />
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">FİN</span>
                                                    <span className="text-sm font-black text-slate-800 tracking-widest group-hover:text-primary transition-colors bg-slate-50 px-2 py-1 rounded-lg border border-blue-50/50">{customer.customerCode || "-"}</span>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-tight line-clamp-2 min-h-[3.5rem] group-hover:text-primary transition-colors">
                                                    {customer.fullName}
                                                </h3>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sənəd Hazırlanıla bilər</span>
                                                </div>
                                            </div>

                                            <div className="pt-4 border-t border-blue-50 mt-auto flex items-center justify-between">
                                                <span className="text-primary font-black text-xs uppercase tracking-widest group-hover:translate-x-1 transition-transform flex items-center gap-2">
                                                    SEÇİM ET <ArrowRight size={14} className="stroke-[3px]" />
                                                </span>
                                                <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                                    <FileText size={18} className="text-primary" />
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        <div className="lg:col-span-1 space-y-6">
                            <label className="block w-full cursor-pointer group">
                                <input type="file" accept=".docx" className="hidden" onChange={handleFileUpload} />
                                <div className="w-full py-12 bg-white border-2 border-dashed border-blue-100 rounded-[2.5rem] soft-shadow group-hover:border-primary/30 group-hover:bg-blue-50/30 transition-all flex flex-col items-center justify-center gap-4 text-center px-6">
                                    <div className="h-20 w-20 bg-blue-50 rounded-3xl flex items-center justify-center text-primary transform group-hover:scale-110 group-hover:rotate-12 transition-all duration-300">
                                        <FileType size={36} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-800 uppercase tracking-widest">Yeni Şablon</p>
                                        <p className="text-[11px] text-slate-500 font-bold mt-1">Yalnız .docx format qəbul edilir</p>
                                    </div>
                                    <div className="px-8 py-3 bg-slate-100 rounded-xl text-[11px] font-black uppercase text-slate-500 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">KOMPÜTERDƏN SEÇ</div>
                                </div>
                            </label>
                        </div>

                        <div className="lg:col-span-3 space-y-8">
                            <div className="flex items-center justify-between px-2">
                                <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                                    <FileText className="text-primary" size={28} />
                                    Mövcud Şablonlar
                                </h3>
                                <span className="text-[12px] bg-blue-50 text-primary px-5 py-2 rounded-full border border-blue-100 font-black uppercase tracking-widest">{templates.length} Sənəd</span>
                            </div>

                            {templates.length === 0 ? (
                                <div className="bg-white p-32 rounded-[3rem] border border-blue-50 border-dashed text-center flex flex-col items-center gap-6 soft-shadow opacity-40">
                                    <FileText size={100} />
                                    <p className="text-slate-500 font-black text-lg uppercase tracking-widest font-sans">Şablon tapılmadı</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {templates.map((template) => (
                                        <div key={template.id} className="bg-white p-8 rounded-[2.5rem] border border-blue-50 soft-shadow flex items-center justify-between group hover:border-primary/20 transition-all hover:translate-y-[-2px]">
                                            <div className="flex items-center gap-6">
                                                <div className="h-16 w-16 bg-blue-50/50 text-primary rounded-2xl flex items-center justify-center shadow-sm border border-blue-50 transform group-hover:scale-105 transition-all">
                                                    <FileText size={30} />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 text-lg tracking-tight line-clamp-1">{template.name}</h4>
                                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1 font-sans">Sənəd Şablonu</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteTemplate(template.id)}
                                                className="h-12 w-12 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                                            >
                                                <Trash2 size={24} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
