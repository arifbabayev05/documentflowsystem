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
    Trash2,
    Shield,
    Plus,
    Minus,
    ChevronRight,
    Store,
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
    process_status?: string;
    store?: string;
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
        productDescription?: string;
        penaltyPercent?: string;
        discountAmount?: string;
        warningDate?: string;
        isWarningSent?: boolean;
        phoneCount?: number;
        executorName?: string;
        invoices?: Array<{
            id: string;
            invoiceNumber: string;
            archiveUrl?: string;
            archiveBase64?: string;
            archiveName?: string;
            orders: Array<{
                id: string;
                productDescription: string;
                phoneCount: number;
                contractDate: string;
                paymentPeriod: string;
                monthlyPayment: string;
                initialPayment: string;
                totalPrice: string;
            }>;
        }>;
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
    representativeFin: string;
}

// --- Components ---
function normalizeAZ(text: string) {
    return text
        .toLowerCase()
        .replace(/ə/g, "e")
        .replace(/ı/g, "i")
        .replace(/i̇/g, "i")
        .replace(/ö/g, "o")
        .replace(/ü/g, "u")
        .replace(/ç/g, "c")
        .replace(/ş/g, "s")
        .replace(/ğ/g, "g")
        .replace(/[^a-z0-9\s]/g, "")
        .trim();
}
const CustomerField = memo(({ label, icon: Icon, value, onChange, placeholder, isFin, isPrice, isSelect, options, onFocus, onBlur }: any) => {
    return (
        <div className="space-y-1.5 group">
            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] ml-1 transition-colors group-focus-within:text-primary">
                {label}
            </label>
            {isSelect ? (
                <div className="relative">
                    <select
                        value={value || ""}
                        onChange={(e) => onChange(e.target.value)}
                        onFocus={() => onFocus?.(label)}
                        onBlur={onBlur}
                        className="w-full px-4 py-2.5 bg-white border border-slate-100 rounded-xl outline-none transition-all font-bold text-[14px] shadow-sm focus:border-primary/30 focus:ring-4 focus:ring-primary/5 text-slate-700 appearance-none"
                    >
                        <option value="">-</option>
                        {options?.map((opt: any) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">
                        <ChevronRight size={14} className="rotate-90" />
                    </div>
                </div>
            ) : (
                <input
                    value={value || ""}
                    onFocus={() => onFocus?.(label)}
                    onBlur={onBlur}
                    onChange={(e) => {
                        let val = e.target.value;
                        const dateFields = ["Müq. Tarixi", "Sənədin Verilmə Tarixi", "Xəbərdarlıq Tarixi", "Doğum Tarixi"];
                        if (dateFields.includes(label)) {
                            val = val.replace(/\D/g, "").slice(0, 8);
                            if (val.length >= 4) val = val.slice(0, 2) + "." + val.slice(2, 4) + "." + val.slice(4);
                            else if (val.length >= 2) val = val.slice(0, 2) + "." + val.slice(2);
                        }
                        if (isFin) {
                            val = val.toUpperCase();
                        }
                        onChange(val);
                    }}
                    placeholder={placeholder || (["Müq. Tarixi", "Sənədin Verilmə Tarixi", "Xəbərdarlıq Tarixi", "Doğum Tarixi"].includes(label) ? "GG.AA.İİİİ" : "-")}
                    className={cn(
                        "w-full px-4 py-2.5 bg-white border border-slate-100 rounded-xl outline-none transition-all font-bold text-[14px] shadow-sm",
                        "focus:border-primary/30 focus:ring-4 focus:ring-primary/5 text-slate-700 placeholder:text-slate-300 placeholder:font-medium",
                        isFin ? "uppercase tracking-widest" : "",
                        isPrice ? "text-primary font-black bg-primary/5 border-primary/10" : ""
                    )}
                />
            )}
        </div>
    );
});
CustomerField.displayName = "CustomerField";

const DocumentPreview = ({ template, customer, companyInfo, selectedCourt, onDownload, isGenerating, user, focusedField }: any) => {
    const [isRendering, setIsRendering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const viewerRef = useRef<HTMLDivElement>(null);

    const AZ_MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "İyun", "İyul", "Avqust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];

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
                    NUMAYENDE_FIN: (companyInfo?.representativeFin || "").toUpperCase(),
                    CAVABDEH_AD_SOYAD: customer.fullName || "",
                    CAVABDEH_DOGUM_TARIXI: customer.details?.birthDate || "",
                    CAVABDEH_FIN: (customer.details?.fin || "").toUpperCase(),
                    CAVABDEH_UNVAN: customer.details?.address || "",
                    CAVABDEH_MOBIL: customer.details?.phone || "",
                    CAVABDEH_QEYDIYYAT_UNVAN: customer.details?.address || "",
                    CAVABDEH_FAKTIKI_UNVAN: customer.details?.actualAddress || "",
                    MUQAVILE_TARIXI: customer.details?.contractDate || "",
                    MEHSUL_IMEI_SIYAHI: customer.details?.productDescription || "",
                    CEMI_ODENEN: paidAmount.toFixed(2),
                    ODENILMEMIS_HISSE: parseFloat(customer.details?.unpaidAmount || "0").toFixed(2),
                    ODENILMEMIS_HISSE_SOZLE: numberToAzerbaijaniFinancialWords(parseFloat(customer.details?.unpaidAmount || "0")),
                    UMUMI_BORC: debtNum.toFixed(2),
                    UMUMI_BORC_SOZLE: numberToAzerbaijaniFinancialWords(debtNum),
                    ALQI_SATQI_QIYMETI: totalPrice.toFixed(2),
                    ALQI_SATQI_QIYMETI_SOZLE: numberToAzerbaijaniFinancialWords(totalPrice),
                    TAKSIT_AY: customer.details?.paymentPeriod || "",
                    AYLIQ_ODENIS: customer.details?.monthlyPayment || "",
                    ILKIN_ODENIS: customer.details?.initialPayment || "",
                    ILM_RUSUM: customer.details?.fee || "",
                    ILM_RUSUM_SOZLE: numberToAzerbaijaniFinancialWords(parseFloat(customer.details?.fee || "0")),
                    DEBBE_PULU: customer.details?.penalty || "",
                    DEBBE_PULU_SOZLE: numberToAzerbaijaniFinancialWords(parseFloat(customer.details?.penalty || "0")),
                    currentDate: new Date().toLocaleDateString("az-AZ"),
                    ERIZE_GUN: `${new Date().getDate()}`,
                    ERIZE_AY: AZ_MONTHS[new Date().getMonth()],
                    ERIZE_IL: new Date().getFullYear().toString(),
                    ELAQE_TEL1: "050 280 11 90",
                    ELAQE_TEL2: "012 310 07 75",
                    NUMAYENDE_IMZA: "Süleymanlı.R.X",
                    CAVABDEH_TAM_AD: customer.fullName || "",
                    CAVABDEH_ATA_SUFFIX: (customer.details?.gender === "Qadın" ? "qızına" : "oğluna"),
                    CAVABDEH_ATA_SUFFIX_2: (customer.details?.gender === "Qadın" ? "qızının" : "oğlunun"),
                    ICRACI_AD_SOYAD: customer.details?.executorName || "",
                    MEHSUL_SIYAHI: customer.details?.productDescription || "",
                    DOVLET_RUSUMU: customer.details?.courtFee || "",
                    PENYA_FAIZ: customer.details?.penaltyPercent || "",
                    GUZEST_MEBLEGI: customer.details?.discountAmount || "",
                    XEBERDARLIQ_TARIXI: customer.details?.warningDate || "",
                };

                // Apply highlighter marker to the focused value
                const FIELD_TO_TAG: any = {
                    "SOYAD AD ATA ADI": ["CAVABDEH_AD_SOYAD", "CAVABDEH_TAM_AD"],
                    "Cins": ["CAVABDEH_ATA_SUFFIX", "CAVABDEH_ATA_SUFFIX_2"],
                    "FİN": ["CAVABDEH_FIN"],
                    "Telefon Nömrəsi": ["CAVABDEH_MOBIL"],
                    "Doğum Tarixi": ["CAVABDEH_DOGUM_TARIXI"],
                    "Qeydiyyat Ünvanı": ["CAVABDEH_QEYDIYYAT_UNVAN", "CAVABDEH_UNVAN"],
                    "Faktiki Yaşayış": ["CAVABDEH_FAKTIKI_UNVAN"],
                    "Məhsul Adı": ["MEHSUL_IMEI_SIYAHI", "MEHSUL_SIYAHI"],
                    "Müq. Tarixi": ["MUQAVILE_TARIXI"],
                    "Müddət (Ay)": ["TAKSIT_AY"],
                    "Aylıq Ödəniş": ["AYLIQ_ODENIS"],
                    "İlkin Ödəniş": ["ILKIN_ODENIS"],
                    "Cəmi Qiymət": ["ALQI_SATQI_QIYMETI"],
                    "Ödənilən": ["CEMI_ODENEN"],
                    "Ödənilməmiş Hissə": ["ODENILMEMIS_HISSE"],
                    "İDM Rüsumu": ["ILM_RUSUM"],
                    "Dövlət Rüsumu": ["DOVLET_RUSUMU"],
                    "Dəbbə Pulu": ["DEBBE_PULU"],
                    "Penya Faizi": ["PENYA_FAIZ"],
                    "Güzəşt Məbləği": ["GUZEST_MEBLEGI"],
                    "Yekun Borc (AZN)": ["UMUMI_BORC", "UMUMI_BORC_SOZLE"],
                    "Müfəttiş": ["ICRACI_AD_SOYAD"],
                    "Xəbərdarlıq Tarixi": ["XEBERDARLIQ_TARIXI"]
                };

                if (focusedField && FIELD_TO_TAG[focusedField]) {
                    FIELD_TO_TAG[focusedField].forEach((tag: string) => {
                        const val = data[tag as keyof typeof data];
                        if (val !== undefined && val !== null && val !== "") {
                            (data as any)[tag] = `[[FOC_S]]${val}[[FOC_E]]`;
                        }
                    });
                }

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

                        // Highlighting logic: replace markers with span
                        if (focusedField) {
                            const container = viewerRef.current;
                            const html = container.innerHTML;
                            if (html.includes("[[FOC_S]]")) {
                                container.innerHTML = html
                                    .split("[[FOC_S]]").join('<span class="bg-amber-200 ring-2 ring-amber-400/50 rounded-sm px-0.5 animate-pulse text-slate-900 shadow-sm relative z-10">')
                                    .split("[[FOC_E]]").join('</span>');
                            }
                        }
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
    }, [template, customer, companyInfo, selectedCourt, focusedField]);

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
    const [focusedField, setFocusedField] = useState<string | null>(null);

    const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
    const [courtSearch, setCourtSearch] = useState("");
    const [isCourtDropdownOpen, setIsCourtDropdownOpen] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (id) {
            fetchData();
        } else {
            router.push("/dashboard");
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
                const typedCust = custData as Customer;

                // Materialize invoices if missing
                if (!typedCust.details?.invoices || typedCust.details.invoices.length === 0) {
                    if (!typedCust.details) typedCust.details = {};
                    typedCust.details.invoices = [{
                        id: 'def',
                        invoiceNumber: typedCust.details.contractNumber || "",
                        orders: [{
                            id: 'o_def',
                            productDescription: typedCust.details.productDescription || "",
                            phoneCount: typedCust.details.phoneCount || 1,
                            contractDate: typedCust.details.contractDate || "",
                            paymentPeriod: typedCust.details.paymentPeriod || "",
                            monthlyPayment: typedCust.details.monthlyPayment || "",
                            initialPayment: typedCust.details.initialPayment || "",
                            totalPrice: typedCust.details.totalPrice || "0.00"
                        }]
                    }];
                }

                setCustomer(typedCust);
                setAllTemplates(tempData as Template[]);
                setCourts(courtsData as Court[]);
                setCompanyInfo(settingsData as CompanyInfo);

                if (tempData.length > 0) {
                    const requestedTemplate = searchParams.get('template');
                    if (requestedTemplate) {
                        const found = (tempData as Template[]).find(t => t.name.includes(requestedTemplate));
                        if (found) setActiveDocId(found.id);
                        else setActiveDocId(tempData[0].id);
                    } else {
                        setActiveDocId(tempData[0].id);
                    }
                }

                // Auto-select court
                const actualAddress = (typedCust.details?.actualAddress || "").toLowerCase();
                const addressRaw = typedCust.details?.address || "";
                const address = normalizeAZ(addressRaw);

                if (address) {
                    const matchedCourt = courtsData.find((court: any) => {
                        const courtName = normalizeAZ(court.name);
                        const courtDistrict = courtName
                            .replace("rayon", "").replace("mehkeme", "").replace("seher", "").replace("baki", "")
                            .trim().split(" ")[0];
                        return courtDistrict.length > 3 && address.includes(courtDistrict);
                    });
                    if (matchedCourt) setSelectedCourt(matchedCourt as Court);
                }
            } else {
                toast.error("Müştəri tapılmadı");
                router.push("/dashboard");
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
        const requestedTemplate = searchParams.get('template');

        // Step 8: Strict restriction if 'template' param is present
        if (requestedTemplate) {
            return allTemplates.filter(t => t.name.includes(requestedTemplate));
        }

        const debt = parseFloat(customer.details?.totalUnpaid || customer.debtAmount || "0");

        return allTemplates.filter(t => {
            const name = t.name.toLowerCase();
            const product = (customer.details?.productDescription || "").toLowerCase();
            const hasImei = product.includes("imei");

            // Hide 'Arayış' templates if no IMEI
            if (name.includes("arayış") && !hasImei) return false;

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
    }, [allTemplates, customer, searchParams]);

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

    const handleFieldChange = useCallback((path: string, value: string) => {
        if (!customer) return;
        setCustomer(prev => {
            if (!prev) return null;
            const newData = { ...prev };

            // Handle root level fields
            if (path === 'fullName' || path === 'customerCode' || path === 'debtAmount') {
                (newData as any)[path] = value;
            } else {
                const details = { ...(newData.details || {}) };
                // Support both "details.field" and direct "field" (into details)
                if (path.includes('.')) {
                    const parts = path.split('.');
                    const fieldName = parts[parts.length - 1];
                    (details as any)[fieldName] = value;
                } else {
                    (details as any)[path] = value;
                }
                newData.details = details;
            }

            // Mirror debtAmount if totalUnpaid is updated
            if (path === 'totalUnpaid' || path === 'details.totalUnpaid') {
                newData.debtAmount = value;
            }
            return newData;
        });
    }, [customer]);

    const updateInvoice = (invId: string, field: string, value: any) => {
        setCustomer(prev => {
            if (!prev) return null;
            const invoices = [...(prev.details?.invoices || [])];
            const idx = invoices.findIndex(i => i.id === invId);
            if (idx === -1) return prev;
            invoices[idx] = { ...invoices[idx], [field]: value };

            const newData = { ...prev, details: { ...prev.details, invoices } };
            if (idx === 0 && field === 'invoiceNumber' && newData.details) {
                newData.details.contractNumber = value;
            }
            return newData;
        });
    };

    const updateOrder = (invId: string, orderId: string, field: string, value: any) => {
        setCustomer(prev => {
            if (!prev) return null;
            const invoices = [...(prev.details?.invoices || [])];
            const invIdx = invoices.findIndex(i => i.id === invId);
            if (invIdx === -1) return prev;

            const orders = [...(invoices[invIdx].orders || [])];
            const ordIdx = orders.findIndex(o => o.id === orderId);
            if (ordIdx === -1) return prev;

            const ord = { ...orders[ordIdx], [field]: value };
            if (['paymentPeriod', 'monthlyPayment', 'initialPayment'].includes(field)) {
                const p = parseFloat(ord.paymentPeriod || "0") || 0;
                const m = parseFloat(ord.monthlyPayment || "0") || 0;
                const i = parseFloat(ord.initialPayment || "0") || 0;
                ord.totalPrice = ((p * m) + i).toFixed(2);
            }
            orders[ordIdx] = ord;
            invoices[invIdx] = { ...invoices[invIdx], orders };

            const newData = { ...prev, details: { ...prev.details, invoices } };
            // Sync legacy fields for first order
            if (invIdx === 0 && ordIdx === 0 && newData.details) {
                if (field === 'productDescription') newData.details.productDescription = value;
                if (field === 'contractDate') newData.details.contractDate = value;
                if (field === 'paymentPeriod') newData.details.paymentPeriod = value;
                if (field === 'monthlyPayment') newData.details.monthlyPayment = value;
                if (field === 'initialPayment') newData.details.initialPayment = value;
                if (field === 'phoneCount') newData.details.phoneCount = value;
                newData.details.totalPrice = ord.totalPrice;
            }
            return newData;
        });
    };

    const addInvoice = () => {
        setCustomer(prev => {
            if (!prev) return null;
            const newInv = {
                id: Math.random().toString(36).substring(7),
                invoiceNumber: "",
                orders: [{
                    id: Math.random().toString(36).substring(7),
                    productDescription: "",
                    phoneCount: 1,
                    contractDate: "",
                    paymentPeriod: "",
                    monthlyPayment: "",
                    initialPayment: "",
                    totalPrice: "0.00"
                }]
            };
            return { ...prev, details: { ...prev.details, invoices: [...(prev.details?.invoices || []), newInv] } };
        });
    };

    const addOrder = (invId: string) => {
        setCustomer(prev => {
            if (!prev) return null;
            const invoices = [...(prev.details?.invoices || [])];
            const idx = invoices.findIndex(i => i.id === invId);
            if (idx === -1) return prev;

            const newOrder = {
                id: Math.random().toString(36).substring(7),
                productDescription: "",
                phoneCount: 1,
                contractDate: "",
                paymentPeriod: "",
                monthlyPayment: "",
                initialPayment: "",
                totalPrice: "0.00"
            };
            invoices[idx] = { ...invoices[idx], orders: [...(invoices[idx].orders || []), newOrder] };
            return { ...prev, details: { ...prev.details, invoices } };
        });
    };

    const removeInvoice = (id: string) => {
        setCustomer(prev => {
            if (!prev) return null;
            const invoices = (prev.details?.invoices || []).filter(i => i.id !== id);
            return { ...prev, details: { ...prev.details, invoices } };
        });
    };

    const removeOrder = (invId: string, orderId: string) => {
        setCustomer(prev => {
            if (!prev) return null;
            const invoices = [...(prev.details?.invoices || [])];
            const idx = invoices.findIndex(i => i.id === invId);
            if (idx === -1) return prev;
            invoices[idx] = { ...invoices[idx], orders: (invoices[idx].orders || []).filter(o => o.id !== orderId) };
            return { ...prev, details: { ...prev.details, invoices } };
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

    // --- Automatic Calculations ---
    useEffect(() => {
        if (!customer) return;

        // Aggregate from ALL invoices and orders
        let totalAggregatedPrice = 0;
        let totalPhoneCount = 0;
        let firstProductDesc = "";
        let firstContractDate = "";
        let firstPaymentPeriod = "";
        let firstMonthlyPayment = "";
        let firstInitialPayment = "";

        const invoices = customer.details?.invoices || [];
        invoices.forEach((inv, iidx) => {
            (inv.orders || []).forEach((ord, oidx) => {
                totalAggregatedPrice += parseFloat(ord.totalPrice || "0");
                totalPhoneCount += (ord.phoneCount || 0);
                if (iidx === 0 && oidx === 0) {
                    firstProductDesc = ord.productDescription;
                    firstContractDate = ord.contractDate;
                    firstPaymentPeriod = ord.paymentPeriod;
                    firstMonthlyPayment = ord.monthlyPayment;
                    firstInitialPayment = ord.initialPayment;
                }
            });
        });

        const paid = parseFloat(customer.details?.paidAmount || "0");
        const hasImei = (customer.details?.invoices || []).some(inv =>
            (inv.orders || []).some(ord => ord.productDescription.toLowerCase().includes("imei"))
        );

        // 1. Total Price (aggregated)
        const calculatedTotalPrice = totalAggregatedPrice;

        // 2. Unpaid Amount
        const calculatedUnpaid = Math.max(0, calculatedTotalPrice - paid);

        // 3. IDM Fee
        let calculatedFee = 0;
        if (hasImei) {
            calculatedFee = totalPhoneCount * 47.2;
        }

        // 4. Penalty
        const calculatedPenalty = calculatedUnpaid * 0.10;

        // 5. Total Unpaid
        const calculatedTotalUnpaid = calculatedUnpaid + calculatedFee + calculatedPenalty;

        // 6. Discount
        const calculatedDiscount = Math.max(0, calculatedUnpaid - calculatedPenalty);

        const updates: Record<string, string> = {};
        const currentTotalPrice = parseFloat(customer.details?.totalPrice || "0");
        if (Math.abs(calculatedTotalPrice - currentTotalPrice) > 0.01) {
            updates['details.totalPrice'] = calculatedTotalPrice.toFixed(2);
        }

        const currentUnpaid = parseFloat(customer.details?.unpaidAmount || "0");
        if (Math.abs(calculatedUnpaid - currentUnpaid) > 0.01) {
            updates['details.unpaidAmount'] = calculatedUnpaid.toFixed(2);
        }

        const currentFee = parseFloat(customer.details?.fee || "0");
        if (Math.abs(calculatedFee - currentFee) > 0.01) {
            updates['details.fee'] = calculatedFee.toFixed(2);
        }

        const currentPenalty = parseFloat(customer.details?.penalty || "0");
        if (Math.abs(calculatedPenalty - currentPenalty) > 0.01) {
            updates['details.penalty'] = calculatedPenalty.toFixed(2);
        }

        const currentTotalUnpaid = parseFloat(customer.details?.totalUnpaid || "0");
        if (Math.abs(calculatedTotalUnpaid - currentTotalUnpaid) > 0.01) {
            updates['details.totalUnpaid'] = calculatedTotalUnpaid.toFixed(2);
        }

        const currentDiscount = parseFloat(customer.details?.discountAmount || "0");
        if (Math.abs(calculatedDiscount - currentDiscount) > 0.01) {
            updates['details.discountAmount'] = calculatedDiscount.toFixed(2);
        }

        // Sync legacy fields
        if (customer.details?.productDescription !== firstProductDesc) updates['details.productDescription'] = firstProductDesc;
        if (customer.details?.contractDate !== firstContractDate) updates['details.contractDate'] = firstContractDate;
        if (customer.details?.paymentPeriod !== firstPaymentPeriod) updates['details.paymentPeriod'] = firstPaymentPeriod;
        if (customer.details?.monthlyPayment !== firstMonthlyPayment) updates['details.monthlyPayment'] = firstMonthlyPayment;
        if (customer.details?.initialPayment !== firstInitialPayment) updates['details.initialPayment'] = firstInitialPayment;
        if (customer.details?.phoneCount !== totalPhoneCount) updates['details.phoneCount'] = String(totalPhoneCount) as any;

        if (Object.keys(updates).length > 0) {
            setCustomer(prev => {
                if (!prev) return null;
                const next = { ...prev };
                const details = { ...next.details };
                Object.entries(updates).forEach(([path, val]) => {
                    const key = path.split('.')[1];
                    (details as any)[key] = val;
                });
                next.details = details;
                if (updates['details.totalUnpaid']) next.debtAmount = updates['details.totalUnpaid'];
                return next;
            });
        }
    }, [
        customer?.details?.invoices,
        customer?.details?.paidAmount,
        customer?.details?.totalPrice
    ]);

    const validateData = () => {
        if (!customer) return false;

        const sections = {
            "Sənədi Hazırlayan": { "İcraçı": "details.executorName" },
            "Şəxsi Məlumatlar": {
                "Ad Soyad": "fullName",
                "Cins": "details.gender",
                "Doğum Tarixi": "details.birthDate",
                "FİN": "details.fin",
                "Telefon": "details.phone",
                "Seriya №": "details.passportSeries"
            },
            "Ünvan Məlumatları": {
                "Qeydiyyat Ünvanı": "details.address",
                "Faktiki Yaşayış": "details.actualAddress"
            },
            "Maliyyə Hesabatı": { "Ödənilən məbləğ": "details.paidAmount" }
        };

        const isEmpty = (v: any) => v === undefined || v === null || v.toString().trim() === "";

        for (const [title, fields] of Object.entries(sections)) {
            for (const [name, path] of Object.entries(fields)) {
                const val = path.includes('.')
                    ? (customer as any).details?.[path.split('.')[1]]
                    : (customer as any)[path];

                if (isEmpty(val)) {
                    toast.error(`Əskik məlumat: [${title}] bölməsində "${name}" xanasını doldurun.`);
                    return false;
                }
            }
        }

        if (isEmpty(customer.store)) {
            toast.error("Faktura və Sifariş Detalları bölməsində, sifarişin \"Mağaza\" xanasını doldurun.");
            return false;
        }

        const invoices = customer.details?.invoices || [];
        if (invoices.length === 0) {
            toast.error("Əskik doldurulan məlumat var: Faktura və Sifariş bölməsinə məlumat əlavə edin.");
            return false;
        }

        for (const inv of invoices) {
            if (!inv.invoiceNumber) {
                toast.error("Əskik doldurulan məlumat var: Faktura və Sifariş (Faktura №) xanasını doldurun.");
                return false;
            }
            if (!inv.orders || inv.orders.length === 0) {
                toast.error("Əskik doldurulan məlumat var: Faktura və Sifariş bölməsinə məhsul əlavə edin.");
                return false;
            }
            for (const ord of inv.orders) {
                if (!ord.productDescription || !ord.contractDate || !ord.paymentPeriod || !ord.monthlyPayment || !ord.initialPayment) {
                    toast.error("Əskik doldurulan məlumat var: [Faktura və Sifariş] detallarını tam doldurun.");
                    return false;
                }
            }
        }

        return true;
    };

    const generateDocument = async (template: Template) => {
        if (!customer) return;
        if (!validateData()) return;
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

            const AZ_MONTHS_CAP = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "İyun", "İyul", "Avqust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
            const now = new Date();

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
                NUMAYENDE_FIN: companyInfo?.representativeFin || customer.details?.representativeFin || "",

                // Defendant (Cavabdeh) Info
                CAVABDEH_AD_SOYAD: customer.fullName || "",
                CAVABDEH_DOGUM_TARIXI: customer.details?.birthDate || "",
                CAVABDEH_FIN: customer.details?.fin || "",
                CAVABDEH_UNVAN: customer.details?.address || "", // Registration address
                CAVABDEH_MOBIL: customer.details?.phone || "",
                CAVABDEH_VESIQE_SERIYA_NOMRE: customer.details?.passportNumber || "",
                CAVABDEH_VESIQE_VERILME_TARIXI: customer.details?.issueDate || "",
                CAVABDEH_VESIQE_VEREN_ORQAN: customer.details?.authority || "",
                CAVABDEH_QEYDIYYAT_UNVAN: customer.details?.address || "",
                CAVABDEH_FAKTIKI_UNVAN: customer.details?.actualAddress || "",

                // Contract & Items
                MUQAVILE_TARIXI: customer.details?.contractDate || "",
                MEHSUL_IMEI_SIYAHI: customer.details?.productDescription || "",

                // Financials
                UMUMI_BORC: debtNum.toFixed(2),
                UMUMI_BORC_SOZLE: numberToAzerbaijaniFinancialWords(debtNum),
                ALQI_SATQI_QIYMETI: totalPrice.toFixed(2),
                ALQI_SATQI_QIYMETI_SOZLE: numberToAzerbaijaniFinancialWords(totalPrice),
                TAKSIT_AY: customer.details?.paymentPeriod || "",
                AYLIQ_ODENIS: customer.details?.monthlyPayment || "",
                ILKIN_ODENIS: customer.details?.initialPayment || "",
                CEMI_ODENEN: paidAmount.toFixed(2),
                ODENILMEMIS_HISSE: parseFloat(customer.details?.unpaidAmount || "0").toFixed(2),
                ODENILMEMIS_HISSE_SOZLE: numberToAzerbaijaniFinancialWords(parseFloat(customer.details?.unpaidAmount || "0")),

                // Fees & Others
                ILM_RUSUM: customer.details?.fee || "",
                ILM_RUSUM_SOZLE: numberToAzerbaijaniFinancialWords(parseFloat(customer.details?.fee || "0")),
                DEBBE_PULU: customer.details?.penalty || "",
                DEBBE_PULU_SOZLE: numberToAzerbaijaniFinancialWords(parseFloat(customer.details?.penalty || "0")),

                // Dates & New Tags
                currentDate: now.toLocaleDateString("az-AZ"),
                ERIZE_GUN: `${now.getDate()}`,
                ERIZE_AY: AZ_MONTHS_CAP[now.getMonth()],
                ERIZE_IL: now.getFullYear().toString(),
                ELAQE_TEL1: "050 280 11 90",
                ELAQE_TEL2: "012 310 07 75",
                NUMAYENDE_IMZA: "Süleymanlı.R.X",
                CAVABDEH_TAM_AD: customer.fullName || "",
                CAVABDEH_ATA_SUFFIX: (customer.details?.gender === "Qadın" ? "qızına" : "oğluna"),
                CAVABDEH_ATA_SUFFIX_2: (customer.details?.gender === "Qadın" ? "qızının" : "oğlunun"),
                ICRACI_AD_SOYAD: user?.displayName || user?.email || "",
                MEHSUL_SIYAHI: customer.details?.productDescription || "",
                DOVLET_RUSUMU: customer.details?.courtFee || "",
                PENYA_FAIZ: customer.details?.penaltyPercent || "",
                GUZEST_MEBLEGI: customer.details?.discountAmount || "",
                XEBERDARLIQ_TARIXI: customer.details?.warningDate || "",
            };

            doc.render(data);
            const out = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
            saveAs(out, `${customer.fullName.replace(/\s+/g, '_')
                }_${template.name}`);
            toast.success(`${template.name} yükləndi`);
            await addAuditLog("GENERATE_DOC", `${customer.fullName} üçün ${template.name} yaradıldı`, user?.email || "system");
        } catch (error: any) {
            console.error("Document generation error:", error);
            if (error.name === "XTTemplateError") {
                toast.error(`"${template.name}" şablonunda etiket(tag) xətası var.Mötərizələri yoxlayın.`);
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
                        <button onClick={() => router.push("/dashboard")} className="h-10 w-10 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-primary rounded-xl border border-slate-100 transition-all hover:bg-white hover:shadow-md">
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
                        {/* Court Selection */}
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
                            onClick={async () => {
                                if (!customer) return;
                                if (!validateData()) return;
                                if (!selectedCourt) {
                                    toast.error("Zəhmət olmasa məhkəmə seçin");
                                    setIsCourtDropdownOpen(true);
                                    return;
                                }

                                const loadingId = toast.loading("Bütün sənədlər hazırlanır...");
                                try {
                                    // 1. Generate all filtered documents sequentially
                                    for (const temp of filteredTemplates) {
                                        await generateDocument(temp);
                                        // Small delay for browser's download queue
                                        await new Promise(r => setTimeout(r, 800));
                                    }

                                    // 2. Update status to COMPLETED
                                    await updateCustomer(customer.id, {
                                        ...customer,
                                        process_status: 'COMPLETED'
                                    }, user?.email);

                                    toast.success("Bütün sənədlər yükləndi və status 'Tamamlandı' olaraq yeniləndi", { id: loadingId });

                                    // Refresh local customer state
                                    setCustomer(prev => prev ? { ...prev, process_status: 'COMPLETED' } : null);
                                } catch (err) {
                                    toast.error("Sənədləri yaradarkən xəta baş verdi", { id: loadingId });
                                }
                            }}
                            className="bg-emerald-600 text-white px-8 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-emerald-700 transition-all shadow-xl active:scale-95 flex items-center gap-3"
                        >
                            <Printer size={18} /> ÜMUMİ ÇAP (HAMISI)
                        </button>

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
                            {/* Executor Info */}
                            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200/60 shadow-sm transition-all hover:bg-white hover:shadow-md group">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="h-10 w-10 rounded-2xl bg-white text-primary flex items-center justify-center shadow-sm border border-slate-100 group-hover:border-primary/20 transition-all">
                                        <Edit3 size={20} className="stroke-[2.5px]" />
                                    </div>
                                    <div>
                                        <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-[0.2em] leading-none">Sənədi Hazırlayan</h4>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">Müfəttiş Məlumatı</p>
                                    </div>
                                </div>
                                <CustomerField
                                    label="Müfəttiş"
                                    icon={User}
                                    value={customer.details?.executorName || user?.displayName || ""}
                                    onFocus={setFocusedField}
                                    onBlur={() => setFocusedField(null)}
                                    onChange={(v: string) => handleFieldChange("details.executorName", v)}
                                    placeholder="Ad Soyad"
                                />
                            </div>

                            {/* Warning Section */}
                            <div className="bg-amber-50/50 p-6 rounded-[2rem] border border-amber-200/50 shadow-sm transition-all hover:bg-amber-50">
                                <div className="flex items-center justify-between gap-6">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-sm">
                                            <AlertTriangle size={20} className="stroke-[2.5px]" />
                                        </div>
                                        <div>
                                            <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-[0.2em] leading-none">Xəbərdarlıq Göndərilibmi?</h4>
                                        </div>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={!!customer.details?.isWarningSent}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                handleFieldChange("details.isWarningSent", checked as any);
                                                if (!checked) {
                                                    handleFieldChange("details.warningDate", "");
                                                } else if (!customer.details?.warningDate) {
                                                    const now = new Date();
                                                    const dd = String(now.getDate()).padStart(2, '0');
                                                    const mm = String(now.getMonth() + 1).padStart(2, '0');
                                                    const yyyy = now.getFullYear();
                                                    handleFieldChange("details.warningDate", `${dd}.${mm}.${yyyy}`);
                                                }
                                            }}
                                        />
                                        <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-[21px] after:w-[21px] after:transition-all peer-checked:bg-amber-500 shadow-inner"></div>
                                    </label>
                                </div>

                                {customer.details?.isWarningSent && (
                                    <div className="mt-6 pt-6 border-t border-amber-200/30 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <CustomerField
                                            label="Xəbərdarlıq Tarixi"
                                            icon={Calendar}
                                            value={customer.details?.warningDate}
                                            onChange={(v: string) => handleFieldChange("details.warningDate", v)}
                                            placeholder="GG.AA.İİİİ"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Personal Information */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 border-b-2 border-primary/10 pb-4">
                                    <div className="h-8 w-8 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                                        <User size={16} className="stroke-[2.5px]" />
                                    </div>
                                    <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-[0.2em]">Şəxsi Məlumatlar</h4>
                                </div>
                                <div className="space-y-4">
                                    <CustomerField label="SOYAD AD ATA ADI" icon={User} value={customer.fullName} onFocus={setFocusedField} onBlur={() => setFocusedField(null)} onChange={(v: string) => handleFieldChange("fullName", v)} />
                                    <div className="grid grid-cols-2 gap-4">
                                        <CustomerField
                                            label="Cins"
                                            isSelect={true}
                                            options={[{ label: "Kişi", value: "Kişi" }, { label: "Qadın", value: "Qadın" }]}
                                            value={customer.details?.gender}
                                            onFocus={setFocusedField}
                                            onBlur={() => setFocusedField(null)}
                                            onChange={(v: string) => handleFieldChange("details.gender", v)}
                                        />
                                        <CustomerField
                                            label="FİN"
                                            isFin={true}
                                            value={customer.details?.fin}
                                            onFocus={setFocusedField}
                                            onBlur={() => setFocusedField(null)}
                                            onChange={(v: string) => handleFieldChange("details.fin", v)}
                                            placeholder="7 Simvollu"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <CustomerField
                                            label="Doğum Tarixi"
                                            value={customer.details?.birthDate}
                                            onFocus={setFocusedField}
                                            onBlur={() => setFocusedField(null)}
                                            onChange={(v: string) => handleFieldChange("details.birthDate", v)}
                                            placeholder="GG.AA.İİİİ"
                                        />
                                        <CustomerField
                                            label="Telefon Nömrəsi"
                                            value={customer.details?.phone}
                                            onFocus={setFocusedField}
                                            onBlur={() => setFocusedField(null)}
                                            onChange={(v: string) => handleFieldChange("details.phone", v)}
                                            placeholder="+994"
                                        />
                                    </div>
                                </div>
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
                                            onFocus={() => setFocusedField("Qeydiyyat Ünvanı")}
                                            onBlur={() => setFocusedField(null)}
                                            onChange={(e) => handleFieldChange("details.address", e.target.value)}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:border-primary/20 transition-all font-medium text-xs text-slate-600 shadow-sm min-h-[70px] resize-none"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Faktiki Yaşayış Ünvanı</label>
                                        <textarea
                                            value={customer.details?.actualAddress || ""}
                                            onFocus={() => setFocusedField("Faktiki Yaşayış")}
                                            onBlur={() => setFocusedField(null)}
                                            onChange={(e) => handleFieldChange("details.actualAddress", e.target.value)}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:border-primary/20 transition-all font-medium text-xs text-slate-600 shadow-sm min-h-[70px] resize-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Faktura və Sifariş Detalları - MULTI INVOICE */}
                            <div className="space-y-6">
                                <div className="flex items-center justify-between border-b-2 border-primary/10 pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                                            <Box size={16} className="stroke-[2.5px]" />
                                        </div>
                                        <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-[0.2em]">Faktura və Sifariş Detalları</h4>
                                    </div>
                                    <button
                                        onClick={addInvoice}
                                        className="h-9 px-4 bg-primary text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20 active:scale-95"
                                    >
                                        <Plus size={14} strokeWidth={3} /> Faktura Əlavə Et
                                    </button>
                                </div>

                                <div className="space-y-8">
                                    {(customer.details?.invoices || []).map((inv, idx) => (
                                        <div key={inv.id} className="bg-slate-50/50 p-6 rounded-[2.5rem] border border-slate-200/60 space-y-6 relative group/inv">
                                            {/* Invoice Header */}
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-4 flex-1">
                                                    <div className="h-10 w-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center font-black text-slate-400 text-xs shadow-sm">
                                                        {idx + 1}
                                                    </div>
                                                    <input
                                                        value={inv.invoiceNumber}
                                                        onChange={(e) => updateInvoice(inv.id, 'invoiceNumber', e.target.value)}
                                                        className="flex-1 bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-xs outline-none focus:border-primary/30 transition-all shadow-sm"
                                                        placeholder="Faktura Nömrəsi"
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => removeInvoice(inv.id)}
                                                    className="h-10 w-10 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>

                                            {/* Orders List */}
                                            <div className="space-y-4">
                                                {(inv.orders || []).map((ord) => (
                                                    <div key={ord.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4 group/ord">
                                                        <div className="flex items-center justify-between gap-4">
                                                            <div className="flex-1">
                                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Məhsul Adı (İMEİ)</label>
                                                                <input
                                                                    value={ord.productDescription}
                                                                    onChange={(e) => updateOrder(inv.id, ord.id, 'productDescription', e.target.value)}
                                                                    className="w-full bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-xl font-bold text-xs outline-none focus:border-primary/20 transition-all"
                                                                    placeholder="Məs: iPhone 13 (IMEI: ...)"
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => removeOrder(inv.id, ord.id)}
                                                                className="h-9 w-9 flex items-center justify-center text-slate-200 hover:text-red-400 transition-all"
                                                            >
                                                                <Minus size={14} />
                                                            </button>
                                                        </div>

                                                        <div className="grid grid-cols-4 gap-3">
                                                            <div className="space-y-1">
                                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center block">Müddət</label>
                                                                <input
                                                                    value={ord.paymentPeriod}
                                                                    onChange={(e) => updateOrder(inv.id, ord.id, 'paymentPeriod', e.target.value)}
                                                                    className="w-full bg-slate-50 border border-slate-100 py-2 rounded-lg font-bold text-xs text-center outline-none"
                                                                />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center block">Sayı</label>
                                                                <input
                                                                    value={ord.phoneCount}
                                                                    onChange={(e) => updateOrder(inv.id, ord.id, 'phoneCount', parseInt(e.target.value) || 1)}
                                                                    className="w-full bg-slate-50 border border-slate-100 py-2 rounded-lg font-bold text-xs text-center outline-none"
                                                                />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center block">Aylıq</label>
                                                                <input
                                                                    value={ord.monthlyPayment}
                                                                    onChange={(e) => updateOrder(inv.id, ord.id, 'monthlyPayment', e.target.value)}
                                                                    className="w-full bg-slate-50 border border-slate-100 py-2 rounded-lg font-bold text-xs text-center outline-none"
                                                                />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center block">İlkin</label>
                                                                <input
                                                                    value={ord.initialPayment}
                                                                    onChange={(e) => updateOrder(inv.id, ord.id, 'initialPayment', e.target.value)}
                                                                    className="w-full bg-slate-50 border border-slate-100 py-2 rounded-lg font-bold text-xs text-center outline-none"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="pt-3 border-t border-slate-50 flex items-center justify-between">
                                                            <span className="text-[10px] font-bold text-primary tracking-tight">Cəmi: {ord.totalPrice} AZN</span>
                                                            <div className="flex items-center gap-1">
                                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-2">Tarix</label>
                                                                <input
                                                                    value={ord.contractDate}
                                                                    onChange={(e) => updateOrder(inv.id, ord.id, 'contractDate', e.target.value)}
                                                                    className="w-24 bg-slate-50 border border-slate-100 py-1.5 rounded-lg font-bold text-[10px] text-center outline-none"
                                                                    placeholder="GG.AA.İİİİ"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={() => addOrder(inv.id)}
                                                    className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <Plus size={14} /> Məhsul Əlavə Et
                                                </button>
                                            </div>
                                        </div>
                                    ))}
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
                                        <CustomerField label="Cəmi Qiymət" value={customer.details?.totalPrice} onFocus={setFocusedField} onBlur={() => setFocusedField(null)} onChange={(v: string) => handleFieldChange("details.totalPrice", v)} />
                                        <CustomerField label="Ödənilən" value={customer.details?.paidAmount} onFocus={setFocusedField} onBlur={() => setFocusedField(null)} onChange={(v: string) => handleFieldChange("details.paidAmount", v)} />
                                    </div>
                                    <div className="p-4 bg-white rounded-2xl border border-primary/5 shadow-sm">
                                        <CustomerField label="Ödənilməmiş Hissə" value={customer.details?.unpaidAmount} onFocus={setFocusedField} onBlur={() => setFocusedField(null)} onChange={(v: string) => handleFieldChange("details.unpaidAmount", v)} isPrice={true} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 border-t border-primary/5 pt-4">
                                        <CustomerField label="İDM Rüsumu" value={customer.details?.fee} onFocus={setFocusedField} onBlur={() => setFocusedField(null)} onChange={(v: string) => handleFieldChange("details.fee", v)} />
                                        <CustomerField label="Dövlət Rüsumu" value={customer.details?.courtFee} onFocus={setFocusedField} onBlur={() => setFocusedField(null)} onChange={(v: string) => handleFieldChange("details.courtFee", v)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <CustomerField label="Dəbbə Pulu" value={customer.details?.penalty} onFocus={setFocusedField} onBlur={() => setFocusedField(null)} onChange={(v: string) => handleFieldChange("details.penalty", v)} />
                                        <CustomerField label="Penya Faizi" value={customer.details?.penaltyPercent} onFocus={setFocusedField} onBlur={() => setFocusedField(null)} onChange={(v: string) => handleFieldChange("details.penaltyPercent", v)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <CustomerField label="Güzəşt Məbləği" value={customer.details?.discountAmount} onFocus={setFocusedField} onBlur={() => setFocusedField(null)} onChange={(v: string) => handleFieldChange("details.discountAmount", v)} />
                                    </div>
                                    <div className="pt-2 border-t border-primary/10">
                                        <CustomerField
                                            label="Yekun Borc (AZN)"
                                            icon={DollarSign}
                                            value={customer.details?.totalUnpaid}
                                            onFocus={setFocusedField}
                                            onBlur={() => setFocusedField(null)}
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
                                    user={user}
                                    focusedField={focusedField}
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
