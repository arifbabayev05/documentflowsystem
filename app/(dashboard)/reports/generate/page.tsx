"use client";

import { useState, useEffect, Suspense, useMemo, useCallback, useRef, memo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    FileText,
    Download,
    Loader2,
    Save,
    User,
    CheckCircle2,
    ArrowLeft,
    Database,
    Search,
    ChevronDown,
    Building2,
    Scale,
    AlertTriangle,
    Edit3,
    Eye,
    Info,
    Smartphone,
    MapPin,
    Calendar,
    DollarSign,
    Box,
    Printer,
    Check,
    AlignLeft,
    CreditCard,
    Shield
} from "lucide-react";
import {
    getCustomer,
    getTemplates,
    updateCustomer,
    addAuditLog,
    getCourts,
    getGlobalSettings
} from "@/lib/db";
import { toast } from "sonner";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";
import AuthGuard from "@/components/auth/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import { numberToAzerbaijaniFinancialWords } from "@/lib/format";

/** Internal helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

// --- Interfaces ---

interface Customer {
    id: string;
    customerCode: string;
    fullName: string;
    debtAmount: string;
    fullData?: boolean;
    details?: {
        address?: string;
        actualAddress?: string;
        phone?: string;
        gender?: string;
        passportSeries?: string;
        passportNumber?: string;
        issueDate?: string;
        authority?: string;
        contractNumber?: string;
        contractDate?: string;
        itemModel?: string;
        paymentPeriod?: string;
        monthlyPayment?: string;
        initialPayment?: string;
        totalPrice?: string;
        paidAmount?: string;
        unpaidAmount?: string;
        fee?: string;
        penalty?: string;
        totalUnpaid?: string;
        fin?: string;
        birthDate?: string;
        representativeFin?: string;
        installmentMonths?: string;
        courtFee?: string;
    };
}

interface Template {
    id: string;
    name: string;
    content?: string;
}

interface Court {
    id: string;
    name: string;
    address: string;
    phone: string;
    fax: string;
}

interface CompanyInfo {
    companyName: string;
    address: string;
    phone: string;
    fax: string;
    representative: string;
}

// --- Components ---

const CustomerField = memo(({ label, icon: Icon, value, onChange, placeholder, isFin, isPrice, isSelect, options }: any) => {
    return (
        <div className="space-y-1.5 group">
            <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-primary">
                {Icon && <Icon size={11} />}
                {label}
            </label>
            {isSelect ? (
                <select
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none transition-all font-bold text-sm shadow-sm focus:border-primary/30 focus:ring-4 focus:ring-primary/5 text-slate-700 appearance-none"
                >
                    <option value="">Seçin</option>
                    {options?.map((opt: any) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            ) : (
                <input
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder || "-"}
                    className={cn(
                        "w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none transition-all font-bold text-sm shadow-sm",
                        "focus:border-primary/30 focus:ring-4 focus:ring-primary/5",
                        isPrice ? "text-primary font-black" : "text-slate-700",
                        isFin ? "uppercase tracking-widest font-black" : ""
                    )}
                />
            )}
        </div>
    );
});
CustomerField.displayName = "CustomerField";

const DocumentPreview = ({ template, customer, companyInfo, selectedCourt, onDownload, isGenerating }: any) => {
    const [isRendering, setIsRendering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const viewerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const renderPreview = async () => {
            if (!template?.content || !viewerRef.current) {
                return;
            }

            setIsRendering(true);
            setError(null);

            try {
                // Advanced Robust Base64 to ArrayBuffer conversion
                const secureAtob = (base64: string) => {
                    const cleanBase64 = base64.trim().replace(/\s/g, '');
                    const binaryString = window.atob(cleanBase64);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    return bytes;
                };

                const bytes = secureAtob(template.content);
                let doc;
                try {
                    const zip = new PizZip(bytes);
                    doc = new Docxtemplater(zip, {
                        paragraphLoop: true,
                        linebreaks: true,
                        delimiters: { start: "{{", end: "}}" },
                        nullGetter: () => ""
                    });
                } catch (err: any) {
                    console.error("Docxtemplater Init Error:", err);
                    setError("Şablon sintaksis xətası: " + (err.message || "Bilinməyən xəta"));
                    setIsRendering(false);
                    return;
                }

                const debtNum = parseFloat(customer.details?.totalUnpaid || customer.debtAmount || "0");
                const totalPrice = parseFloat(customer.details?.totalPrice || "0");
                const paidAmount = parseFloat(customer.details?.paidAmount || "0");

                // Map system data to user's .docx template tags
                const data = {
                    MEHKEME_ADI: selectedCourt?.name || "",
                    MEHKEME_UNVAN: selectedCourt?.address || "",
                    MEHKEME_TELEFON: selectedCourt?.phone || "",
                    MEHKEME_FAKS: selectedCourt?.fax || "",
                    IDDIACININ_ADI: companyInfo?.companyName || "",
                    IDDIACI_UNVAN: companyInfo?.address || "",
                    IDDIACI_TELEFON: companyInfo?.phone || "",
                    IDDIACI_FAKS: companyInfo?.fax || "",
                    NUMAYENDE_AD_SOYAD: companyInfo?.representative || "",
                    NUMAYENDE_FIN: customer.details?.representativeFin || "",
                    CAVABDEH_AD_SOYAD: customer.fullName || "",
                    CAVABDEH_DOGUM_TARIXI: customer.details?.birthDate || "",
                    CAVABDEH_FIN: customer.details?.fin || "",
                    CAVABDEH_UNVAN: customer.details?.actualAddress || customer.details?.address || "",
                    CAVABDEH_MOBIL: customer.details?.phone || "",
                    MUQAVILE_TARIXI: customer.details?.contractDate || "",
                    MEHSUL_IMEI_SIYAHI: customer.details?.itemModel || "",
                    UMUMI_BORC: debtNum.toFixed(2),
                    UMUMI_BORC_SOZLE: numberToAzerbaijaniFinancialWords(debtNum),
                    ALQI_SATQI_QIYMETI: totalPrice.toFixed(2),
                    ALQI_SATQI_QIYMETI_SOZLE: numberToAzerbaijaniFinancialWords(totalPrice),
                    TAKSIT_AY: customer.details?.paymentPeriod || "",
                    AYLIQ_ODENIS: customer.details?.monthlyPayment || "",
                    ILKIN_ODENIS: customer.details?.initialPayment || "",
                    ODENILMEMIS_HISSE: (totalPrice - paidAmount).toFixed(2),
                    ODENILMEMIS_HISSE_SOZLE: numberToAzerbaijaniFinancialWords(totalPrice - paidAmount),
                    ILM_RUSUM: customer.details?.fee || "",
                    ILM_RUSUM_SOZLE: numberToAzerbaijaniFinancialWords(parseFloat(customer.details?.fee || "0")),
                    DEBBE_PULU: customer.details?.penalty || "",
                    DEBBE_PULU_SOZLE: numberToAzerbaijaniFinancialWords(parseFloat(customer.details?.penalty || "0")),
                    currentDate: new Date().toLocaleDateString("az-AZ"),
                };

                try {
                    doc.render(data);
                    const out = doc.getZip().generate({ type: "arraybuffer" });

                    // Use docx-preview for high-fidelity rendering
                    const { renderAsync } = await import("docx-preview");
                    if (viewerRef.current) {
                        viewerRef.current.innerHTML = ""; // Clear previous content
                        await renderAsync(out, viewerRef.current, undefined, {
                            className: "docx-viewer",
                            inWrapper: false,
                            ignoreWidth: true,
                            ignoreHeight: true,
                            ignoreFonts: false,
                            breakPages: true,
                            experimental: true,
                            trimXmlDeclaration: true,
                        });
                    }
                } catch (err: any) {
                    console.error("Docxtemplater Render Error:", err);
                    setError("Sənəd emal edilərkən xəta baş verdi.");
                }
            } catch (err) {
                console.error("General preview error:", err);
                setError("Gözlənilməz xəta!");
            } finally {
                setIsRendering(false);
            }
        };

        const timer = setTimeout(renderPreview, 300);
        return () => clearTimeout(timer);
    }, [template, customer, companyInfo, selectedCourt]);

    return (
        <div id={`doc-${template.id}`} className="doc-page bg-white shadow-[0_24px_60px_-12px_rgba(0,0,0,0.12)] border border-slate-200 rounded-sm min-h-[1122px] w-[794px] mx-auto relative mb-12 transition-all hover:shadow-[0_32px_80px_-16px_rgba(0,0,0,0.15)] group font-sans overflow-hidden">
            <div className="absolute top-8 right-8 opacity-0 group-hover:opacity-100 transition-all flex gap-3 z-30">
                <button
                    onClick={() => onDownload(template)}
                    disabled={isGenerating === template.id}
                    className="p-3 bg-slate-800 text-white rounded-xl shadow-xl hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-50"
                >
                    {isGenerating === template.id ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                </button>
            </div>

            {isRendering && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center gap-4 animate-in fade-in duration-300">
                    <Loader2 className="animate-spin text-primary opacity-30" size={32} />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sənəd Hazırlanır...</p>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex items-center justify-center p-10 z-10 bg-red-50/50">
                    <div className="text-center space-y-4">
                        <div className="inline-flex p-4 bg-red-100 text-red-600 rounded-full"><AlertTriangle size={32} /></div>
                        <p className="text-xs font-bold text-red-600 uppercase tracking-widest">{error}</p>
                    </div>
                </div>
            )}

            <div className="preview-container">
                <div ref={viewerRef} className="docx-wrapper-custom" />
            </div>

            <style jsx global>{`
                .preview-container {
                    width: 100%;
                    background: white;
                    min-height: 1122px;
                }
                .docx-viewer {
                    padding: 0 !important;
                    background: white !important;
                }
                .docx-viewer > section.docx {
                    padding: 0 !important;
                    width: 100% !important;
                    box-shadow: none !important;
                    margin-bottom: 0 !important;
                }
                /* Let docx-preview handle the margins and spacing from the file */
                .docx-viewer article {
                    padding: 2.54cm !important; /* Standard fallback if file lacks margins */
                    box-sizing: border-box;
                    min-height: 297mm;
                }
                .docx-wrapper-custom {
                    font-family: 'Times New Roman', Times, serif !important;
                }
                /* Improved Page look */
                .docx-viewer section.docx {
                    background: white !important;
                }
            `}</style>
        </div>
    );
};

// --- Main Workspace ---

function GenerateDocumentContent() {
    const searchParams = useSearchParams();
    const id = searchParams.get('id');
    const router = useRouter();
    const { user } = useAuth();

    const [customer, setCustomer] = useState<Customer | null>(null);
    const [allTemplates, setAllTemplates] = useState<Template[]>([]);
    const [courts, setCourts] = useState<Court[]>([]);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeDocId, setActiveDocId] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState<string | null>(null);

    const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
    const [courtSearch, setCourtSearch] = useState("");
    const [isCourtDropdownOpen, setIsCourtDropdownOpen] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (id) {
            fetchData();
        } else {
            router.push("/reports");
        }
    }, [id]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [custData, tempData, courtsData, settingsData] = await Promise.all([
                getCustomer(id as string),
                getTemplates(),
                getCourts(),
                getGlobalSettings()
            ]);

            if (custData) {
                setCustomer(custData as Customer);
                setAllTemplates(tempData as Template[]);
                setCourts(courtsData as Court[]);
                setCompanyInfo(settingsData as CompanyInfo);

                if (tempData.length > 0) setActiveDocId(tempData[0].id);
            } else {
                toast.error("Müştəri tapılmadı");
                router.push("/reports");
            }
        } catch (error) {
            console.error(error);
            toast.error("Məlumatlar yüklənmədi");
        } finally {
            setIsLoading(false);
        }
    };

    const filteredTemplates = useMemo(() => {
        if (!customer) return [];
        const debt = parseFloat(customer.details?.totalUnpaid || customer.debtAmount || "0");

        return allTemplates.filter(t => {
            const name = t.name.toLowerCase();
            if (name.includes("məhkəmə ərizəsi") || name.includes("ödəniş cədvəli")) {
                if (debt <= 5000) {
                    return name.includes("(5000-)") || name.includes("(5000 - )");
                } else {
                    return (name.includes("(5000)") || name.includes("(5000 + )")) && !name.includes("(5000-)");
                }
            }
            return true;
        }).sort((a, b) => {
            const getNum = (s: string) => {
                const m = s.match(/^(\d+)/);
                return m ? parseInt(m[1]) : 999;
            };
            return getNum(a.name) - getNum(b.name);
        });
    }, [allTemplates, customer]);

    const handleScroll = useCallback(() => {
        if (!scrollContainerRef.current) return;
        const docs = scrollContainerRef.current.querySelectorAll('.doc-page');
        let currentId = activeDocId;

        docs.forEach((doc) => {
            const rect = doc.getBoundingClientRect();
            if (rect.top >= 0 && rect.top <= window.innerHeight / 2) {
                currentId = doc.id.replace('doc-', '');
            }
        });

        if (currentId !== activeDocId) {
            setActiveDocId(currentId);
        }
    }, [activeDocId]);

    const handleFieldChange = (path: string, value: string) => {
        if (!customer) return;
        setCustomer(prev => {
            if (!prev) return null;
            const newData = { ...prev };
            const details = { ...(newData.details || {}) };

            // Nested path handling
            if (path.includes('.')) {
                const parts = path.split('.');
                (details as any)[parts[1]] = value;
            } else {
                (details as any)[path] = value;
            }

            newData.details = details;
            // Mirror debtAmount if totalUnpaid is updated
            if (path === 'totalUnpaid' || path === 'details.totalUnpaid') {
                newData.debtAmount = value;
            }
            return newData;
        });
    };

    const handleSave = async () => {
        if (!customer) return;
        setIsSaving(true);
        try {
            await updateCustomer(customer.id, {
                fullName: customer.fullName,
                debtAmount: customer.details?.totalUnpaid || customer.debtAmount,
                details: customer.details,
                fullData: true
            }, user?.email);
            toast.success("Bütün məlumatlar yadda saxlanıldı");
        } catch (error) {
            toast.error("Yadda saxlayarkən xəta");
        } finally {
            setIsSaving(false);
        }
    };

    const generateDocument = async (template: Template) => {
        if (!customer) return;
        if (!selectedCourt) {
            toast.error("Zəhmət olmasa məhkəmə seçin");
            setIsCourtDropdownOpen(true);
            return;
        }
        setIsGenerating(template.id);

        try {
            if (!template.content) {
                toast.error("Şablon faylı tapılmadı");
                setIsGenerating(null);
                return;
            }

            const atobWithUint8 = (base64: string) => {
                const binaryString = atob(base64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                return bytes;
            };

            const bytes = atobWithUint8(template.content);
            const zip = new PizZip(bytes.buffer);
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                delimiters: { start: "{{", end: "}}" },
                nullGetter: () => ""
            });

            const debtNum = parseFloat(customer.details?.totalUnpaid || customer.debtAmount || "0");
            const totalPrice = parseFloat(customer.details?.totalPrice || "0");
            const paidAmount = parseFloat(customer.details?.paidAmount || "0");

            const data = {
                // Court Info
                MEHKEME_ADI: selectedCourt.name,
                MEHKEME_UNVAN: selectedCourt.address,
                MEHKEME_TELEFON: selectedCourt.phone || "",
                MEHKEME_FAKS: selectedCourt.fax || "",

                // Plaintiff (Iddiaci) Info
                IDDIACININ_ADI: companyInfo?.companyName || "",
                IDDIACI_UNVAN: companyInfo?.address || "",
                IDDIACI_TELEFON: companyInfo?.phone || "",
                IDDIACI_FAKS: companyInfo?.fax || "",
                NUMAYENDE_AD_SOYAD: companyInfo?.representative || "",
                NUMAYENDE_FIN: customer.details?.representativeFin || "",

                // Defendant (Cavabdeh) Info
                CAVABDEH_AD_SOYAD: customer.fullName || "",
                CAVABDEH_DOGUM_TARIXI: customer.details?.birthDate || "",
                CAVABDEH_FIN: customer.details?.fin || "",
                CAVABDEH_UNVAN: customer.details?.actualAddress || customer.details?.address || "",
                CAVABDEH_MOBIL: customer.details?.phone || "",

                // Contract & Items
                MUQAVILE_TARIXI: customer.details?.contractDate || "",
                MEHSUL_IMEI_SIYAHI: customer.details?.itemModel || "",

                // Financials
                UMUMI_BORC: debtNum.toFixed(2),
                UMUMI_BORC_SOZLE: numberToAzerbaijaniFinancialWords(debtNum),
                ALQI_SATQI_QIYMETI: totalPrice.toFixed(2),
                ALQI_SATQI_QIYMETI_SOZLE: numberToAzerbaijaniFinancialWords(totalPrice),
                TAKSIT_AY: customer.details?.paymentPeriod || "",
                AYLIQ_ODENIS: customer.details?.monthlyPayment || "",
                ILKIN_ODENIS: customer.details?.initialPayment || "",
                ODENILMEMIS_HISSE: (totalPrice - paidAmount).toFixed(2),
                ODENILMEMIS_HISSE_SOZLE: numberToAzerbaijaniFinancialWords(totalPrice - paidAmount),

                // Fees & Others
                ILM_RUSUM: customer.details?.fee || "",
                ILM_RUSUM_SOZLE: numberToAzerbaijaniFinancialWords(parseFloat(customer.details?.fee || "0")),
                DEBBE_PULU: customer.details?.penalty || "",
                DEBBE_PULU_SOZLE: numberToAzerbaijaniFinancialWords(parseFloat(customer.details?.penalty || "0")),

                // Dates
                currentDate: new Date().toLocaleDateString("az-AZ"),
            };

            doc.render(data);
            const out = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
            saveAs(out, `${customer.fullName.replace(/\s+/g, '_')}_${template.name}`);
            toast.success(`${template.name} yükləndi`);
            await addAuditLog("GENERATE_DOC", `${customer.fullName} üçün ${template.name} yaradıldı`, user?.email || "system");
        } catch (error: any) {
            console.error("Document generation error:", error);
            if (error.name === "XTTemplateError") {
                toast.error(`"${template.name}" şablonunda etiket (tag) xətası var. Mötərizələri yoxlayın.`);
            } else {
                toast.error("Sənəd yaradılmadı");
            }
        } finally {
            setIsGenerating(null);
        }
    };

    const filteredCourts = useMemo(() => {
        if (!courtSearch) return courts;
        return courts.filter(c => c.name.toLowerCase().includes(courtSearch.toLowerCase()));
    }, [courts, courtSearch]);

    const activeTemplateName = useMemo(() => {
        return filteredTemplates.find(t => t.id === activeDocId)?.name || "...";
    }, [activeDocId, filteredTemplates]);

    if (isLoading) {
        return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-primary" size={40} /></div>;
    }

    if (!customer) return null;

    return (
        <AuthGuard>
            <div className="flex flex-col h-screen bg-slate-100 overflow-hidden -m-4 lg:-m-8">
                {/* Fixed Top Header */}
                <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0 z-50 shadow-sm">
                    <div className="flex items-center gap-10">
                        <button onClick={() => router.push("/reports")} className="h-10 w-10 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-primary rounded-xl border border-slate-100 transition-all hover:bg-white hover:shadow-md">
                            <ArrowLeft size={18} />
                        </button>

                        <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center border border-red-100 shadow-inner">
                                <User size={24} className="stroke-[2.5px]" />
                            </div>
                            <div>
                                <h1 className="text-lg font-black text-slate-800 uppercase tracking-tight leading-none">{customer.fullName}</h1>
                                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
                                    <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-500">KOD: {customer.customerCode}</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="relative group">
                            <button
                                onClick={() => setIsCourtDropdownOpen(!isCourtDropdownOpen)}
                                className={cn(
                                    "flex items-center gap-4 px-6 py-3 rounded-2xl border transition-all text-left min-w-[340px] shadow-sm",
                                    selectedCourt ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                                )}
                            >
                                <Scale size={18} />
                                <div className="flex-1">
                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Seçilmiş Məhkəmə</p>
                                    <p className="text-[11px] font-black uppercase tracking-tight truncate">
                                        {selectedCourt ? selectedCourt.name : "Zəhmət olmasa seçim edin"}
                                    </p>
                                </div>
                                <ChevronDown className={cn("transition-transform duration-300", isCourtDropdownOpen && "rotate-180")} size={18} />
                            </button>

                            {isCourtDropdownOpen && (
                                <div className="absolute top-full right-0 mt-3 w-96 bg-white border border-slate-200 rounded-[2rem] shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
                                    <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                            <input
                                                autoFocus
                                                value={courtSearch}
                                                onChange={(e) => setCourtSearch(e.target.value)}
                                                placeholder="Axtar..."
                                                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-primary/30 transition-all text-xs font-bold"
                                            />
                                        </div>
                                    </div>
                                    <div className="max-h-[320px] overflow-y-auto p-2 scrollbar-thin">
                                        {filteredCourts.map((court) => (
                                            <button
                                                key={court.id}
                                                onClick={() => { setSelectedCourt(court); setIsCourtDropdownOpen(false); }}
                                                className="w-full text-left p-4 rounded-xl hover:bg-primary hover:text-white transition-all group flex flex-col gap-1 mb-1"
                                            >
                                                <span className="font-black text-xs tracking-tight uppercase">{court.name}</span>
                                                <span className="text-[10px] font-bold opacity-50 group-hover:opacity-100 truncate">{court.address}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-slate-900 text-white px-8 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-xl active:scale-95 disabled:opacity-50 flex items-center gap-3"
                        >
                            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            SİSTEMİ YADDA SAXLA
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden h-full">
                    {/* LEFT PANEL - Editor */}
                    <div className="w-[450px] border-r border-slate-200 bg-white overflow-y-auto shrink-0 flex flex-col scrollbar-thin shadow-[10px_0_30px_-15px_rgba(0,0,0,0.05)]">
                        <div className="p-8 border-b border-slate-100 bg-slate-50/30">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="h-8 w-2 bg-primary rounded-full shadow-sm" />
                                <h3 className="text-[12px] font-black text-slate-800 uppercase tracking-[0.25em]">Məlumat Redaktoru</h3>
                            </div>

                            <div className="bg-primary/[0.03] p-6 rounded-[2rem] border border-primary/10 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10"><Database size={40} /></div>
                                <div className="relative space-y-1">
                                    <p className="text-[10px] font-black text-primary uppercase tracking-widest italic opacity-60">Görünən Sənəd</p>
                                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight leading-tight line-clamp-2">
                                        {activeTemplateName.replace(".docx", "")}
                                    </h4>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 space-y-10 flex-1">
                            {/* Personal Information */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 border-b-2 border-primary/10 pb-4">
                                    <div className="h-8 w-8 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                                        <User size={16} className="stroke-[2.5px]" />
                                    </div>
                                    <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-[0.2em]">Şəxsi Məlumatlar</h4>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <CustomerField
                                        label="Cins"
                                        isSelect={true}
                                        options={[{ label: "Kişi", value: "Kişi" }, { label: "Qadın", value: "Qadın" }]}
                                        value={customer.details?.gender}
                                        onChange={(v: string) => handleFieldChange("details.gender", v)}
                                    />
                                    <CustomerField
                                        label="FİN"
                                        isFin={true}
                                        value={customer.details?.fin}
                                        onChange={(v: string) => handleFieldChange("details.fin", v)}
                                        placeholder="7 Simvollu"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <CustomerField
                                        label="Doğum Tarixi"
                                        value={customer.details?.birthDate}
                                        onChange={(v: string) => handleFieldChange("details.birthDate", v)}
                                        placeholder="GG.AA.İİİİ"
                                    />
                                    <CustomerField
                                        label="Nümayəndə FİN"
                                        value={customer.details?.representativeFin}
                                        onChange={(v: string) => handleFieldChange("details.representativeFin", v)}
                                        isFin={true}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <CustomerField
                                        label="Vəsiqə Seriya/No"
                                        value={customer.details?.passportNumber}
                                        onChange={(v: string) => handleFieldChange("details.passportNumber", v)}
                                        placeholder="AA0000000"
                                    />
                                    <CustomerField
                                        label="Verilmə Tarixi"
                                        icon={Calendar}
                                        value={customer.details?.issueDate}
                                        onChange={(v: string) => handleFieldChange("details.issueDate", v)}
                                        placeholder="GG.AA.İİİİ"
                                    />
                                </div>
                                <CustomerField
                                    label="Verən Orqan"
                                    icon={Shield}
                                    value={customer.details?.authority}
                                    onChange={(v: string) => handleFieldChange("details.authority", v)}
                                    placeholder="Daxili İşlər Nazirliyi"
                                />
                            </div>

                            {/* Address Information */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 border-b-2 border-primary/10 pb-4">
                                    <div className="h-8 w-8 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                                        <MapPin size={16} className="stroke-[2.5px]" />
                                    </div>
                                    <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-[0.2em]">Ünvan Məlumatları</h4>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Qeydiyyat Ünvanı</label>
                                        <textarea
                                            value={customer.details?.address || ""}
                                            onChange={(e) => handleFieldChange("details.address", e.target.value)}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:border-primary/20 transition-all font-medium text-xs text-slate-600 shadow-sm min-h-[70px] resize-none"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Faktiki Yaşayış Ünvanı</label>
                                        <textarea
                                            value={customer.details?.actualAddress || ""}
                                            onChange={(e) => handleFieldChange("details.actualAddress", e.target.value)}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:border-primary/20 transition-all font-medium text-xs text-slate-600 shadow-sm min-h-[70px] resize-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Order Details */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 border-b-2 border-primary/10 pb-4">
                                    <div className="h-8 w-8 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                                        <Box size={16} className="stroke-[2.5px]" />
                                    </div>
                                    <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-[0.2em]">Sifariş Detalları</h4>
                                </div>
                                <div className="space-y-4">
                                    <CustomerField label="Əşya Modeli" icon={Smartphone} value={customer.details?.itemModel} onChange={(v: string) => handleFieldChange("details.itemModel", v)} />
                                    <div className="grid grid-cols-2 gap-4">
                                        <CustomerField label="Müq. Tarixi" icon={Calendar} value={customer.details?.contractDate} onChange={(v: string) => handleFieldChange("details.contractDate", v)} />
                                        <CustomerField label="Müddət (Ay)" value={customer.details?.paymentPeriod} onChange={(v: string) => handleFieldChange("details.paymentPeriod", v)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <CustomerField label="Aylıq Ödəniş" value={customer.details?.monthlyPayment} onChange={(v: string) => handleFieldChange("details.monthlyPayment", v)} />
                                        <CustomerField label="İlkin Ödəniş" value={customer.details?.initialPayment} onChange={(v: string) => handleFieldChange("details.initialPayment", v)} />
                                    </div>
                                </div>
                            </div>

                            {/* Financial Report */}
                            <div className="space-y-6 pb-20">
                                <div className="flex items-center gap-3 border-b-2 border-primary/10 pb-4">
                                    <div className="h-8 w-8 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                                        <DollarSign size={16} className="stroke-[2.5px]" />
                                    </div>
                                    <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-[0.2em]">Maliyyə Hesabatı</h4>
                                </div>
                                <div className="bg-primary/[0.02] p-6 rounded-[2.5rem] border border-primary/10 space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <CustomerField label="Cəmi Qiymət" value={customer.details?.totalPrice} onChange={(v: string) => handleFieldChange("details.totalPrice", v)} />
                                        <CustomerField label="Ödənilən" value={customer.details?.paidAmount} onChange={(v: string) => handleFieldChange("details.paidAmount", v)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 border-t border-primary/5 pt-4">
                                        <CustomerField label="Dövlət Rüsumu" value={customer.details?.fee} onChange={(v: string) => handleFieldChange("details.fee", v)} />
                                        <CustomerField label="Gecikmə Cəriməsi" value={customer.details?.penalty} onChange={(v: string) => handleFieldChange("details.penalty", v)} />
                                    </div>
                                    <div className="pt-2 border-t border-primary/10">
                                        <CustomerField
                                            label="Yekun Borc (AZN)"
                                            icon={DollarSign}
                                            value={customer.details?.totalUnpaid}
                                            onChange={(v: string) => handleFieldChange("details.totalUnpaid", v)}
                                            isPrice={true}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PANEL - Viewer */}
                    <div
                        ref={scrollContainerRef}
                        onScroll={handleScroll}
                        className="flex-1 bg-slate-200/50 overflow-y-auto p-12 scrollbar-thin flex flex-col items-center gap-8 relative"
                    >
                        <div className="w-full max-w-[900px] flex flex-col pb-40">
                            {filteredTemplates.map((template) => (
                                <DocumentPreview
                                    key={template.id}
                                    template={template}
                                    customer={customer}
                                    companyInfo={companyInfo}
                                    selectedCourt={selectedCourt}
                                    onDownload={generateDocument}
                                    isGenerating={isGenerating}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </AuthGuard>
    );
}

export default function GenerateDocumentPage() {
    return (
        <AuthGuard>
            <Suspense fallback={
                <div className="h-screen flex flex-col items-center justify-center bg-slate-50"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
            }>
                <GenerateDocumentContent />
            </Suspense>
        </AuthGuard>
    );
}
