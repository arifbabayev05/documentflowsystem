"use client";

import { useState, useCallback, useEffect, useMemo, memo, useRef } from "react";
import {
    Plus,
    Trash2,
    Loader2,
    Search,
    X,
    AlertTriangle,
    Edit2,
    ChevronDown,
    Check,
    User,
    MapPin,
    Box,
    Tag,
    DollarSign,
    UserCircle,
    FileText,
    Smartphone,
    Minus,
    Zap,
    RefreshCw,
    Download,
    UserPlus,
    Users,
    Calendar,
    Upload,
    FileUp,
    Shield,
    Store,
    FolderArchive,
    ArrowDownToLine
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getCustomers, bulkAddCustomers, deleteCustomer, updateCustomer, getAllUsers, getStores } from "@/lib/db";
import { formatDateInput } from "@/lib/format";
import AuthGuard from "@/components/auth/AuthGuard";



/** Internal helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

export type ProcessStatus = 'INSPECTOR_ENTERED' | 'ASSIGNED_BY_MANAGER' | 'FILLED_BY_ADMIN' | 'WAITING_FOR_ARCHIVE' | 'ARCHIVE_UPLOADED' | 'COMPLETED';

export const STATUS_ORDER: ProcessStatus[] = [
    'INSPECTOR_ENTERED',
    'ASSIGNED_BY_MANAGER',
    'FILLED_BY_ADMIN',
    'WAITING_FOR_ARCHIVE',
    'ARCHIVE_UPLOADED',
    'COMPLETED'
];

export const STATUS_LABELS: Record<ProcessStatus, { label: string, color: string, bg: string }> = {
    INSPECTOR_ENTERED: { label: 'Müfəttiş Daxil Etdi', color: 'text-blue-600', bg: 'bg-blue-50' },
    ASSIGNED_BY_MANAGER: { label: 'Xəbərdarlıq', color: 'text-amber-600', bg: 'bg-amber-50' },
    FILLED_BY_ADMIN: { label: 'Məfəttiş doldurdu', color: 'text-purple-600', bg: 'bg-purple-50' },
    WAITING_FOR_ARCHIVE: { label: 'Arxivdən sənəd istənilib', color: 'text-orange-600', bg: 'bg-orange-50' },
    ARCHIVE_UPLOADED: { label: 'Arxiv faylı əlavə olundu', color: 'text-slate-600', bg: 'bg-slate-100' },
    COMPLETED: { label: 'Sənədlər tamamlandı', color: 'text-green-600', bg: 'bg-green-50' }
};

/** Helper to check if warning is older than 5 days */
const isOverdue = (dateStr?: string) => {
    if (!dateStr) return false;
    try {
        const [dd, mm, yyyy] = dateStr.split('.').map(Number);
        const warningDate = new Date(yyyy, mm - 1, dd);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        warningDate.setHours(0, 0, 0, 0);
        const diffTime = today.getTime() - warningDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 5;
    } catch (e) {
        return false;
    }
};

const KARABAKH_DISTRICTS = [
    "Şuşa", "Xankəndi", "Ağdam", "Füzuli", "Cəbrayıl", "Xocavənd", "Xocalı", "Tərtər", "Ağdərə", "Laçın", "Kəlbəcər", "Zəngilan", "Qubadlı"
];

const normalizeAZ = (str: string | undefined) => {
    if (!str) return "";
    return str.toString().toLowerCase()
        .replace(/ə/g, 'e')
        .replace(/ı/g, 'i')
        .replace(/i̇/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ü/g, 'u')
        .replace(/ç/g, 'c')
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/[^a-z0-9\s]/g, "")
        .trim();
};

const isKarabakhAddress = (address: string | undefined) => {
    const v = normalizeAZ(address || "");
    if (v.includes("qarabag") || v.includes("qarabaq")) return true;
    return KARABAKH_DISTRICTS.some(district => v.includes(normalizeAZ(district)));
};

interface CustomerRow {
    id?: string;
    customerCode: string;
    fullName: string;
    debtAmount: string;
    createdAt?: string;
    fullData?: boolean;
    gender?: string;
    process_status?: ProcessStatus;
    assignedTo?: string; // New field for manager assignment
    assignedAt?: string; // Information when it was assigned
    isArchived?: boolean; // If true, it moves to archive list
    store?: string; // Store name
    details?: {
        address?: string;
        actualAddress?: string;
        phone?: string;
        gender?: string;
        passportSeries?: string;
        passportNumber?: string;
        birthDate?: string;
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
        productDescription?: string;
        phoneCount?: number;
        discountAmount?: string;
        isWarningSent?: boolean;
        warningDate?: string;
        executorName?: string;
        invoices?: Array<{
            id: string;
            invoiceNumber: string;
            archiveUrl?: string;
            archiveBase64?: string;
            archiveName?: string;
            archiveRequested?: boolean;
            orders: Array<{
                id: string;
                productDescription: string;
                phoneCount: number;
                contractDate: string;
                paymentPeriod: string;
                monthlyPayment: string;
                initialPayment: string;
                paidAmount: string;
                totalPrice: string;
            }>;
        }>;
    };
}

/** 
 * Isolated Field Component to prevent extensive re-rendering and focus loss 
 */
const CustomerField = memo(({ label, path, placeholder, className, isFin, isCemi, isSelect, value, onChange, isEditing, maxLength, action }: any) => {
    // Basic date masking for DD/MM/YYYY
    const handleValueChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        let val = e.target.value;
        const datePaths = ['details.contractDate', 'details.issueDate', 'details.warningDate', 'details.birthDate'];
        const numericPaths = [
            'details.totalPrice', 'details.paidAmount', 'details.unpaidAmount',
            'details.fee', 'details.penalty', 'details.discountAmount',
            'details.totalUnpaid', 'details.paymentPeriod', 'details.monthlyPayment',
            'details.initialPayment'
        ];

        if (datePaths.includes(path)) {
            val = formatDateInput(val);
        } else if (numericPaths.includes(path)) {
            // Allow only digits, dots, and commas
            val = val.replace(/[^0-9.,]/g, "");
            // Convert comma to dot
            val = val.replace(/,/g, ".");

            // Clear zero prefix if user starts typing something else
            if (val.startsWith("0.00") && val.length > 4) {
                val = val.slice(4);
            } else if (val.startsWith("0") && val.length > 1 && val[1] !== ".") {
                val = val.replace(/^0+/, "");
            }

            // Allow only one dot
            const parts = val.split(".");
            if (parts.length > 2) val = parts[0] + "." + parts.slice(1).join("");
        }

        if (isFin) {
            val = val.toUpperCase();
        }
        onChange(path, val);
    };

    return (
        <div className={cn("space-y-1.5", className)}>
            <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-600 ml-1">
                {label}
            </label>
            <div className="flex items-center gap-2">
                {isSelect ? (
                    <select
                        disabled={!isEditing}
                        className={cn(
                            "w-full px-3.5 py-2.5 rounded-xl border outline-none text-[13px] transition-all appearance-none",
                            isEditing ? "bg-white border-slate-200 text-slate-900 font-semibold shadow-sm" : "bg-slate-100 border-slate-200 text-slate-800 font-semibold"
                        )}
                        value={value || ""}
                        onChange={handleValueChange}
                    >
                        <option value="">-</option>
                        <option value="Kişi">Kişi</option>
                        <option value="Qadın">Qadın</option>
                    </select>
                ) : (
                    <input
                        type="text"
                        readOnly={!isEditing}
                        maxLength={maxLength}
                        className={cn(
                            "w-full px-3.5 py-2 rounded-xl border outline-none text-[13px] transition-all",
                            isEditing
                                ? "bg-white border-slate-200 focus:border-slate-400 focus:ring-4 focus:ring-slate-100 text-slate-900 font-semibold shadow-sm"
                                : "bg-slate-100 border-slate-200 text-slate-800 font-semibold cursor-default",
                            isFin ? "uppercase" : "",
                            isCemi ? "text-primary font-bold shadow-inner bg-primary/5" : ""
                        )}
                        style={isFin ? { letterSpacing: '0.1em' } : undefined}
                        value={value || ""}
                        onChange={handleValueChange}
                        placeholder={placeholder || (['details.contractDate', 'details.issueDate', 'details.warningDate', 'details.birthDate'].includes(path) ? "GG.AA.İİİİ" : "-")}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && isEditing) {
                                const inputs = Array.from(document.querySelectorAll('input:not([readonly]), select:not([disabled])')) as HTMLElement[];
                                const index = inputs.indexOf(e.currentTarget);
                                if (index > -1 && index < inputs.length - 1) {
                                    inputs[index + 1].focus();
                                }
                            }
                        }}
                    />
                )}
                {action}
            </div>
        </div>
    );
});
CustomerField.displayName = "CustomerField";

/** 
 * CUSTOMER CARD COMPONENT
 */
const CustomerCard = memo(({
    row,
    index,
    totalRows,
    canUpdate,
    canDelete,
    appUsers,
    userWorkload,
    stores,
    onSave,
    onDelete,
    can
}: {
    row: CustomerRow;
    index: number;
    totalRows: number;
    canUpdate: boolean;
    canDelete: boolean;
    appUsers: any[];
    userWorkload: Record<string, number>;
    stores: any[];
    onSave: (data: CustomerRow) => Promise<void>;
    onDelete: (index: number) => void;
    can: (permission: any) => boolean;
}) => {
    const router = useRouter();
    const { user } = useAuth();
    // New rows start expanded and editing
    const [isEditing, setIsEditing] = useState(!row.id);
    const [isExpanded, setIsExpanded] = useState(!row.id);
    const [localData, setLocalData] = useState<CustomerRow>(JSON.parse(JSON.stringify(row)));
    const [openStoreDropdownId, setOpenStoreDropdownId] = useState<string | null>(null);
    const [storeSearch, setStoreSearch] = useState("");
    const [dropdownSelectedIndex, setDropdownSelectedIndex] = useState(0);
    const cardRef = useRef<HTMLDivElement>(null);

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
                // If expanded but NOT editing, close it
                if (isExpanded && !isEditing) {
                    setIsExpanded(false);
                }
            }
        };

        if (isExpanded) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isExpanded, isEditing]);

    useEffect(() => {
        if (!isEditing) {
            setLocalData(JSON.parse(JSON.stringify(row)));
        } else {
            // When entering edit mode, if invoices are missing, materialize them from legacy fields immediately
            setLocalData(prev => {
                if (prev.details?.invoices && prev.details.invoices.length > 0) return prev;

                const materialized = {
                    id: 'def',
                    invoiceNumber: prev.details?.contractNumber || "",
                    archiveUrl: "",
                    archiveBase64: "",
                    archiveName: "",
                    archiveRequested: false,
                    orders: [{
                        id: 'o_def',
                        productDescription: prev.details?.productDescription || "",
                        phoneCount: prev.details?.phoneCount || 1,
                        contractDate: prev.details?.contractDate || "",
                        paymentPeriod: prev.details?.paymentPeriod || "",
                        monthlyPayment: prev.details?.monthlyPayment || "",
                        initialPayment: prev.details?.initialPayment || "",
                        paidAmount: prev.details?.paidAmount || "0.00",
                        totalPrice: prev.details?.totalPrice || "0.00"
                    }]
                };

                return {
                    ...prev,
                    details: {
                        ...(prev.details || {}),
                        invoices: [materialized]
                    }
                };
            });
        }
    }, [row, isEditing]);

    const handleFieldChange = useCallback((path: string, value: string) => {
        if (!path) return;
        setLocalData(prev => {
            const newData = { ...prev };
            const details = { ...(newData.details || {}) };

            if (path === 'customerCode') {
                const finVal = value.toUpperCase().slice(0, 7);
                newData.customerCode = finVal;
                details.fin = finVal;
            } else if (path.startsWith('details.')) {
                const detailField = path.split('.')[1];
                (details as any)[detailField] = value;

                // Dynamic logic for address: If Karabakh is removed, clear actualAddress
                if (detailField === 'address') {
                    if (!isKarabakhAddress(value)) {
                        details.actualAddress = "";
                    }
                }

                // Autonomous Calculations for global fields (historical)
                const period = parseFloat((details.paymentPeriod || "0").toString().replace(',', '.')) || 0;
                const monthly = parseFloat((details.monthlyPayment || "0").toString().replace(',', '.')) || 0;
                const initial = parseFloat((details.initialPayment || "0").toString().replace(',', '.')) || 0;
                const paid = parseFloat((details.paidAmount || "0").toString().replace(',', '.')) || 0;
                const productDesc = details.productDescription || "";

                // Count imei occurrences OR commas (+1 rule) for phoneCount
                const imeiMatches = productDesc.match(/imei/gi);
                const imeiCount = imeiMatches ? imeiMatches.length : 0;
                const commaCount = (productDesc.match(/,/g) || []).length;
                const phoneCount = Math.max(1, imeiCount, commaCount + 1);

                const hasImei = productDesc.toLowerCase().includes("imei");

                const baseFields = ['paymentPeriod', 'monthlyPayment', 'initialPayment', 'paidAmount', 'productDescription', 'phoneCount'];
                if (baseFields.includes(detailField)) {
                    const totalPrice = (period * monthly) + initial;
                    const unpaidAmount = Math.max(0, totalPrice - paid);
                    let fee = hasImei ? phoneCount * 23.6 : 0;
                    const penalty = unpaidAmount * 0.10;
                    const totalUnpaid = unpaidAmount + fee + penalty;
                    const discount = Math.max(0, unpaidAmount - penalty);

                    details.phoneCount = phoneCount;
                    details.totalPrice = totalPrice.toFixed(2);
                    details.unpaidAmount = unpaidAmount.toFixed(2);
                    details.fee = fee.toFixed(2);
                    details.penalty = penalty.toFixed(2);
                    details.totalUnpaid = totalUnpaid.toFixed(2);
                    details.discountAmount = discount.toFixed(2);
                    newData.debtAmount = totalUnpaid.toFixed(2);
                } else if (detailField === 'totalUnpaid') {
                    newData.debtAmount = value;
                }
            } else {
                (newData as any)[path] = value;
            }
            newData.details = details;
            return newData;
        });
    }, []);

    const updateInvoice = (invId: string, field: string, value: any) => {
        setLocalData(prev => {
            const invoices = [...(prev.details?.invoices || [])];
            const idx = invoices.findIndex(i => i.id === invId);
            if (idx === -1) return prev;

            invoices[idx] = { ...invoices[idx], [field]: value };

            const newData = { ...prev, details: { ...prev.details, invoices } };

            // Backward compatibility sync
            if (idx === 0 && field === 'invoiceNumber' && newData.details) {
                newData.details.contractNumber = value;
            }

            return newData;
        });
    };

    const updateOrder = (invId: string, orderId: string, field: string, value: any) => {
        setLocalData(prev => {
            const invoices = [...(prev.details?.invoices || [])];
            const invIdx = invoices.findIndex(i => i.id === invId);
            if (invIdx === -1) return prev;

            const orders = [...(invoices[invIdx].orders || [])];
            const ordIdx = orders.findIndex(o => o.id === orderId);
            if (ordIdx === -1) return prev;

            const ord = { ...orders[ordIdx], [field]: value };

            // Auto-calculate phoneCount based on imei count OR commas (+1 rule)
            if (field === 'productDescription') {
                const innerImeiMatches = value.match(/imei/gi);
                const innerImeiCount = innerImeiMatches ? innerImeiMatches.length : 0;
                const commaCount = (value.match(/,/g) || []).length;
                ord.phoneCount = Math.max(1, innerImeiCount, commaCount + 1);
            }

            // Recalculate order price
            if (['paymentPeriod', 'monthlyPayment', 'initialPayment'].includes(field)) {
                const p = parseFloat((ord.paymentPeriod || "0").toString().replace(',', '.')) || 0;
                const m = parseFloat((ord.monthlyPayment || "0").toString().replace(',', '.')) || 0;
                const i = parseFloat((ord.initialPayment || "0").toString().replace(',', '.')) || 0;
                ord.totalPrice = ((p * m) + i).toFixed(2);
            }

            orders[ordIdx] = ord;
            invoices[invIdx] = { ...invoices[invIdx], orders };

            const newData = { ...prev, details: { ...prev.details, invoices } };

            // Aggregate global values from all orders
            if (newData.details) {
                let totalAggregatedPrice = 0;
                let totalAggregatedPaid = 0;
                let totalPhoneCount = 0;
                let hasAnyImei = false;

                newData.details.invoices?.forEach(inv => {
                    inv.orders?.forEach(o => {
                        const p = parseFloat((o.paymentPeriod || "0").toString().replace(',', '.')) || 0;
                        const m = parseFloat((o.monthlyPayment || "0").toString().replace(',', '.')) || 0;
                        const i = parseFloat((o.initialPayment || "0").toString().replace(',', '.')) || 0;
                        const paid = parseFloat((o.paidAmount || "0").toString().replace(',', '.')) || 0;

                        totalAggregatedPrice += (p * m) + i;
                        totalAggregatedPaid += paid;

                        const desc = (o.productDescription || "").toLowerCase();
                        const imeiMatches = desc.match(/imei/gi);
                        const imeiCount = imeiMatches ? imeiMatches.length : 0;
                        const commaCount = (desc.match(/,/g) || []).length;
                        totalPhoneCount += Math.max(1, imeiCount, commaCount + 1);
                        if (desc.includes("imei")) hasAnyImei = true;
                    });
                });

                // Update details
                newData.details.totalPrice = totalAggregatedPrice.toFixed(2);
                newData.details.paidAmount = totalAggregatedPaid.toFixed(2);
                newData.details.phoneCount = totalPhoneCount;

                // Recalculate global debt fields
                const unpaid = Math.max(0, totalAggregatedPrice - totalAggregatedPaid);
                const fee = hasAnyImei ? totalPhoneCount * 23.6 : 0;
                const penalty = unpaid * 0.10;
                const totalDebt = unpaid + fee + penalty;
                const discount = Math.max(0, unpaid - penalty);

                newData.details.unpaidAmount = unpaid.toFixed(2);
                newData.details.fee = fee.toFixed(2);
                newData.details.penalty = penalty.toFixed(2);
                newData.details.totalUnpaid = totalDebt.toFixed(2);
                newData.details.discountAmount = discount.toFixed(2);
                newData.debtAmount = totalDebt.toFixed(2);

                // Backward compatibility sync for the first order (UI elements that bind to details.*)
                if (invIdx === 0 && ordIdx === 0) {
                    if (field === 'productDescription') newData.details.productDescription = value;
                    if (field === 'contractDate') newData.details.contractDate = value;
                    if (field === 'paymentPeriod') newData.details.paymentPeriod = value;
                    if (field === 'monthlyPayment') newData.details.monthlyPayment = value;
                    if (field === 'initialPayment') newData.details.initialPayment = value;
                }
            }

            return newData;
        });
    };

    const addInvoice = () => {
        setLocalData(prev => {
            let currentInvoices = [...(prev.details?.invoices || [])];

            // If currently showing virtual fallback, materialize it first
            if (currentInvoices.length === 0) {
                currentInvoices = [{
                    id: 'def',
                    invoiceNumber: prev.details?.contractNumber || "",
                    archiveRequested: false,
                    orders: [{
                        id: 'o_def',
                        productDescription: prev.details?.productDescription || "",
                        phoneCount: prev.details?.phoneCount || 1,
                        contractDate: prev.details?.contractDate || "",
                        paymentPeriod: prev.details?.paymentPeriod || "",
                        monthlyPayment: prev.details?.monthlyPayment || "",
                        initialPayment: prev.details?.initialPayment || "",
                        paidAmount: prev.details?.paidAmount || "0.00",
                        totalPrice: prev.details?.totalPrice || "0.00"
                    }]
                }];
            }

            const newInv = {
                id: Math.random().toString(36).substring(7),
                invoiceNumber: "",
                archiveRequested: false,
                orders: [{
                    id: Math.random().toString(36).substring(7),
                    productDescription: "",
                    phoneCount: 1,
                    contractDate: "",
                    paymentPeriod: "",
                    monthlyPayment: "",
                    initialPayment: "",
                    paidAmount: "0.00",
                    totalPrice: "0.00"
                }]
            };
            toast.success("Yeni faktura üçün hissə yaradıldı");
            return { ...prev, details: { ...prev.details, invoices: [newInv, ...currentInvoices] } };
        });
    };

    const addOrder = (invId: string) => {
        setLocalData(prev => {
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
                paidAmount: "0.00",
                totalPrice: "0.00"
            };

            invoices[idx] = { ...invoices[idx], orders: [newOrder, ...(invoices[idx].orders || [])] };
            toast.success("Yeni məhsul üçün hissə yaradıldı");
            return { ...prev, details: { ...prev.details, invoices } };
        });
    };

    const removeInvoice = (id: string) => {
        setLocalData(prev => ({
            ...prev,
            details: { ...prev.details, invoices: prev.details?.invoices?.filter(i => i.id !== id) }
        }));
    };

    const removeOrder = (invId: string, orderId: string) => {
        setLocalData(prev => {
            const invoices = [...(prev.details?.invoices || [])];
            const idx = invoices.findIndex(i => i.id === invId);
            if (idx === -1) return prev;

            invoices[idx] = {
                ...invoices[idx],
                orders: (invoices[idx].orders || []).filter(o => o.id !== orderId)
            };
            return { ...prev, details: { ...prev.details, invoices } };
        });
    };

    const handleSave = async (e: React.MouseEvent) => {
        e.stopPropagation();

        const dataToSave = { ...localData };
        const currentStatus = dataToSave.process_status || 'INSPECTOR_ENTERED';
        const currentIndex = STATUS_ORDER.indexOf(currentStatus);

        // Status updates for roles (Forward only)
        if (user?.role === 'ARCHIVER') {
            const archIndex = STATUS_ORDER.indexOf('ARCHIVE_UPLOADED');
            if (archIndex > currentIndex) {
                dataToSave.process_status = 'ARCHIVE_UPLOADED';
            }
        } else if (user?.role === 'ADMIN') {
            const adminIndex = STATUS_ORDER.indexOf('FILLED_BY_ADMIN');
            if (adminIndex > currentIndex) {
                dataToSave.process_status = 'FILLED_BY_ADMIN';
            }
        }

        const savePromise = onSave(dataToSave);
        toast.promise(savePromise, {
            loading: 'Yadda saxlanılır...',
            success: 'Məlumatlar güncəlləndi',
            error: 'Xəta baş verdi'
        });
        await savePromise;
        setIsEditing(false);
    };

    const handleWarningClick = async (e: React.MouseEvent) => {
        e.stopPropagation();

        // 1. SIMPLIFIED VALIDATION for Warning
        const isEmpty = (v: any) => v === undefined || v === null || v.toString().trim() === "";

        // Check Personal Info
        const personalInfo = {
            "Ad Soyad": localData.fullName,
            "Cins": localData.details?.gender,
            "Doğum Tarixi": localData.details?.birthDate,
            "FİN": localData.details?.fin,
            "Seriya №": localData.details?.passportSeries,
            "Telefon": localData.details?.phone
        };
        for (const [fieldName, val] of Object.entries(personalInfo)) {
            if (isEmpty(val)) {
                toast.error(`Xəbərdarlıq üçün əskik məlumat: [Şəxsi Məlumatlar] bölməsində "${fieldName}" xanasını doldurun.`);
                if (!isExpanded) setIsExpanded(true);
                return;
            }
        }

        // Check Address (Only Registration is mandatory for warning)
        if (isEmpty(localData.details?.address)) {
            toast.error(`Xəbərdarlıq üçün əskik məlumat: [Ünvan Məlumatları] bölməsində "Qeydiyyat Ünvanı" mütləq doldurulmalıdır.`);
            if (!isExpanded) setIsExpanded(true);
            return;
        }

        // Check Orders (Product Name and Contract Date only)
        const invoices = localData.details?.invoices || [];
        if (invoices.length === 0) {
            toast.error("Xəbərdarlıq üçün əskik məlumat: Sifariş detayları mövcud deyil.");
            if (!isExpanded) setIsExpanded(true);
            return;
        }

        for (const inv of invoices) {
            if (!inv.orders || inv.orders.length === 0) {
                toast.error("Xəbərdarlıq üçün əskik məlumat: Faktura daxilində məhsul daxil edilməyib.");
                if (!isExpanded) setIsExpanded(true);
                return;
            }
            for (const ord of inv.orders) {
                if (isEmpty(ord.productDescription) || isEmpty(ord.contractDate)) {
                    toast.error("Xəbərdarlıq üçün əskik məlumat: Sifariş detallarında [Məhsul adı] və [Müqavilə tarixi] mütləq dolmalıdır.");
                    if (!isExpanded) setIsExpanded(true);
                    return;
                }
            }
        }

        let updatedData = { ...localData };
        const hasDate = !!getValue("details.warningDate");

        if (!hasDate) {
            const now = new Date();
            const dd = String(now.getDate()).padStart(2, '0');
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const yyyy = now.getFullYear();
            const formattedDate = `${dd}.${mm}.${yyyy}`;

            updatedData = {
                ...localData,
                details: {
                    ...localData.details,
                    warningDate: formattedDate,
                    isWarningSent: true
                }
            };

            setLocalData(updatedData);
            const savePromise = onSave(updatedData);
            toast.promise(savePromise, {
                loading: 'Tarix qeyd edilir...',
                success: 'Xəbərdarlıq tarixi qeyd edildi',
                error: 'Xəta baş verdi'
            });
            await savePromise;
        }

        router.push(`/reports/generate?id=${row.id}&template=Xəbərdarlıq Sənədi`);
    };

    const handleArchiveRequest = async (invId: string, e: React.MouseEvent) => {
        e.stopPropagation();

        const inv = localData.details?.invoices?.find(i => i.id === invId);
        if (!inv) return;

        if (!inv.invoiceNumber.trim()) {
            toast.error("Arxivdən sənəd istəmək üçün Faktura № və Müqavilə Tarixi mütləq daxil edilməlidir.");
            return;
        }

        const hasContractDate = inv.orders?.some(o => o.contractDate && o.contractDate.trim() !== "");
        if (!hasContractDate) {
            toast.error("Arxivdən sənəd istəmək üçün ən azı bir Məhsulun Müqavilə Tarixi daxil edilməlidir.");
            return;
        }

        const updatedInvoices = [...(localData.details?.invoices || [])];
        const idx = updatedInvoices.findIndex(i => i.id === invId);
        updatedInvoices[idx] = { ...updatedInvoices[idx], archiveRequested: true };

        const updatedData = {
            ...localData,
            process_status: 'WAITING_FOR_ARCHIVE' as ProcessStatus,
            details: { ...localData.details, invoices: updatedInvoices }
        };

        setLocalData(updatedData);
        const savePromise = onSave(updatedData);
        toast.promise(savePromise, {
            loading: 'Arxivə sorğu göndərilir...',
            success: 'Arxivdən sənəd istəyi göndərildi',
            error: 'Xəta baş verdi'
        });
        await savePromise;
    };

    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation();
        setLocalData(JSON.parse(JSON.stringify(row)));
        setIsEditing(false);
        if (!row.id) onDelete(index); // If it's a new unsaved row, remove it
    };

    const formatDateTime = (value: string | Date) => {
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
    const canSeeField = (fieldId: string) => {
        if (user?.role === 'SUPERADMIN') return true;
        return user?.permissions?.includes(fieldId);
    };

    const toggleExpand = () => {
        if (!isEditing) setIsExpanded(!isExpanded);
    };

    const getValue = (path: string) => {
        if (path.startsWith('details.')) {
            return localData.details?.[path.split('.')[1] as keyof typeof localData.details] || "";
        }
        return (localData as any)[path] || "";
    };

    const fetchDataFromPortal = async (e: React.MouseEvent) => {
        e.stopPropagation();

        const fin = getValue("details.fin");
        const sv = getValue("details.passportSeries");

        if (!fin || !sv) {
            toast.error("Məlumatları gətirmək üçün FİN və Seriya nömrəsi daxil edilməlidir");
            return;
        }

        const fetchPromise = async () => {
            const res = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fin, sv })
            });

            const result = await res.json();
            if (!res.ok) {
                if (result.error === "LOGIN_REQUIRED") {
                    toast.info(result.message, { duration: 10000 });
                    throw new Error("Giriş tələb olunur");
                }
                throw new Error(result.error || "Xəta baş verdi");
            }

            const updatedData = {
                ...localData,
                fullName: result.data.fullName || localData.fullName,
                details: {
                    ...localData.details,
                    gender: result.data.gender || localData.details?.gender,
                    birthDate: result.data.birthDate || localData.details?.birthDate,
                    address: result.data.address || localData.details?.address,
                }
            };

            setLocalData(updatedData);

            // Auto-save logic
            await onSave(updatedData);

            return "Məlumatlar uğurla gətirildi";
        };

        toast.promise(fetchPromise(), {
            loading: 'Portaldan məlumatlar gətirilir...',
            success: (msg) => msg,
            error: (err) => err.message || "Bilinməyən xəta baş verdi"
        });
    };



    return (
        <div className="flex items-stretch gap-4 group/row">
            {/* ════ LEFT TIMELINE PANEL ════ */}
            <div className="hidden lg:flex flex-col shrink-0 w-[125px] relative pt-3 pb-4 pr-1 transition-all">
                {/* Vertical Connector Line */}
                <div className="absolute left-[20px] top-7 bottom-8 w-[2px] bg-slate-200 rounded-full" />

                <div className="space-y-7 relative">
                    {/* 1. CREATION EVENT */}
                    {row.createdAt && (() => {
                        const { date, time } = formatDateTime(row.createdAt);
                        return (
                            <div className="relative pl-8 group/item">
                                {/* Timeline Dot/Icon */}
                                <div className="absolute left-[12px] top-0.5 w-4 h-4 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center z-10 transition-all group-hover/item:border-blue-500 group-hover/item:shadow-[0_0_0_4px_rgba(59,130,246,0.1)]">
                                    <div className="w-1 h-1 rounded-full bg-slate-300 transition-all group-hover/item:bg-blue-500" />
                                </div>

                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest group-hover/item:text-blue-600 transition-colors">
                                        DAXİL EDİLİB
                                    </span>
                                    <div className="flex flex-col leading-[1.3] text-slate-700">
                                        <span className="text-[10px] font-bold tracking-tight">{date}</span>
                                        <span className="text-[9px] font-medium text-slate-500">{time}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* 2. ASSIGNMENT EVENT */}
                    {row.assignedAt && (() => {
                        const { date, time } = formatDateTime(row.assignedAt);
                        return (
                            <div className="relative pl-8 group/item">
                                {/* Timeline Dot/Icon */}
                                <div className="absolute left-[12px] top-0.5 w-4 h-4 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center z-10 transition-all group-hover/item:border-purple-500 group-hover/item:shadow-[0_0_0_4px_rgba(168,85,247,0.1)]">
                                    <div className="w-1 h-1 rounded-full bg-slate-300 transition-all group-hover/item:bg-purple-500" />
                                </div>

                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest group-hover/item:text-purple-600 transition-colors">
                                        TƏYİNAT
                                    </span>
                                    <div className="flex flex-col leading-[1.3] text-slate-700">
                                        <span className="text-[10px] font-bold tracking-tight">{date}</span>
                                        <span className="text-[9px] font-medium text-slate-500">{time}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* 3. PRINTING EVENT */}
                    {(row as any).printedAt && (() => {
                        const { date, time } = formatDateTime((row as any).printedAt);
                        return (
                            <div className="relative pl-8 group/item">
                                {/* Timeline Dot/Icon */}
                                <div className="absolute left-[12px] top-0.5 w-4 h-4 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center z-10 transition-all group-hover/item:border-emerald-500 group-hover/item:shadow-[0_0_0_4px_rgba(16,185,129,0.1)]">
                                    <div className="w-1 h-1 rounded-full bg-slate-300 transition-all group-hover/item:bg-emerald-500" />
                                </div>

                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest group-hover/item:text-emerald-600 transition-colors">
                                        SƏNƏD ÇAPI
                                    </span>
                                    <div className="flex flex-col leading-[1.3] text-slate-700">
                                        <span className="text-[10px] font-bold tracking-tight">{date}</span>
                                        <span className="text-[9px] font-medium text-slate-500">{time}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* MAIN CARD */}
            <div
                ref={cardRef}
                className={cn(
                    "relative bg-white rounded-xl border transition-all duration-300 overflow-hidden flex-1",
                    isExpanded
                        ? "border-slate-300 shadow-lg ring-1 ring-slate-200"
                        : "border-slate-200 hover:border-slate-400 hover:shadow-md cursor-pointer group"
                )} >
                {/* HEADER / COMPACT VIEW */}
                <div
                    className={cn(
                        "flex flex-col transition-all cursor-pointer",
                        isExpanded ? "bg-slate-50/50" : "hover:bg-slate-50/30"
                    )}
                    onClick={toggleExpand}
                >
                    {/* TOP ROW: PRIMARY INFO */}
                    <div className="px-6 pt-3 pb-2 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-5 flex-1 min-w-0">
                            <div className={cn(
                                "h-10 w-10 rounded-xl flex items-center justify-center text-[12px] font-black transition-all shrink-0 border",
                                isExpanded ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200" : "bg-white text-slate-600 border-slate-500 group-hover:border-slate-300 group-hover:text-slate-900"
                            )}>
                                {totalRows - index}
                            </div>

                            <div className="flex-1 min-w-0">
                                {isEditing ? (
                                    <input
                                        autoFocus
                                        value={localData.fullName || ""}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => handleFieldChange("fullName", e.target.value)}
                                        className="bg-transparent border-b-2 border-primary/20 outline-none text-lg font-bold text-slate-900 tracking-tight w-full max-w-md"
                                        placeholder="SOYAD AD ATA ADI"
                                    />
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-none truncate group-hover:text-primary transition-colors">
                                                {row.fullName || "YENİ MÜŞTƏRİ"}
                                            </h3>
                                            {(() => {
                                                const invoices = row.details?.invoices || [];
                                                const invCount = invoices.length;
                                                let prodCount = 0;
                                                invoices.forEach(inv => {
                                                    prodCount += (inv.orders?.length || 0);
                                                });

                                                if (invCount === 0) return null;

                                                return (
                                                    <div className="flex items-center gap-2 bg-slate-900/[0.03] text-slate-600 border border-slate-200/60 px-2.5 py-1 rounded-lg shrink-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] font-black uppercase tracking-wider">{invCount} Faktura</span>
                                                            <div className="w-1 h-1 rounded-full bg-slate-300" />
                                                            <span className="text-[10px] font-black uppercase tracking-wider">{prodCount} Məhsul</span>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                            {/* Status Badge
                                            {row.process_status && STATUS_LABELS[row.process_status] && (
                                                <div className={cn(
                                                    "px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border",
                                                    STATUS_LABELS[row.process_status].bg,
                                                    STATUS_LABELS[row.process_status].color.replace('text-', 'border-').replace('600', '200'),
                                                    STATUS_LABELS[row.process_status].color
                                                )}>
                                                    {STATUS_LABELS[row.process_status].label}
                                                </div>
                                            )} */}
                                        </div>

                                        <div className="flex items-center gap-3">


                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* BOTTOM ROW: SECONDARY INFO & ACTIONS */}
                    <div className="px-6 pb-4 pt-1 flex items-center justify-between gap-4 border-t border-transparent">
                        <div className="flex items-center gap-8 flex-1">
                            {/* EXECUTOR INFO */}
                            <div className="flex items-center gap-3">
                                <div className="h-7 w-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                                    <Users size={14} />
                                </div>
                                <div className="flex flex-col font-medium">
                                    <span className="text-[10px] text-slate-600 tracking-wide mb-0.5">Müfəttiş</span>
                                    {isEditing ? (
                                        <input
                                            value={getValue("details.executorName")}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => handleFieldChange("details.executorName", e.target.value)}
                                            className="bg-transparent text-sm font-semibold text-slate-800 outline-none w-24 border-b border-transparent focus:border-blue-400"
                                            placeholder="Ad Soyad"
                                        />
                                    ) : (
                                        <span className="text-[13px] font-semibold text-slate-800">
                                            {getValue("details.executorName") || "Təyin edilməyib"}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* QALIQ BORC - next to Müfəttiş */}
                            <div className="flex items-center gap-3 pl-6 border-l border-slate-500">
                                <div className="h-7 w-7 rounded-lg bg-red-50 text-red-500 flex items-center justify-center border border-red-100">
                                    <DollarSign size={14} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-slate-600 tracking-wide mb-0.5">Qalıq Borc</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className={cn(
                                            "text-[15px] font-bold tracking-tight",
                                            parseFloat(localData.debtAmount || "0") > 0 ? "text-slate-900" : "text-green-600"
                                        )}>{localData.debtAmount || "0.00"}</span>
                                        <span className="text-[10px] font-bold text-slate-600">AZN</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {isEditing ? (
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    <button onClick={handleSave} className="h-9 px-4.5 bg-red-600 text-white rounded-xl font-bold text-[14px] uppercase tracking-wider hover:bg-red-700 transition-all flex items-center gap-2 shadow-lg shadow-red-600/20">
                                        <Check size={18} /> YADDA SAXLA
                                    </button>
                                    <button onClick={handleCancel} className="h-9 w-9 flex items-center justify-center bg-white text-slate-600 rounded-xl hover:text-slate-900 border border-slate-200 transition-all">
                                        <X size={18} />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>

                                    {row.id && (
                                        <>
                                            {/* ZAP / FETCH DATA BUTTON */}

                                            {/* <button
                                                onClick={fetchDataFromPortal}
                                                className="h-8.5 px-3 bg-primary/10 text-primary rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-primary hover:text-white transition-all border border-primary/20 flex items-center gap-1.5"
                                                title="Portaldan Məlumatları Gətir"
                                            >
                                                <ArrowDownToLine size={14} />
                                                <span className="xl:inline">Məlumatları Gətir</span>
                                            </button> */}

                                            {(user?.role === 'SUPERADMIN' || user?.permissions?.includes('action_warning')) && (() => {
                                                const overdue = isOverdue(getValue("details.warningDate"));
                                                return (
                                                    <button
                                                        onClick={handleWarningClick}
                                                        className={cn(
                                                            "h-auto py-2.5 px-5 flex items-center gap-2.5 transition-all border rounded-xl",
                                                            overdue
                                                                ? "bg-red-50 text-red-600 border-red-200/50 hover:bg-red-100"
                                                                : "bg-amber-50 text-amber-600 border-amber-200/50 hover:bg-amber-100"
                                                        )}
                                                    >
                                                        <AlertTriangle size={14} strokeWidth={2.5} className={overdue ? "text-red-500" : "text-amber-500"} />
                                                        <div className="flex flex-col items-start leading-tight">
                                                            <span className="text-[10px] font-bold uppercase tracking-wider">XƏBƏRDARLIQ</span>
                                                            {getValue("details.warningDate") && (
                                                                <span className="text-[9px] font-bold opacity-70">
                                                                    {getValue("details.warningDate")}
                                                                    {overdue && " (+5 gün)"}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })()}
                                            {canUpdate && (
                                                <button
                                                    onClick={() => { setIsEditing(true); setIsExpanded(true); }}
                                                    className="h-8.5 px-5 flex items-center gap-2 bg-white text-slate-600 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-all font-bold text-[10px] uppercase tracking-wider border border-slate-200"
                                                >
                                                    <Edit2 size={12} /> DÜZƏLİŞ
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    const isKarabakh = isKarabakhAddress(localData.details?.address || "");

                                                    const sections: any = {
                                                        "Şəxsi Məlumatlar": {
                                                            "Ad Soyad": localData.fullName,
                                                            "Cins": localData.details?.gender,
                                                            "Doğum Tarixi": localData.details?.birthDate,
                                                            "FİN": localData.details?.fin,
                                                            "Seriya №": localData.details?.passportSeries,
                                                            "Telefon": localData.details?.phone
                                                        },
                                                        "Ünvan Məlumatları": {
                                                            "Qeydiyyat Ünvanı": localData.details?.address,
                                                        },
                                                        "Ödəniş Məlumatları": {
                                                            "Ödənilən məbləğ": localData.details?.paidAmount
                                                        }
                                                    };

                                                    if (isKarabakh) {
                                                        sections["Ünvan Məlumatları"]["Faktiki Yaşayış"] = localData.details?.actualAddress;
                                                    }

                                                    const isEmpty = (v: any) => v === undefined || v === null || v.toString().trim() === "";

                                                    for (const [title, fields] of Object.entries(sections)) {
                                                        for (const [fieldName, val] of Object.entries(fields as any)) {
                                                            if (isEmpty(val)) {
                                                                toast.error(`Əskik məlumat: [${title}] bölməsində "${fieldName}" xanasını doldurun.`);
                                                                if (!isExpanded) setIsExpanded(true);
                                                                return;
                                                            }
                                                        }
                                                    }

                                                    if (isEmpty(localData.store)) {
                                                        toast.error("Faktura və Sifariş Detalları bölməsində, sifarişin \"Mağaza\" xanasını doldurun.");
                                                        if (!isExpanded) setIsExpanded(true);
                                                        return;
                                                    }

                                                    const invoices = localData.details?.invoices || [];
                                                    if (invoices.length === 0) {
                                                        toast.error("Əskik doldurulan məlumat var: [Faktura və Sifariş] bölməsinə məlumat əlavə edin.");
                                                        if (!isExpanded) setIsExpanded(true);
                                                        return;
                                                    }

                                                    for (const inv of invoices) {
                                                        if (!inv.invoiceNumber) {
                                                            toast.error("Əskik doldurulan məlumat var: [Faktura və Sifariş] (Faktura №) xanasını doldurun.");
                                                            if (!isExpanded) setIsExpanded(true);
                                                            return;
                                                        }
                                                        if (!inv.orders || inv.orders.length === 0) {
                                                            toast.error("Əskik doldurulan məlumat var: [Faktura və Sifariş] bölməsinə məhsul əlavə edin.");
                                                            if (!isExpanded) setIsExpanded(true);
                                                            return;
                                                        }
                                                        for (const ord of inv.orders) {
                                                            if (!ord.productDescription || !ord.contractDate || !ord.paymentPeriod || !ord.monthlyPayment || !ord.initialPayment) {
                                                                toast.error("Əskik doldurulan məlumat var: [Faktura və Sifariş] detallarını tam doldurun.");
                                                                if (!isExpanded) setIsExpanded(true);
                                                                return;
                                                            }
                                                        }
                                                    }
                                                    router.push(`/reports/generate?id=${row.id}`);
                                                }}
                                                className="h-8.5 px-5 flex items-center gap-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-bold text-[10px] uppercase tracking-wider"
                                            >
                                                <FileText size={12} /> SƏNƏD ÇAPI
                                            </button>
                                        </>
                                    )}
                                    {canDelete && (
                                        <button
                                            onClick={() => onDelete(index)}
                                            className="h-8 w-8 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* EXPANDED CONTENT */}
                {isExpanded && (
                    <div className="p-3 lg:p-4 space-y-4 bg-slate-50">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                            {/* LEFT: PERSONAL INFO & ADDRESS */}
                            <div className="lg:col-span-7 space-y-4">
                                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow space-y-4">
                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                                        <div className="h-6 w-6 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                                            <User size={12} />
                                        </div>
                                        <h4 className="text-[10px] font-bold text-slate-800 uppercase tracking-wider">Şəxsi Məlumatlar</h4>
                                    </div>

                                    <CustomerField label="SOYAD AD ATA ADI" path="fullName" value={localData.fullName || ""} onChange={handleFieldChange} isEditing={isEditing} />

                                    <div className="grid grid-cols-2 lg:grid-cols-12 gap-4">
                                        <CustomerField label="Cins" isSelect={true} path="details.gender" value={getValue("details.gender")} onChange={handleFieldChange} isEditing={isEditing} className="lg:col-span-3" />
                                        <CustomerField label="Doğum Tarixi" path="details.birthDate" value={getValue("details.birthDate")} onChange={handleFieldChange} isEditing={isEditing} className="lg:col-span-5" />
                                        <CustomerField
                                            label="FİN"
                                            path="details.fin"
                                            value={getValue("details.fin")}
                                            onChange={handleFieldChange}
                                            isEditing={isEditing}
                                            isFin={true}
                                            maxLength={7}
                                            className="lg:col-span-4"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 lg:grid-cols-12 gap-4">
                                        <CustomerField label="Seriya Nömrəsi" path="details.passportSeries" value={getValue("details.passportSeries")} onChange={handleFieldChange} isEditing={isEditing} className="lg:col-span-5" />
                                        <CustomerField label="Telefon Nömrəsi" path="details.phone" placeholder="0501234567" value={getValue("details.phone")} onChange={handleFieldChange} isEditing={isEditing} className="lg:col-span-7" />
                                    </div>

                                    {/* Address info merged inside personal block as requested */}
                                    <div className="pt-2 grid grid-cols-1 gap-4">

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            <CustomerField
                                                label="Qeydiyyat Ünvanı"
                                                path="details.address"
                                                placeholder="Şəhər, Rayon..."
                                                value={getValue("details.address")}
                                                onChange={handleFieldChange}
                                                isEditing={isEditing}
                                                className={!isKarabakhAddress(getValue("details.address")) ? "lg:col-span-2" : ""}
                                            />
                                            {isKarabakhAddress(getValue("details.address")) && (
                                                <CustomerField label="Faktiki Yaşayış" path="details.actualAddress" placeholder="Şəhər, Rayon..." value={getValue("details.actualAddress")} onChange={handleFieldChange} isEditing={isEditing} className=" rounded-xl bg-orange-50/5" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT: DEBT DETAILS */}
                            <div className="lg:col-span-5 space-y-4">
                                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow space-y-4 h-full">
                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                                        <div className="h-6 w-6 rounded-lg bg-red-500 text-white flex items-center justify-center">
                                            <DollarSign size={12} />
                                        </div>
                                        <h4 className="text-[10px] font-bold text-slate-800 uppercase tracking-wider">Borc Detalları</h4>
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                        <CustomerField label="Alqı-satqı qiyməti" path="details.totalPrice" value={getValue("details.totalPrice")} onChange={handleFieldChange} isEditing={isEditing} />
                                        <CustomerField label="Əsas borca ödənilmiş məbləğ" path="details.paidAmount" value={getValue("details.paidAmount")} onChange={handleFieldChange} isEditing={isEditing} />
                                        <CustomerField label="Əsas borca ödənilməmiş məbləğ" path="details.unpaidAmount" value={getValue("details.unpaidAmount")} onChange={handleFieldChange} isEditing={isEditing} />
                                        <CustomerField label="İnnovativ Layihələr Mərkəzi Rüsumu" path="details.fee" value={getValue("details.fee")} onChange={handleFieldChange} isEditing={isEditing} />
                                        <CustomerField label="Cərimə" path="details.penalty" value={getValue("details.penalty")} onChange={handleFieldChange} isEditing={isEditing} />
                                        <CustomerField label="Güzəşt Məbləği" path="details.discountAmount" value={getValue("details.discountAmount")} onChange={handleFieldChange} isEditing={isEditing} />
                                        <CustomerField label="Ümumilikdə ödənilməmiş məbləğ" path="details.totalUnpaid" isCemi={true} value={getValue("details.totalUnpaid")} onChange={handleFieldChange} isEditing={isEditing} className="col-span-2" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* BOTTOM: INVOICES (SIFARIS DETALLARI) */}
                        {can('fields_invoice') ? (
                            <div className="bg-white p-5 lg:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="h-8 w-8 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                                            <Box size={14} />
                                        </div>
                                        <h4 className="text-[10px] font-bold text-slate-800 uppercase tracking-wider">Faktura və Sifariş Detalları</h4>
                                    </div>
                                    {isEditing && (
                                        <button
                                            onClick={() => {
                                                if (!isEditing) setIsEditing(true);
                                                addInvoice();
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 text-primary rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-primary hover:text-white transition-all border border-primary/10"
                                        >
                                            <Plus size={10} /> Yeni Faktura
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 gap-8">
                                    {(localData.details?.invoices || [{
                                        id: 'def',
                                        invoiceNumber: getValue("details.contractNumber"),
                                        archiveUrl: "",
                                        archiveBase64: "",
                                        archiveName: "",
                                        archiveRequested: false,
                                        orders: [{
                                            id: 'o_def',
                                            productDescription: getValue("details.productDescription"),
                                            phoneCount: localData.details?.phoneCount || 1,
                                            contractDate: getValue("details.contractDate"),
                                            paymentPeriod: getValue("details.paymentPeriod"),
                                            monthlyPayment: getValue("details.monthlyPayment"),
                                            initialPayment: getValue("details.initialPayment"),
                                            paidAmount: getValue("details.paidAmount") || "0.00",
                                            totalPrice: getValue("details.totalPrice")
                                        }]
                                    }]).map((inv, idx) => (
                                        <div key={inv.id} className="relative group p-6 rounded-[2rem] border-2 border-red-100 hover:border-red-200 transition-all bg-white shadow-sm">

                                            {/* HEADER SECTION */}
                                            <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 mb-6">
                                                {/* Left: Invoice Number */}
                                                <div className="flex items-end gap-4 w-full xl:w-auto">
                                                    <div className="shrink-0 h-11 w-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-sm font-black text-slate-500 shadow-sm mb-0.5">
                                                        {idx + 1}
                                                    </div>
                                                    <div className="space-y-1.5 flex-1 xl:flex-none">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                readOnly={!isEditing}
                                                                value={inv.invoiceNumber || ""}
                                                                onChange={(e) => updateInvoice(inv.id, 'invoiceNumber', e.target.value)}
                                                                className={cn(
                                                                    "h-11 px-4 rounded-xl text-sm font-bold outline-none transition-all w-full xl:w-[280px] shadow-sm",
                                                                    isEditing
                                                                        ? "bg-white border-2 border-slate-900 focus:border-black focus:ring-4 focus:ring-slate-100 placeholder:text-slate-300"
                                                                        : "bg-slate-50 border border-slate-500 text-slate-900"
                                                                )}
                                                                placeholder="Faktura Nömrəsi"
                                                            />
                                                            {!inv.archiveUrl && !inv.archiveBase64 && !inv.archiveRequested && (
                                                                <button
                                                                    onClick={(e) => handleArchiveRequest(inv.id, e)}
                                                                    className="h-11 px-6 bg-orange-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-orange-100 hover:text-red transition-all border border-orange-200/50 flex items-center gap-2"
                                                                >
                                                                    <FolderArchive size={14} /> Sənədi istə
                                                                </button>
                                                            )}
                                                            {inv.archiveRequested && !inv.archiveUrl && !inv.archiveBase64 && (
                                                                <div className="h-11 px-6 bg-slate-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-wider border border-slate-200 flex items-center gap-2 italic">
                                                                    Sorğu göndərilib...
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right: Controls */}
                                                <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-end">

                                                    {/* VIEW FILE */}
                                                    {(inv.archiveBase64 || inv.archiveUrl) && (
                                                        <div className="bg-emerald-50 rounded-xl border border-emerald-200/60 p-1 pr-3 flex items-center gap-3 h-11">
                                                            <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                                                <FileText size={14} />
                                                            </div>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const data = inv.archiveUrl || inv.archiveBase64;
                                                                    if (data) window.open(data, '_blank');
                                                                    else toast.error("Fayl tapılmadı");
                                                                }}
                                                                className="text-[10px] font-black text-emerald-700 uppercase tracking-wider hover:text-emerald-800"
                                                            >
                                                                Sənədə Bax
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* STORE */}
                                                    <div className="relative group/store min-w-[220px]">
                                                        {isEditing ? (
                                                            <div className="relative">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setOpenStoreDropdownId(openStoreDropdownId === inv.id ? null : inv.id);
                                                                        setDropdownSelectedIndex(0);
                                                                        setStoreSearch("");
                                                                    }}
                                                                    className="w-full h-11 pl-10 pr-4 bg-white text-[11px] font-bold text-slate-800 outline-none flex items-center justify-between rounded-xl border-2 border-slate-900 hover:border-black focus:ring-4 focus:ring-slate-100 transition-all shadow-sm"
                                                                >
                                                                    <Store size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                                                                    <span className="truncate flex-1 text-left">{localData.store || "Mağaza Seç"}</span>
                                                                    <ChevronDown size={14} className={cn("transition-transform duration-300", openStoreDropdownId === inv.id && "rotate-180")} />
                                                                </button>

                                                                {openStoreDropdownId === inv.id && (
                                                                    <>
                                                                        <div
                                                                            className="fixed inset-0 z-[90]"
                                                                            onClick={() => setOpenStoreDropdownId(null)}
                                                                        />
                                                                        <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-slate-200 rounded-[1.5rem] shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                                                            <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                                                                                <div className="relative">
                                                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                                                                                    <input
                                                                                        autoFocus
                                                                                        value={storeSearch}
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                        onChange={(e) => {
                                                                                            setStoreSearch(e.target.value);
                                                                                            setDropdownSelectedIndex(0);
                                                                                        }}
                                                                                        onKeyDown={(e) => {
                                                                                            const filtered = stores.filter(s => s.name.toLowerCase().includes(storeSearch.toLowerCase()));
                                                                                            if (e.key === 'ArrowDown') {
                                                                                                e.preventDefault();
                                                                                                setDropdownSelectedIndex(prev => (prev + 1) % (filtered.length || 1));
                                                                                            } else if (e.key === 'ArrowUp') {
                                                                                                e.preventDefault();
                                                                                                setDropdownSelectedIndex(prev => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1));
                                                                                            } else if (e.key === 'Enter') {
                                                                                                e.preventDefault();
                                                                                                if (filtered[dropdownSelectedIndex]) {
                                                                                                    setLocalData(prev => ({ ...prev, store: filtered[dropdownSelectedIndex].name }));
                                                                                                    setOpenStoreDropdownId(null);
                                                                                                    setStoreSearch("");
                                                                                                }
                                                                                            } else if (e.key === 'Escape') {
                                                                                                setOpenStoreDropdownId(null);
                                                                                            }
                                                                                        }}
                                                                                        placeholder="Mağaza axtar..."
                                                                                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-slate-400 transition-all text-[11px] font-bold"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                            <div className="max-h-[250px] overflow-y-auto p-1.5 scrollbar-thin">
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setLocalData(prev => ({ ...prev, store: "" }));
                                                                                        setOpenStoreDropdownId(null);
                                                                                        setStoreSearch("");
                                                                                    }}
                                                                                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 transition-all text-[11px] font-bold text-slate-500 mb-1"
                                                                                >
                                                                                    Seçimi təmizlə
                                                                                </button>
                                                                                {stores
                                                                                    .filter(s => s.name.toLowerCase().includes(storeSearch.toLowerCase()))
                                                                                    .map((s, sIdx) => (
                                                                                        <button
                                                                                            key={s.id}
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setLocalData(prev => ({ ...prev, store: s.name }));
                                                                                                setOpenStoreDropdownId(null);
                                                                                                setStoreSearch("");
                                                                                            }}
                                                                                            className={cn(
                                                                                                "w-full text-left px-3 py-2 rounded-lg transition-all text-[11px] font-bold mb-0.5",
                                                                                                localData.store === s.name || dropdownSelectedIndex === sIdx ? "bg-slate-900 text-white" : "hover:bg-slate-100 text-slate-800"
                                                                                            )}
                                                                                        >
                                                                                            {s.name}
                                                                                        </button>
                                                                                    ))}
                                                                                {stores.filter(s => s.name.toLowerCase().includes(storeSearch.toLowerCase())).length === 0 && (
                                                                                    <div className="py-8 text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest italic">Mağaza tapılmadı</div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className={cn(
                                                                "h-11 px-4 flex items-center gap-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm",
                                                                localData.store ? "bg-white text-slate-700 border-slate-200" : "bg-slate-50 text-slate-400 border-slate-500"
                                                            )}>
                                                                <Store size={14} className={localData.store ? "text-primary" : "text-slate-400"} />
                                                                <span className="truncate max-w-[120px]">{localData.store || "Mağaza Seçilməyib"}</span>
                                                            </div>
                                                        )}
                                                    </div>



                                                    {/* DELETE INVOICE */}
                                                    {(isEditing || user?.role === 'SUPERADMIN') && (
                                                        <button
                                                            onClick={() => {
                                                                if (!isEditing) setIsEditing(true);
                                                                removeInvoice(inv.id);
                                                            }}
                                                            className="h-11 w-11 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all border border-red-100"
                                                            title="Fakturanı Sil"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* ORDERS LIST */}
                                            <div className="grid gap-4">
                                                {(inv.orders || []).map((ord, oidx) => (
                                                    <div key={ord.id} className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all group/ord relative">
                                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                                                            {/* Məhsul Adı */}
                                                            <div className="lg:col-span-3 space-y-2.5">
                                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 h-[20px] flex items-center">MƏHSUL ADI</label>
                                                                <input
                                                                    readOnly={!isEditing}
                                                                    value={ord.productDescription || ""}
                                                                    onChange={(e) => updateOrder(inv.id, ord.id, 'productDescription', e.target.value)}
                                                                    className={cn("w-full h-11 px-4 rounded-xl text-[13px] font-bold text-slate-800 outline-none transition-all shadow-sm", isEditing ? "bg-white border-2 border-slate-900 focus:border-black focus:ring-4 focus:ring-slate-100" : "bg-slate-50 border border-slate-500")}
                                                                    placeholder="Məhsul adı..."
                                                                />
                                                            </div>

                                                            {/* Müqavilə Tarixi */}
                                                            <div className="lg:col-span-2 space-y-2.5">
                                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 h-[20px] flex items-center">MÜQAVİLƏ TARİXİ</label>
                                                                <input
                                                                    readOnly={!isEditing}
                                                                    value={ord.contractDate || ""}
                                                                    onChange={(e) => updateOrder(inv.id, ord.id, 'contractDate', formatDateInput(e.target.value))}
                                                                    className={cn("w-full h-11 px-4 rounded-xl text-[13px] font-bold text-slate-800 outline-none transition-all text-center shadow-sm", isEditing ? "bg-white border-2 border-slate-900 focus:border-black focus:ring-4 focus:ring-slate-100" : "bg-slate-50 border border-slate-500")}
                                                                    placeholder="GG.AA.İİİİ"
                                                                />
                                                            </div>

                                                            {/* Ödəmə Parametrləri */}
                                                            <div className="lg:col-span-6 grid grid-cols-4 gap-3">
                                                                <div className="space-y-2.5">
                                                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center leading-tight h-[20px] flex items-center justify-center">Müddət</label>
                                                                    <input
                                                                        readOnly={!isEditing}
                                                                        value={ord.paymentPeriod || ""}
                                                                        onChange={(e) => {
                                                                            let v = e.target.value.replace(/[^0-9.,]/g, "").replace(/,/g, ".");
                                                                            if (v.startsWith("0") && v.length > 1 && v[1] !== ".") v = v.replace(/^0+/, "");
                                                                            const parts = v.split(".");
                                                                            if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
                                                                            updateOrder(inv.id, ord.id, 'paymentPeriod', v);
                                                                        }}
                                                                        className={cn("w-full h-11 px-2 rounded-xl text-[13px] font-bold text-slate-800 outline-none text-center transition-all shadow-sm", isEditing ? "bg-white border-2 border-slate-900 focus:border-black" : "bg-slate-50 border border-slate-500")}
                                                                    />
                                                                </div>
                                                                <div className="space-y-2.5">
                                                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center leading-tight h-[20px] flex items-center justify-center">İlkin Ödəniş</label>
                                                                    <input
                                                                        readOnly={!isEditing}
                                                                        value={ord.initialPayment || ""}
                                                                        onChange={(e) => {
                                                                            let v = e.target.value.replace(/[^0-9.,]/g, "").replace(/,/g, ".");
                                                                            const parts = v.split(".");
                                                                            if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
                                                                            updateOrder(inv.id, ord.id, 'initialPayment', v);
                                                                        }}
                                                                        className={cn("w-full h-11 px-2 rounded-xl text-[13px] font-bold text-slate-800 outline-none text-center transition-all shadow-sm", isEditing ? "bg-white border-2 border-slate-900 focus:border-black" : "bg-slate-50 border border-slate-500")}
                                                                    />
                                                                </div>
                                                                <div className="space-y-2.5">
                                                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center leading-tight h-[20px] flex items-center justify-center">Aylıq Ödəniş</label>
                                                                    <input
                                                                        readOnly={!isEditing}
                                                                        value={ord.monthlyPayment || ""}
                                                                        onChange={(e) => {
                                                                            let v = e.target.value.replace(/[^0-9.,]/g, "").replace(/,/g, ".");
                                                                            if (v.startsWith("0.00") && v.length > 4) v = v.slice(4);
                                                                            else if (v.startsWith("0") && v.length > 1 && v[1] !== ".") v = v.replace(/^0+/, "");
                                                                            const parts = v.split(".");
                                                                            if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
                                                                            updateOrder(inv.id, ord.id, 'monthlyPayment', v);
                                                                        }}
                                                                        className={cn("w-full h-11 px-2 rounded-xl text-[13px] font-bold text-slate-800 outline-none text-center transition-all shadow-sm", isEditing ? "bg-white border-2 border-slate-900 focus:border-black" : "bg-slate-50 border border-slate-500")}
                                                                    />
                                                                </div>
                                                                <div className="space-y-2.5">
                                                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center leading-tight h-[20px] flex items-center justify-center">Ödənilmiş</label>
                                                                    <input
                                                                        readOnly={!isEditing}
                                                                        value={ord.paidAmount || ""}
                                                                        onChange={(e) => {
                                                                            let v = e.target.value.replace(/[^0-9.,]/g, "").replace(/,/g, ".");
                                                                            if (v.startsWith("0.00") && v.length > 4) v = v.slice(4);
                                                                            else if (v.startsWith("0") && v.length > 1 && v[1] !== ".") v = v.replace(/^0+/, "");
                                                                            const parts = v.split(".");
                                                                            if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
                                                                            updateOrder(inv.id, ord.id, 'paidAmount', v);
                                                                        }}
                                                                        className={cn("w-full h-11 px-2 rounded-xl text-[13px] font-bold text-slate-800 outline-none text-center transition-all shadow-sm", isEditing ? "bg-white border-2 border-slate-900 focus:border-black" : "bg-slate-50 border border-slate-500")}
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* DELETE PRODUCT BUTTON */}
                                                            <div className="lg:col-span-1 flex justify-end pt-8">
                                                                {(isEditing || user?.role === 'SUPERADMIN') && (
                                                                    <button
                                                                        onClick={() => {
                                                                            if (!isEditing) setIsEditing(true);
                                                                            removeOrder(inv.id, ord.id);
                                                                        }}
                                                                        className="h-11 w-11 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                                        title="Məhsulu Sil"
                                                                    >
                                                                        <Trash2 size={20} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* TOTAL PRICE BAR */}
                                                        <div className="mt-6 pt-5 border-t border-slate-500 flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-2 w-2 rounded-full bg-primary/20 animate-pulse" />
                                                                <span className="text-[11px] font-black text-slate-600 uppercase tracking-[0.2em]">CƏMİ MƏBLƏĞ</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xl font-black text-slate-900 tracking-tighter">{ord.totalPrice || "0.00"}</span>
                                                                <span className="text-[11px] font-black text-slate-400 uppercase">AZN</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            {/* ADD PRODUCT
                                            {isEditing && (
                                                <div className="flex justify-end mt-4">
                                                    <button
                                                        onClick={() => {
                                                            if (!isEditing) setIsEditing(true);
                                                            addOrder(inv.id);
                                                        }}
                                                        className="h-11 px-4 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 flex items-center gap-2"
                                                    >
                                                        <Plus size={14} /> <span className="hidden sm:inline">Məhsul</span>
                                                    </button>
                                                </div>
                                            )} */}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white p-20 rounded-[2.5rem] border-2 border-dashed border-slate-500 flex flex-col items-center justify-center text-center opacity-20">
                                <Shield size={40} />
                                <p className="mt-6 text-sm font-black uppercase tracking-[0.2em] italic">Faktura Məlumatlarına Giriş Məhdudlaşdırılıb</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* RIGHT SIDE PANEL - Assignment, Store & status */}
            <div className="w-[180px] shrink-0 flex flex-col gap-2 self-start opacity-70 hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                {/* ASSIGNMENT - Only for Manager/Admin */}
                {can('action_assignment') && (
                    <div className="px-2 py-1.5">
                        <div className="flex items-center gap-2 mb-1.5 opacity-70">
                            <UserPlus size={10} />
                            <span className="text-[8px] font-bold uppercase tracking-wider">Təyinat</span>
                        </div>
                        <div className="relative group/sel">
                            <select
                                value={localData.assignedTo || ""}
                                onChange={async (e) => {
                                    const selectedId = e.target.value;
                                    const now = new Date().toISOString();
                                    const updated = {
                                        ...localData,
                                        assignedTo: selectedId,
                                        assignedAt: selectedId ? now : localData.assignedAt,
                                        process_status: (selectedId ? 'ASSIGNED_BY_MANAGER' : localData.process_status) as ProcessStatus
                                    };
                                    setLocalData(updated);

                                    // Auto-save logic for assignment
                                    toast.promise(onSave(updated), {
                                        loading: 'Təyinat qeyd edilir...',
                                        success: 'Müfəttiş təyin edildi',
                                        error: 'Xəta baş verdi'
                                    });
                                }}
                                className="w-full bg-slate-50 text-[10px] font-bold text-slate-700 outline-none appearance-none cursor-pointer pr-6 pl-2.5 py-2 rounded-lg border border-slate-200 hover:border-slate-300 transition-all shadow-sm focus:border-purple-400"
                            >
                                <option value="">Seçilməyib</option>
                                {appUsers.map((u: any) => {
                                    const active = userWorkload[u.id] ?? 0;
                                    const badge = active === 0 ? '✅ 0' : active <= 3 ? `🟢 ${active}` : `🔴 ${active}`;
                                    return (
                                        <option key={u.id} value={u.id}>
                                            {u.displayName || u.email} — {badge} iş
                                        </option>
                                    );
                                })}
                            </select>
                            <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                        </div>
                    </div>
                )}

                {/* STATUS */}
                <div className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5 mb-1.5 opacity-70">
                        <div className="h-1 w-1 rounded-full bg-slate-400" />
                        <span className="text-[8px] font-bold uppercase tracking-wider">Status</span>
                    </div>
                    {isEditing && can('action_status_change') ? (
                        <div className="relative group/sel">
                            <select
                                value={localData.process_status || "INSPECTOR_ENTERED"}
                                onChange={(e) => {
                                    const newStatus = e.target.value as ProcessStatus;
                                    const currentIndex = STATUS_ORDER.indexOf(localData.process_status || 'INSPECTOR_ENTERED');
                                    const newIndex = STATUS_ORDER.indexOf(newStatus);
                                    if (newIndex < currentIndex) {
                                        toast.error("Statusu geri çəkmək olmaz!");
                                        return;
                                    }
                                    setLocalData(prev => ({ ...prev, process_status: newStatus }));
                                }}
                                className="w-full bg-slate-50 text-[10px] font-bold text-slate-700 outline-none appearance-none cursor-pointer pr-5 pl-2.5 py-2 rounded-lg border border-slate-200 hover:border-slate-300 transition-all shadow-sm"
                            >
                                {STATUS_ORDER.map(status => (
                                    <option key={status} value={status}>{STATUS_LABELS[status].label}</option>
                                ))}
                            </select>
                            <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                        </div>
                    ) : (
                        <div className={cn(
                            "w-full px-2.5 py-2 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all shadow-sm text-center",
                            row.process_status && STATUS_LABELS[row.process_status]
                                ? `${STATUS_LABELS[row.process_status].bg} ${STATUS_LABELS[row.process_status].color} ${STATUS_LABELS[row.process_status].color.replace('text-', 'border-').replace('600', '100')}`
                                : "bg-white text-slate-400 border-slate-100"
                        )}>
                            {row.process_status ? STATUS_LABELS[row.process_status].label : "Daxil Edilib"}
                        </div>
                    )}
                </div>

                {/* ARCHIVE BUTTON - Only if COMPLETED and can archive */}
                {row.process_status === 'COMPLETED' && can('archive_manage') && (
                    <button
                        onClick={async (e) => {
                            e.stopPropagation();
                            const updated = { ...localData, isArchived: true };
                            setLocalData(updated);
                            toast.promise(onSave(updated), {
                                loading: 'Arxivlənir...',
                                success: 'Müştəri arxivə göndərildi',
                                error: 'Xəta baş verdi'
                            });
                        }}
                        className="mt-2 w-full h-10 flex items-center justify-center gap-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 hover:text-slate-900 transition-all font-bold text-[10px] uppercase tracking-wider border border-slate-300"
                    >
                        <FolderArchive size={14} /> Arxivə göndər
                    </button>
                )}
            </div>
        </div>
    );
});
CustomerCard.displayName = "CustomerCard";

/**
 * DASHBOARD PAGE COMPONENT
 */
export default function DashboardPage() {
    const router = useRouter();
    const { user, can } = useAuth();
    const [rows, setRows] = useState<CustomerRow[]>([]);
    const [appUsers, setAppUsers] = useState<any[]>([]);
    const [stores, setStores] = useState<any[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [warningFilter, setWarningFilter] = useState<"all" | "sent" | "overdue" | "unsent">("all");
    const [invoiceCount, setInvoiceCount] = useState<string>("");
    const [invoiceMode, setInvoiceMode] = useState<"exact" | "min" | "max" | "all">("all");

    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; index: number | null }>({
        isOpen: false,
        index: null
    });

    const fetchCustomers = async (isInitial = false) => {
        if (isInitial) {
            const cached = localStorage.getItem("legal12_customers");
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    setRows(parsed);
                    setLoadingData(false);
                } catch (e) { }
            }
        }

        try {
            const data = await getCustomers() as CustomerRow[];
            const sorted = data.sort((a, b) =>
                new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );

            const mergedRows = sorted.map(row => ({
                ...row,
                customerCode: row.customerCode || row.details?.fin || ""
            }));

            const finalRows = mergedRows.length > 0 ? mergedRows : [{ customerCode: "", fullName: "", debtAmount: "", createdAt: new Date().toISOString() }];

            setRows(finalRows);
            localStorage.setItem("legal12_customers", JSON.stringify(finalRows));
        } catch (err) {
            console.error("Failed to load customers:", err);
            toast.error("Məlumatları yükləmək mümkün olmadı");
        } finally {
            setLoadingData(false);
        }
    };

    useEffect(() => {
        fetchCustomers(true);
        if (user?.role === 'SUPERADMIN' || user?.role === 'MANAGER') {
            getAllUsers().then(users => {
                const admins = users.filter((u: any) => u.role === 'ADMIN');
                setAppUsers(admins);
            });
        }
        getStores().then(setStores);
    }, [user?.role]);

    const addRow = () => {
        const newRow: CustomerRow = {
            customerCode: "",
            fullName: "",
            debtAmount: "",
            createdAt: new Date().toISOString(),
            details: {
                fee: "23.6",
                penalty: "0"
            }
        };
        setRows([newRow, ...rows]);
        toast.info("Yeni müştəri kartı əlavə edildi");
    };

    // Memoize handleSave to ensure stable reference for CustomerCard
    const handleSave = useCallback(async (dataToSave: CustomerRow) => {
        try {
            // Apply status change for ADMIN
            if (user?.role === 'ADMIN') {
                dataToSave.process_status = 'FILLED_BY_ADMIN';
            }

            if (dataToSave.id) {
                const savedData = await updateCustomer(dataToSave.id, {
                    ...dataToSave,
                    fullData: !!(dataToSave.details?.fin && dataToSave.details?.totalUnpaid)
                }, user?.email);

                // Update local state immediately with returned data (includes hasFile flag)
                setRows(prev => prev.map(r => r.id === dataToSave.id ? { ...r, ...savedData } : r));
            } else {
                await bulkAddCustomers([dataToSave], user?.email);
                fetchCustomers();
            }
        } catch (error) {
            console.error("Save error:", error);
            throw error;
        }
    }, [user?.email, rows, fetchCustomers]);

    const onDelete = useCallback((index: number) => {
        setDeleteModal({ isOpen: true, index });
    }, []);

    const confirmDelete = async () => {
        if (deleteModal.index !== null) {
            const index = deleteModal.index;
            const rowToDelete = rows[index];

            try {
                if (rowToDelete.id) {
                    await deleteCustomer(rowToDelete.id, user?.email);
                }

                if (rows.length > 1) {
                    setRows(rows.filter((_, i) => i !== index));
                    toast.error("Məlumat silindi");
                } else {
                    setRows([{ customerCode: "", fullName: "", debtAmount: "", createdAt: new Date().toISOString() }]);
                }
            } catch (e) {
                toast.error("Silmək mümkün olmadı");
            }
        }
        setDeleteModal({ isOpen: false, index: null });
    };

    const filteredRows = useMemo(() => {
        const lowSearch = searchTerm.toLowerCase();
        const isManager = user?.role === 'SUPERADMIN' || user?.role === 'MANAGER';

        return rows.filter(c => {
            // Archive filter
            if (c.isArchived) return false;

            // First level: Role based access
            if (!isManager && c.assignedTo !== user?.email) {
                // Exceptional case: If it's a new unsaved row being created right now
                if (!c.id) return true;
                return false;
            }

            const matchesSearch = !searchTerm ||
                c.fullName.toLowerCase().includes(lowSearch) ||
                (c.customerCode || "").toLowerCase().includes(lowSearch) ||
                (c.details?.fin || "").toLowerCase().includes(lowSearch);

            const isSent = !!c.details?.isWarningSent;
            const overdue = isOverdue(c.details?.warningDate);

            let matchesWarning = true;
            if (warningFilter === "sent") matchesWarning = isSent;
            else if (warningFilter === "overdue") matchesWarning = isSent && overdue;
            else if (warningFilter === "unsent") matchesWarning = !isSent;

            let matchesInvoiceCount = true;
            if (invoiceMode !== "all" && invoiceCount !== "") {
                const count = c.details?.invoices?.length || 0;
                const target = parseInt(invoiceCount);
                if (!isNaN(target)) {
                    if (invoiceMode === "exact") matchesInvoiceCount = count === target;
                    else if (invoiceMode === "min") matchesInvoiceCount = count >= target;
                    else if (invoiceMode === "max") matchesInvoiceCount = count <= target;
                }
            }

            return matchesSearch && matchesWarning && matchesInvoiceCount;
        });
    }, [rows, searchTerm, warningFilter, invoiceCount, invoiceMode, user?.email, user?.role]);

    const userWorkload = useMemo(() => {
        const map: Record<string, number> = {};
        rows.forEach(r => {
            if (r.assignedTo && !['ARCHIVE_UPLOADED', 'COMPLETED'].includes(r.process_status || '')) {
                map[r.assignedTo] = (map[r.assignedTo] || 0) + 1;
            }
        });
        return map;
    }, [rows]);

    if (loadingData && rows.length === 0) {
        return (
            <div className="flex h-[70vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-primary" size={48} />
                    <p className="text-sm font-black text-text-soft uppercase tracking-widest animate-pulse">Sistem yüklənir...</p>
                </div>
            </div>
        );
    }

    return (
        <AuthGuard>
            <div className="max-w-[1500px] mx-auto pb-16 relative px-4">

                {/* 1. STICKY FILTER BAR */}
                <div className="sticky top-0 z-50 bg-slate-50/80 backdrop-blur-xl -mx-4 px-4 pt-4 pb-4 border-b border-slate-200">


                    <div className="flex items-center justify-between gap-6 max-w-[1400px] mx-auto">
                        <div className="flex items-center gap-4 flex-1">
                            <div className="relative flex-1 group max-w-2xl">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-slate-800 transition-colors" size={18} />
                                <input
                                    type="text"
                                    placeholder="Müştəri axtar (Ad, Soyad, FİN)..."
                                    className="w-full pl-14 pr-12 py-2.5 bg-white rounded-xl border border-slate-200 focus:border-slate-400 focus:ring-4 focus:ring-slate-400/5 outline-none text-sm font-semibold transition-all shadow-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <button onClick={() => setSearchTerm("")} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800">
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                            <div className="relative group/sel">
                                <AlertTriangle size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within/sel:text-primary transition-colors pointer-events-none" />
                                <select
                                    value={warningFilter}
                                    onChange={(e) => setWarningFilter(e.target.value as any)}
                                    className="pl-11 pr-10 py-2.5 bg-white rounded-xl border border-slate-200 hover:border-slate-300 focus:border-primary outline-none text-sm font-semibold transition-all shadow-sm appearance-none min-w-[200px]"
                                >
                                    <option value="all">Bütün Xəbərdarlıqlar</option>
                                    <option value="sent">Göndərilənlər</option>
                                    <option value="overdue">Vaxtı Keçmişlər</option>
                                    <option value="unsent">Göndərilməyənlər</option>
                                </select>
                                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                            </div>

                            <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-4 py-2 transition-all focus-within:border-slate-400 shadow-sm group">
                                <Tag size={14} className="text-slate-600 group-focus-within:text-slate-900 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Faktura"
                                    className="w-16 outline-none text-sm font-bold bg-transparent placeholder:text-slate-300 placeholder:font-normal"
                                    value={invoiceCount}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === "" || /^\d+$/.test(val)) setInvoiceCount(val);
                                        if (invoiceMode === "all") setInvoiceMode("exact");
                                    }}
                                />
                                <div className="h-4 w-[1px] bg-slate-200 mx-1" />
                                <select
                                    value={invoiceMode}
                                    onChange={(e) => setInvoiceMode(e.target.value as any)}
                                    className="bg-transparent outline-none text-[10px] font-black uppercase tracking-widest cursor-pointer text-slate-500 hover:text-slate-900 transition-colors"
                                >
                                    <option value="all">HAMISI</option>
                                    <option value="exact">=</option>
                                    <option value="min">+</option>
                                    <option value="max">-</option>
                                </select>
                                {invoiceCount && (
                                    <button
                                        onClick={() => { setInvoiceCount(""); setInvoiceMode("all"); }}
                                        className="ml-2 text-slate-300 hover:text-red-500 transition-colors"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. CARD LIST */}
                <div className="grid grid-cols-1 gap-6 mt-6 pb-20">
                    {filteredRows.map((row, idx) => (
                        <CustomerCard
                            // Important: use a unique key if possible, but fallback to idx for stability if id is missing on new rows
                            key={row.id || idx}
                            row={row}
                            index={idx}
                            totalRows={rows.length}
                            canUpdate={can("page_customers")}
                            canDelete={user?.role === 'SUPERADMIN' || user?.role === 'MANAGER'}
                            appUsers={appUsers}
                            userWorkload={userWorkload}
                            stores={stores}
                            onSave={handleSave}
                            onDelete={onDelete}
                            can={can}
                        />
                    ))}

                    {filteredRows.length === 0 && (
                        <div className="py-40 text-center flex flex-col items-center gap-6 opacity-20">
                            <div className="p-10 bg-gray-100 rounded-full">
                                <Search size={80} />
                            </div>
                            <p className="font-black text-3xl uppercase tracking-[0.2em] italic">Məlumat Tapılmadı</p>
                        </div>
                    )}
                </div>

                {/* DELETE MODAL */}
                {deleteModal.isOpen && (
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300 cursor-pointer"
                        onClick={() => setDeleteModal({ isOpen: false, index: null })}
                    >
                        <div
                            className="bg-white rounded-xl p-8 max-w-sm w-full shadow-2xl border border-slate-200 animate-in zoom-in duration-200 cursor-default"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex flex-col items-center text-center gap-6">
                                <div className="h-16 w-16 bg-red-50 text-red-600 rounded-xl flex items-center justify-center border border-red-100">
                                    <AlertTriangle size={32} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-800 uppercase">Məlumat Silinsin?</h3>
                                    <p className="text-sm text-slate-600 mt-2 font-medium">Bu müştəri kartını silmək istədiyinizə əminsiniz? Bu əməliyyat geri qaytarıla bilməz.</p>
                                </div>
                                <div className="flex flex-col w-full gap-3">
                                    <button
                                        onClick={confirmDelete}
                                        className="w-full bg-red-600 text-white py-4 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all active:scale-95"
                                    >
                                        Bəli, Silinsin
                                    </button>
                                    <button
                                        onClick={() => setDeleteModal({ isOpen: false, index: null })}
                                        className="w-full bg-slate-50 text-slate-600 py-4 rounded-lg font-black text-[10px] uppercase tracking-widest border border-slate-200 hover:bg-slate-100 transition-all"
                                    >
                                        Ləğv Et
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard >
    );
}
