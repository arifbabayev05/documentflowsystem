"use client";

import { useState, useEffect } from "react";
import {
    FileText,
    Upload,
    Download,
    Loader2,
    CheckCircle2,
    AlertCircle,
    User,
    FileType,
    Plus,
    Trash2
} from "lucide-react";
import { getCustomers } from "@/lib/db";
import { toast } from "sonner";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";

interface Customer {
    id: string;
    firstName: string;
    lastName: string;
    fatherName?: string;
    fin?: string;
    phone?: string;
    email?: string;
    status?: string;
    fullData?: boolean; // Flag to check if "Fill Data" has been run
    details?: any; // The extra data from simulation
}

interface Template {
    id: string;
    name: string;
    content: ArrayBuffer;
}

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState<"customers" | "templates">("customers");
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState<string | null>(null); // ID of customer being processed
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        setIsLoading(true);
        try {
            const data = await getCustomers();
            // Map Firestore data to our interface
            const formatted = data.map((d: any) => ({
                id: d.id,
                firstName: d.firstName || "",
                lastName: d.lastName || "",
                fatherName: d.fatherName || "",
                fin: d.fin || "",
                phone: d.phone || "",
                email: d.email || "",
                status: d.status || "NEW",
                fullData: false
            }));
            setCustomers(formatted);
        } catch (error) {
            console.error("Error fetching customers:", error);
            toast.error("Müştəri məlumatlarını yükləyərkən xəta baş verdi");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFillData = async (customerId: string) => {
        setIsProcessing(customerId);
        // Simulate API Request
        setTimeout(() => {
            setCustomers(prev => prev.map(c => {
                if (c.id === customerId) {
                    return {
                        ...c,
                        fullData: true,
                        details: {
                            address: "Bakı şəhəri, Nəsimi rayonu, Nizami küçəsi 12",
                            passportSeries: "AA",
                            passportNumber: "1234567",
                            issueDate: "01.01.2020",
                            authority: "ASAN Xidmət 1",
                            debtAmount: "1500 AZN",
                            contractNumber: `CNT-${Math.floor(Math.random() * 10000)}`
                        }
                    };
                }
                return c;
            }));
            setIsProcessing(null);
            toast.success("Məlumatlar uğurla yeniləndi");
        }, 1500);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                const newTemplate: Template = {
                    id: Math.random().toString(36).substring(7),
                    name: file.name,
                    content: event.target.result as ArrayBuffer
                };
                setTemplates(prev => [...prev, newTemplate]);
                toast.success(`${file.name} şablonu siyahıya əlavə edildi`);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleDeleteTemplate = (id: string) => {
        setTemplates(prev => prev.filter(t => t.id !== id));
        toast.info("Şablon silindi");
    };

    const openDocumentModal = (customer: Customer) => {
        if (!customer.fullData) {
            toast.warning("Zəhmət olmasa əvvəlcə məlumatları doldurun");
            return;
        }
        if (templates.length === 0) {
            toast.warning("Heç bir şablon tapılmadı. Zəhmət olmasa 'Şablonlar' bölməsindən əlavə edin.");
            return;
        }
        setSelectedCustomer(customer);
        setIsModalOpen(true);
    };

    const generateDocument = (template: Template) => {
        if (!selectedCustomer) return;

        try {
            const zip = new PizZip(template.content);
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
            });

            // Prepare data for template
            const data = {
                firstName: selectedCustomer.firstName,
                lastName: selectedCustomer.lastName,
                fatherName: selectedCustomer.fatherName,
                fin: selectedCustomer.fin,
                phone: selectedCustomer.phone,
                email: selectedCustomer.email,
                address: selectedCustomer.details?.address || "",
                passport: `${selectedCustomer.details?.passportSeries}${selectedCustomer.details?.passportNumber}`,
                issueDate: selectedCustomer.details?.issueDate || "",
                authority: selectedCustomer.details?.authority || "",
                debtAmount: selectedCustomer.details?.debtAmount || "",
                contractNumber: selectedCustomer.details?.contractNumber || "",
                currentDate: new Date().toLocaleDateString("az-AZ")
            };

            doc.render(data);

            const out = doc.getZip().generate({
                type: "blob",
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            });

            saveAs(out, `${selectedCustomer.firstName}_${selectedCustomer.lastName}_${template.name}`);
            toast.success("Sənəd uğurla yaradıldı və yükləndi");
            setIsModalOpen(false);
        } catch (error) {
            console.error("Error generating document:", error);
            toast.error("Sənəd yaradılarkən xəta baş verdi. Şablon formatını yoxlayın.");
        }
    };

    return (
        <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500 pb-24 relative min-h-screen">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-text-main tracking-tight">Sənəd Dövriyyəsi</h1>
                    <p className="text-text-soft font-medium">Müştəri məlumatlarının emalı və sənədlərin avtomatik hazırlanması</p>
                </div>

                <div className="flex bg-gray-100/80 p-1.5 rounded-2xl gap-1">
                    <button
                        onClick={() => setActiveTab("customers")}
                        className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === "customers"
                                ? "bg-white text-text-main shadow-sm"
                                : "text-text-soft hover:text-text-main hover:bg-white/50"
                            }`}
                    >
                        Müştərilər
                    </button>
                    <button
                        onClick={() => setActiveTab("templates")}
                        className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === "templates"
                                ? "bg-white text-text-main shadow-sm"
                                : "text-text-soft hover:text-text-main hover:bg-white/50"
                            }`}
                    >
                        Şablonlar
                    </button>
                </div>
            </div>

            {activeTab === "customers" ? (
                <div className="bg-white rounded-[2.5rem] border border-border-soft soft-shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-border-soft text-left">
                                    <th className="px-8 py-6 text-xs font-black text-text-soft uppercase tracking-wider">Müştəri</th>
                                    <th className="px-8 py-6 text-xs font-black text-text-soft uppercase tracking-wider">FİN / Əlaqə</th>
                                    <th className="px-8 py-6 text-xs font-black text-text-soft uppercase tracking-wider">Status</th>
                                    <th className="px-8 py-6 text-xs font-black text-text-soft uppercase tracking-wider text-right">Əməliyyatlar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-soft/40">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={4} className="py-24 text-center">
                                            <Loader2 className="mx-auto animate-spin text-primary" size={32} />
                                            <p className="mt-4 text-sm font-bold text-text-soft">Yüklənir...</p>
                                        </td>
                                    </tr>
                                ) : customers.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="py-24 text-center text-text-soft font-medium">
                                            Müştəri tapılmadı
                                        </td>
                                    </tr>
                                ) : (
                                    customers.map((customer) => (
                                        <tr key={customer.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-8 py-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                                                        {customer.firstName[0]}{customer.lastName[0]}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-text-main">{customer.firstName} {customer.lastName}</div>
                                                        <div className="text-xs text-text-soft font-medium">{customer.fatherName}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="space-y-1">
                                                    <div className="text-sm font-bold text-text-main">{customer.fin}</div>
                                                    <div className="text-xs text-text-soft font-medium">{customer.phone}</div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                {customer.fullData ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold border border-green-100">
                                                        <CheckCircle2 size={12} />
                                                        Tamamlandı
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full text-xs font-bold border border-yellow-100">
                                                        <AlertCircle size={12} />
                                                        Gözləyir
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {!customer.fullData ? (
                                                        <button
                                                            onClick={() => handleFillData(customer.id)}
                                                            disabled={isProcessing === customer.id}
                                                            className="px-4 py-2 bg-text-main hover:bg-black text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                                                        >
                                                            {isProcessing === customer.id ? (
                                                                <Loader2 size={14} className="animate-spin" />
                                                            ) : (
                                                                <Upload size={14} />
                                                            )}
                                                            Məlumatları Doldur
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => openDocumentModal(customer)}
                                                            className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
                                                        >
                                                            <FileText size={14} />
                                                            Sənəd Yarat
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Template Upload Area */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white p-8 rounded-[2.5rem] border border-border-soft soft-shadow text-center">
                            <div className="h-16 w-16 bg-primary/5 rounded-2xl flex items-center justify-center text-primary mx-auto mb-4">
                                <FileType size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-text-main mb-2">Yeni Şablon</h3>
                            <p className="text-sm text-text-soft font-medium mb-6">
                                .docx formatında hazırlanmış şablonları buradan yükləyin.
                            </p>

                            <label className="block w-full cursor-pointer group">
                                <input type="file" accept=".docx" className="hidden" onChange={handleFileUpload} />
                                <div className="w-full py-4 border-2 border-dashed border-border-soft rounded-2xl group-hover:border-primary/50 group-hover:bg-primary/5 transition-all flex items-center justify-center gap-2 text-sm font-bold text-text-soft group-hover:text-primary">
                                    <Plus size={18} />
                                    Fayl Seçin
                                </div>
                            </label>
                        </div>

                        <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100">
                            <h4 className="flex items-center gap-2 font-bold text-blue-900 mb-4">
                                <AlertCircle size={18} />
                                İstifadı Qaydası
                            </h4>
                            <p className="text-xs font-medium text-blue-800/80 mb-4">
                                Word şablonunuzda aşağıdakı açar sözlərdən istifadə edin:
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                {['{firstName}', '{lastName}', '{fin}', '{phone}', '{address}', '{passport}', '{debtAmount}', '{contractNumber}', '{currentDate}'].map(tag => (
                                    <code key={tag} className="px-2 py-1 bg-white rounded-lg text-[10px] font-mono font-bold text-blue-600 border border-blue-100">
                                        {tag}
                                    </code>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Templates List */}
                    <div className="lg:col-span-2 space-y-4">
                        <h3 className="text-lg font-bold text-text-main px-4">Mövcud Şablonlar ({templates.length})</h3>
                        {templates.length === 0 ? (
                            <div className="bg-white p-12 rounded-[2.5rem] border border-border-soft border-dashed text-center">
                                <p className="text-text-soft font-bold opacity-50">Henüz şablon yüklənməyib</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {templates.map((template) => (
                                    <div key={template.id} className="bg-white p-6 rounded-[2rem] border border-border-soft flex items-center justify-between group hover:border-primary/20 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                                                <FileText size={24} />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-text-main line-clamp-1">{template.name}</h4>
                                                <p className="text-xs text-text-soft font-medium">DOCX Şablon</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteTemplate(template.id)}
                                            className="p-2 text-text-soft hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Template Selection Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
                        <div className="text-center mb-8">
                            <div className="h-16 w-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <FileText size={32} />
                            </div>
                            <h3 className="text-2xl font-black text-text-main">Sənəd Növünü Seçin</h3>
                            <p className="text-text-soft font-medium text-sm mt-1">
                                {selectedCustomer?.firstName} {selectedCustomer?.lastName} üçün hansı sənəd hazırlansın?
                            </p>
                        </div>

                        <div className="space-y-3 mb-8 max-h-[300px] overflow-y-auto pr-2">
                            {templates.map((template) => (
                                <button
                                    key={template.id}
                                    onClick={() => generateDocument(template)}
                                    className="w-full flex items-center justify-between p-4 rounded-2xl border border-border-soft hover:border-primary hover:bg-primary/5 transition-all group text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <FileType size={20} className="text-text-soft group-hover:text-primary transition-colors" />
                                        <span className="font-bold text-text-main">{template.name}</span>
                                    </div>
                                    <Download size={18} className="text-text-soft group-hover:text-primary transition-colors" />
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => setIsModalOpen(false)}
                            className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-text-main font-bold rounded-2xl transition-colors"
                        >
                            Ləğv et
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
