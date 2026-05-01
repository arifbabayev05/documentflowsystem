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
    const { user, can, isSuperAdmin } = useAuth();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<"customers" | "templates">("customers");
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [templateTab, setTemplateTab] = useState<"standart" | "istisna">("standart");

    if (!user || !isSuperAdmin) {
        return (
            <AuthGuard>
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                    <div className="h-16 w-16 rounded-3xl bg-red-50 flex items-center justify-center mb-6">
                        <FileText size={32} className="text-red-400" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Giriş Məhdudlaşdırılıb</h2>
                    <p className="text-slate-600 max-w-[300px]">Bu bölməyə daxil olmaq üçün Yalnız <b>SUPERADMİN</b> icazəniz olmalıdır.</p>
                </div>
            </AuthGuard>
        );
    }

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
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const validFiles = Array.from(files).filter(file => file.name.endsWith(".docx"));
        
        if (validFiles.length !== files.length) {
            toast.error("Yalnız .docx formatında fayllar qəbul edilir. Bəzi fayllar rədd edildi.");
        }

        if (validFiles.length === 0) return;

        toast.loading(`${validFiles.length} şablon yüklənir...`, { id: "upload-template" });

        let successCount = 0;

        for (const file of validFiles) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const blob = new Blob([arrayBuffer]);
                const base64Content = await new Promise<string>((resolve, reject) => {
                    const base64Reader = new FileReader();
                    base64Reader.onloadend = () => {
                        const fullBase64 = base64Reader.result as string;
                        resolve(fullBase64.split(',')[1]);
                    };
                    base64Reader.onerror = reject;
                    base64Reader.readAsDataURL(blob);
                });

                const newTempId = await addTemplate({
                    name: file.name,
                    content: base64Content
                });

                setTemplates(prev => [...prev, {
                    id: newTempId as string,
                    name: file.name,
                    content: base64Content
                }]);
                successCount++;
            } catch (err) {
                console.error(`Upload error for ${file.name}:`, err);
                toast.error(`"${file.name}" yüklənərkən xəta baş verdi`);
            }
        }

        if (successCount > 0) {
            toast.success(`${successCount} şablon uğurla yükləndi`, { id: "upload-template" });
        } else {
            toast.dismiss("upload-template");
        }
        
        // Reset the input value so the same files can be selected again if needed
        e.target.value = '';
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
            <div className="max-w-[1400px] mx-auto space-y-6 pt-10 pb-20 px-4 animate-in fade-in duration-500">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {isSuperAdmin && (
                        <div className="lg:col-span-1 space-y-6">
                            <label className="block w-full cursor-pointer group">
                                <input type="file" accept=".docx" multiple className="hidden" onChange={handleFileUpload} />
                                <div className="w-full py-12 bg-white border-2 border-dashed border-blue-100 rounded-[2.5rem] soft-shadow group-hover:border-primary/30 group-hover:bg-blue-50/30 transition-all flex flex-col items-center justify-center gap-4 text-center px-6">
                                    <div className="h-20 w-20 bg-blue-50 rounded-3xl flex items-center justify-center text-primary transform group-hover:scale-110 group-hover:rotate-12 transition-all duration-300">
                                        <FileType size={36} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-800 uppercase tracking-widest">Yeni Şablon</p>
                                        <p className="text-[11px] text-slate-600 font-bold mt-1">Yalnız .docx format qəbul edilir</p>
                                    </div>
                                    <div className="px-8 py-3 bg-slate-300 rounded-xl text-[11px] font-black uppercase text-slate-600 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">KOMPÜTERDƏN SEÇ</div>
                                </div>
                            </label>
                        </div>
                    )}

                    <div className="lg:col-span-3 space-y-8">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
                            <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                                <FileText className="text-primary" size={28} />
                                Şablonlar
                            </h3>
                            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                                <button
                                    onClick={() => setTemplateTab("standart")}
                                    className={`px-5 py-2.5 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${templateTab === "standart" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                >
                                    Standart
                                </button>
                                <button
                                    onClick={() => setTemplateTab("istisna")}
                                    className={`px-5 py-2.5 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${templateTab === "istisna" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                >
                                    İstisna
                                </button>
                            </div>
                        </div>

                        {templates.filter(t => templateTab === 'istisna' ? t.name.startsWith('Istisna_') : !t.name.startsWith('Istisna_')).length === 0 ? (
                            <div className="bg-white p-32 rounded-[3rem] border border-blue-50 border-dashed text-center flex flex-col items-center gap-6 soft-shadow opacity-40">
                                <FileText size={100} />
                                <p className="text-slate-600 font-black text-lg uppercase tracking-widest font-sans">Şablon tapılmadı</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {templates.filter(t => templateTab === 'istisna' ? t.name.startsWith('Istisna_') : !t.name.startsWith('Istisna_')).map((template) => (
                                    <div key={template.id} className="bg-white p-8 rounded-[2.5rem] border border-blue-100 soft-shadow flex items-center justify-between group hover:border-primary/60 transition-all hover:translate-y-[-2px]">
                                        <div className="flex items-center gap-6">
                                            <div className="h-16 w-16 bg-blue-50/50 text-primary rounded-2xl flex items-center justify-center shadow-sm border border-blue-50 transform group-hover:scale-105 transition-all">
                                                <FileText size={30} />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-lg tracking-tight line-clamp-1">{template.name}</h4>
                                                <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mt-1 font-sans">Sənəd Şablonu</p>
                                            </div>
                                        </div>
                                        {isSuperAdmin && (
                                            <button
                                                onClick={() => handleDeleteTemplate(template.id)}
                                                className="h-12 w-12 flex items-center justify-center text-slate-600 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-slate-300 hover:border-red-100"
                                            >
                                                <Trash2 size={24} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AuthGuard>
    );
}
