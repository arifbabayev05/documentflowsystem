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
import { formatDateInput, toTitleCase } from "@/lib/format";
import AuthGuard from "@/components/auth/AuthGuard";



/** Internal helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

/** Expandable icon button — compact by default, expands with label on hover */
const ExpandableButton = ({
    icon,
    label,
    onClick,
    title,
    className,
    labelClassName,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: (e: React.MouseEvent) => void;
    title?: string;
    className?: string;
    labelClassName?: string;
}) => {
    const [expanded, setExpanded] = useState(false);
    const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleEnter = () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        openTimer.current = setTimeout(() => setExpanded(true), 300);
    };

    const handleLeave = () => {
        if (openTimer.current) clearTimeout(openTimer.current);
        closeTimer.current = setTimeout(() => setExpanded(false), 150);
    };

    return (
        <button
            onClick={onClick}
            title={title || label}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
            style={{
                minWidth: '38px',
                height: '38px',
                paddingLeft: expanded ? '12px' : '0',
                paddingRight: expanded ? '12px' : '0',
                gap: expanded ? '7px' : '0',
                maxWidth: expanded ? '220px' : '38px',
                transition: 'max-width 250ms cubic-bezier(0.4,0,0.2,1), padding 250ms ease, gap 250ms ease',
            }}
            className={cn(
                "flex items-center justify-center overflow-hidden shrink-0 rounded-xl font-bold text-[10px] uppercase tracking-wider border whitespace-nowrap",
                className
            )}
        >
            {/* Fixed-size icon wrapper so icon never shifts */}
            <span style={{ minWidth: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {icon}
            </span>
            <span
                style={{
                    maxWidth: expanded ? '180px' : '0px',
                    opacity: expanded ? 1 : 0,
                    overflow: 'hidden',
                    transition: 'max-width 350ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease',
                    whiteSpace: 'nowrap',
                    display: 'inline-block',
                    letterSpacing: '0.05em',
                }}
                className={labelClassName}
            >
                {label}
            </span>
        </button>
    );
};

export type ProcessStatus = 'INSPECTOR_ENTERED' | 'ASSIGNED_BY_MANAGER' | 'FILLED_BY_ADMIN' | 'WAITING_FOR_ARCHIVE' | 'ARCHIVE_UPLOADED' | 'COMPLETED' | 'UNFINISHED_ARCHIVE';

export const STATUS_ORDER: ProcessStatus[] = [
    'INSPECTOR_ENTERED',
    'ASSIGNED_BY_MANAGER',
    'FILLED_BY_ADMIN',
    'WAITING_FOR_ARCHIVE',
    'ARCHIVE_UPLOADED',
    'COMPLETED',
    'UNFINISHED_ARCHIVE'
];

export const STATUS_LABELS: Record<ProcessStatus, { label: string, color: string, bg: string }> = {
    INSPECTOR_ENTERED: { label: 'Yeni daxil edildi', color: 'text-blue-600', bg: 'bg-blue-50' },
    ASSIGNED_BY_MANAGER: { label: 'İcraata götürüldü', color: 'text-amber-600', bg: 'bg-amber-50' },
    FILLED_BY_ADMIN: { label: 'Məlumatlar doldurulub', color: 'text-purple-600', bg: 'bg-purple-50' },
    WAITING_FOR_ARCHIVE: { label: 'Arxivdən sənəd istənilib', color: 'text-orange-600', bg: 'bg-orange-50' },
    ARCHIVE_UPLOADED: { label: 'Arxiv faylı əlavə olundu', color: 'text-slate-600', bg: 'bg-slate-100' },
    COMPLETED: { label: 'Sənədlər tamamlandı', color: 'text-green-600', bg: 'bg-green-50' },
    UNFINISHED_ARCHIVE: { label: 'Tamamlanmayan Sənəd', color: 'text-orange-600', bg: 'bg-orange-50' }
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

/**
 * Common keyboard navigation for inputs: Enter, ArrowRight, ArrowLeft
 */
const keyboardNavigation = (e: React.KeyboardEvent<any>, isEditing: boolean) => {
    if (!isEditing) return;

    if (e.key === 'Enter') {
        const inputs = Array.from(document.querySelectorAll('input:not([readonly]), select:not([disabled])')) as HTMLElement[];
        const index = inputs.indexOf(e.currentTarget);
        if (index > -1 && index < inputs.length - 1) {
            inputs[index + 1].focus();
            e.preventDefault();
        }
    } else if (e.key === 'ArrowRight') {
        const input = e.currentTarget as HTMLInputElement;
        // Move to next if not an input or cursor is at the end
        if (input.tagName !== 'INPUT' || input.selectionStart === input.value.length) {
            const inputs = Array.from(document.querySelectorAll('input:not([readonly]), select:not([disabled])')) as HTMLElement[];
            const index = inputs.indexOf(e.currentTarget);
            if (index > -1 && index < inputs.length - 1) {
                inputs[index + 1].focus();
                e.preventDefault();
            }
        }
    } else if (e.key === 'ArrowLeft') {
        const input = e.currentTarget as HTMLInputElement;
        // Move to previous if not an input or cursor is at the beginning
        if (input.tagName !== 'INPUT' || input.selectionStart === 0) {
            const inputs = Array.from(document.querySelectorAll('input:not([readonly]), select:not([disabled])')) as HTMLElement[];
            const index = inputs.indexOf(e.currentTarget);
            if (index > 0) {
                inputs[index - 1].focus();
                e.preventDefault();
            }
        }
    }
};

const getImeisFromDescription = (description: string) => {
    const parts = description.split(/[,;\n]/);
    const results: { imei: string; name: string }[] = [];
    parts.forEach(part => {
        const imeiMatch = part.match(/\b\d{15}\b/);
        if (imeiMatch) {
            const imei = imeiMatch[0];
            let name = part.replace(imei, '')
                .replace(/imei\s*kod/gi, '')
                .replace(/imei/gi, '')
                .replace(/kod/gi, '')
                .replace(/[():]/g, '')
                .trim();
            // Clean up leading/trailing dashes or symbols
            name = name.replace(/^[-. ]+|[-. ]+$/g, '');
            results.push({ imei, name: name || "Telefon" });
        }
    });
    return results;
};

/**
 * Searchable User Select Component
 */
const UserSelect = ({ users, workload, value, onChange, onToggle }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedUser = users.find((u: any) => u.id === value);

    const handleToggle = (val: boolean) => {
        setIsOpen(val);
        if (onToggle) onToggle(val);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                handleToggle(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const filteredUsers = users.filter((u: any) =>
        (u.displayName || u.email || "").toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="relative w-full" ref={dropdownRef}>
            <button
                onClick={() => handleToggle(!isOpen)}
                className={cn(
                    "w-full flex items-center justify-between bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 transition-all text-left",
                    isOpen ? "ring-2 ring-primary/10 border-primary/40" : "hover:border-slate-300 shadow-sm"
                )}
            >
                <div className="flex flex-col min-w-0 pr-1">
                    <span className={cn(
                        "text-[10px] font-bold truncate leading-tight",
                        selectedUser ? "text-slate-900" : "text-slate-400"
                    )}>
                        {selectedUser ? selectedUser.displayName : "Seçilməyib"}
                    </span>
                    {selectedUser && (
                        <div className="flex items-center gap-1 mt-0.5">
                            <div className={cn(
                                "h-1 w-1 rounded-full",
                                (workload[selectedUser.id] || 0) === 0 ? "bg-emerald-500" : (workload[selectedUser.id] || 0) <= 3 ? "bg-amber-500" : "bg-red-500"
                            )} />
                            <span className="text-[8px] font-medium text-slate-500">{workload[selectedUser.id] || 0} iş</span>
                        </div>
                    )}
                </div>
                <ChevronDown size={12} className={cn("text-slate-400 transition-transform shrink-0", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute z-[100] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="p-1.5 border-b border-slate-50 bg-slate-50/50">
                        <div className="relative">
                            <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                autoFocus
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Axtar..."
                                className="w-full bg-white border border-slate-200 rounded-md pl-7 pr-2 py-1 text-[10px] outline-none focus:border-primary/30"
                            />
                        </div>
                    </div>
                    <div className="max-h-[180px] overflow-y-auto scrollbar-none">
                        <button
                            onClick={() => { onChange(""); handleToggle(false); setSearch(""); }}
                            className="w-full text-left px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-50 border-b border-slate-50"
                        >
                            Seçimi təmizlə
                        </button>
                        {filteredUsers.length === 0 ? (
                            <div className="p-3 text-center text-[9px] font-bold text-slate-400 uppercase">Yoxdur</div>
                        ) : (
                            filteredUsers.map((u: any) => {
                                const active = workload[u.id] ?? 0;
                                const isSelected = u.id === value;
                                return (
                                    <button
                                        key={u.id}
                                        onClick={() => { onChange(u.id); handleToggle(false); setSearch(""); }}
                                        className={cn(
                                            "w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-primary/5 transition-all",
                                            isSelected && "bg-primary/[0.03] border-l-2 border-primary"
                                        )}
                                    >
                                        <div className="flex flex-col min-w-0 pr-2">
                                            <span className={cn(
                                                "text-[10px] font-bold truncate",
                                                isSelected ? "text-primary" : "text-slate-700"
                                            )}>
                                                {u.displayName}
                                            </span>
                                        </div>
                                        <div className={cn(
                                            "px-1.5 py-0.5 rounded text-[8px] font-bold",
                                            active === 0 ? "bg-emerald-50 text-emerald-600" : active <= 3 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                                        )}>
                                            {active}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
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
    createdBy?: string; // Track who added the customer
    courtName?: string; // Store selected court
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
            store?: string;
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
                hasImieFee?: boolean;
                checkedImeis?: string[];
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
                        onKeyDown={(e) => keyboardNavigation(e, isEditing)}
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
    const [showMore, setShowMore] = useState(false);
    const [showActualAddress, setShowActualAddress] = useState(!!row.details?.actualAddress);
    const [localData, setLocalData] = useState<CustomerRow>(JSON.parse(JSON.stringify(row)));
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
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
                        initialPayment: prev.details?.initialPayment || "0.00",
                        paidAmount: prev.details?.paidAmount || "0.00",
                        totalPrice: prev.details?.totalPrice || "0.00",
                        hasImieFee: undefined
                    }],
                    store: prev.store || ""
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
                    let fee = 0;
                    if (details.invoices && details.invoices.length > 0) {
                        details.invoices.forEach(inv => {
                            inv.orders?.forEach(o => {
                                if (Array.isArray(o.checkedImeis) && o.checkedImeis.length > 0) {
                                    fee += 23.6 * o.checkedImeis.length;
                                } else if (o.hasImieFee === true) {
                                    fee += 23.6;
                                }
                            });
                        });
                    } else {
                        // If no invoices yet (materialization hasn't happened), use legacy logic or 0
                        fee = hasImei ? phoneCount * 23.6 : 0;
                    }
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
                } else if (detailField === 'warningDate') {
                    if (value && (!newData.process_status || newData.process_status === 'INSPECTOR_ENTERED')) {
                        newData.process_status = 'ASSIGNED_BY_MANAGER';
                    }
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
            if (idx === 0) {
                if (field === 'invoiceNumber' && newData.details) {
                    newData.details.contractNumber = value;
                }
                if (field === 'store') {
                    newData.store = value;
                }
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
                let aggregatedFee = 0;
                newData.details.invoices?.forEach(inv => {
                    inv.orders?.forEach(o => {
                        if (Array.isArray(o.checkedImeis) && o.checkedImeis.length > 0) {
                            aggregatedFee += 23.6 * o.checkedImeis.length;
                        } else if (o.hasImieFee === true) {
                            aggregatedFee += 23.6;
                        }
                    });
                });
                const fee = aggregatedFee;
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
                        initialPayment: prev.details?.initialPayment || "0.00",
                        paidAmount: prev.details?.paidAmount || "0.00",
                        totalPrice: prev.details?.totalPrice || "0.00",
                        hasImieFee: undefined
                    }],
                    store: prev.store || ""
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
                    initialPayment: "0.00",
                    paidAmount: "0.00",
                    totalPrice: "0.00",
                    hasImieFee: undefined
                }],
                store: ""
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
                initialPayment: "0.00",
                paidAmount: "0.00",
                totalPrice: "0.00",
                hasImieFee: undefined
            };

            invoices[idx] = { ...invoices[idx], orders: [newOrder, ...(invoices[idx].orders || [])] };
            toast.success("Yeni məhsul üçün hissə yaradıldı");
            return { ...prev, details: { ...prev.details, invoices } };
        });
    };

    const removeInvoice = (id: string) => {
        setLocalData(prev => {
            const invoices = (prev.details?.invoices || []).filter(i => i.id !== id);
            const newData = { ...prev, details: { ...prev.details, invoices } };

            // Recalculate debt totals
            let totalPrice = 0, totalPaid = 0, fee = 0;
            invoices.forEach((inv: any) => {
                (inv.orders || []).forEach((o: any) => {
                    const p = parseFloat((o.paymentPeriod || "0").toString().replace(',', '.')) || 0;
                    const m = parseFloat((o.monthlyPayment || "0").toString().replace(',', '.')) || 0;
                    const i = parseFloat((o.initialPayment || "0").toString().replace(',', '.')) || 0;
                    totalPrice += (p * m) + i;
                    totalPaid += parseFloat((o.paidAmount || "0").toString().replace(',', '.')) || 0;
                    if (Array.isArray(o.checkedImeis) && o.checkedImeis.length > 0) {
                        fee += 23.6 * o.checkedImeis.length;
                    } else if (o.hasImieFee === true || o.hasImieFee === 'true') {
                        fee += 23.6;
                    }
                });
            });
            const unpaid = Math.max(0, totalPrice - totalPaid);
            const penalty = unpaid * 0.10;
            const totalDebt = unpaid + fee + penalty;
            const discount = unpaid + penalty;
            if (newData.details) {
                newData.details.totalPrice = totalPrice.toFixed(2);
                newData.details.paidAmount = totalPaid.toFixed(2);
                newData.details.unpaidAmount = unpaid.toFixed(2);
                newData.details.fee = fee.toFixed(2);
                newData.details.penalty = penalty.toFixed(2);
                newData.details.totalUnpaid = totalDebt.toFixed(2);
                newData.details.discountAmount = discount.toFixed(2);
            }
            newData.debtAmount = totalDebt.toFixed(2);
            return newData;
        });
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
            const newData = { ...prev, details: { ...prev.details, invoices } };

            // Recalculate debt totals
            let totalPrice = 0, totalPaid = 0, fee = 0;
            invoices.forEach((inv: any) => {
                (inv.orders || []).forEach((o: any) => {
                    const p = parseFloat((o.paymentPeriod || "0").toString().replace(',', '.')) || 0;
                    const m = parseFloat((o.monthlyPayment || "0").toString().replace(',', '.')) || 0;
                    const i = parseFloat((o.initialPayment || "0").toString().replace(',', '.')) || 0;
                    totalPrice += (p * m) + i;
                    totalPaid += parseFloat((o.paidAmount || "0").toString().replace(',', '.')) || 0;
                    if (Array.isArray(o.checkedImeis) && o.checkedImeis.length > 0) {
                        fee += 23.6 * o.checkedImeis.length;
                    } else if (o.hasImieFee === true || o.hasImieFee === 'true') {
                        fee += 23.6;
                    }
                });
            });
            const unpaid = Math.max(0, totalPrice - totalPaid);
            const penalty = unpaid * 0.10;
            const totalDebt = unpaid + fee + penalty;
            const discount = unpaid + penalty;
            if (newData.details) {
                newData.details.totalPrice = totalPrice.toFixed(2);
                newData.details.paidAmount = totalPaid.toFixed(2);
                newData.details.unpaidAmount = unpaid.toFixed(2);
                newData.details.fee = fee.toFixed(2);
                newData.details.penalty = penalty.toFixed(2);
                newData.details.totalUnpaid = totalDebt.toFixed(2);
                newData.details.discountAmount = discount.toFixed(2);
            }
            newData.debtAmount = totalDebt.toFixed(2);
            return newData;
        });
    };

    const handleSave = async (e: React.MouseEvent) => {
        e.stopPropagation();

        const dataToSave = { ...localData };
        if (dataToSave.fullName) {
            dataToSave.fullName = toTitleCase(dataToSave.fullName);
        }
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

            // Auto-update status to "Warning Sent" if it's in the initial state
            if (!updatedData.process_status || updatedData.process_status === 'INSPECTOR_ENTERED') {
                updatedData.process_status = 'ASSIGNED_BY_MANAGER';
            }

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
            // Step-by-step feedback for the user who can't see the console
            toast.info(`Bot-a sorğu göndərildi: FİN: ${fin}`, { duration: 2000 });

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

            if (result.data) {
                toast.success(`Məlumat alındı: ${result.data.fullName}`, { duration: 4000 });
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

            return `Uğurlu: ${result.data.fullName} bazaya yazıldı.`;
        };

        toast.promise(fetchPromise(), {
            loading: 'ƏMAS-a bağlanılır...',
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
                    "relative bg-white rounded-xl border transition-all duration-300 flex-1",
                    (isExpanded || isDropdownOpen)
                        ? "border-slate-300 shadow-lg ring-1 ring-slate-200 z-[30]"
                        : "border-slate-200 hover:border-slate-400 hover:shadow-md cursor-pointer group z-0 hover:z-[10]"
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
                                {index + 1}
                            </div>

                            <div className="flex-1 min-w-0">
                                {isEditing ? (
                                    <input
                                        autoFocus
                                        value={localData.fullName || ""}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => handleFieldChange("fullName", e.target.value)}
                                        onKeyDown={(e) => keyboardNavigation(e, isEditing)}
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

                                                // Archive counts: requested vs uploaded
                                                const requestedInvs = invoices.filter((inv: any) => inv.archiveRequested);
                                                const uploadedInvs = requestedInvs.filter((inv: any) => inv.archiveUrl || inv.archiveBase64);
                                                const archTotal = requestedInvs.length;
                                                const archUploaded = uploadedInvs.length;
                                                const archiveComplete = archTotal > 0 && archUploaded === archTotal;
                                                const archivePartial = archTotal > 0 && archUploaded < archTotal;

                                                if (invCount === 0) return null;

                                                return (
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {/* Invoice / Product count */}
                                                        <div className="flex items-center gap-2 bg-slate-900/[0.03] text-slate-600 border border-slate-200/60 px-2.5 py-1 rounded-lg shrink-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[10px] font-black uppercase tracking-wider">{invCount} Faktura</span>
                                                                <div className="w-1 h-1 rounded-full bg-slate-300" />
                                                                <span className="text-[10px] font-black uppercase tracking-wider">{prodCount} Məhsul</span>
                                                            </div>
                                                        </div>

                                                        {/* Archive badge - partial */}
                                                        {archivePartial && (
                                                            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-lg shrink-0">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>
                                                                <span className="text-[10px] font-black uppercase tracking-wider">{archUploaded}/{archTotal} Arxiv Sənədi</span>
                                                            </div>
                                                        )}

                                                        {/* Archive badge - complete */}
                                                        {archiveComplete && (
                                                            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg shrink-0">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                                                                <span className="text-[10px] font-black uppercase tracking-wider">Arxiv Sənədləri tam hazırdır</span>
                                                            </div>
                                                        )}
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
                        {['SUPERADMIN', 'ADMIN', 'MANAGER'].includes(user?.role || '') && !row.isArchived && (
                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    const updated = { ...localData, isArchived: true, process_status: 'UNFINISHED_ARCHIVE' as ProcessStatus };
                                    setLocalData(updated);
                                    toast.promise(onSave(updated), {
                                        loading: 'Arxivlənir...',
                                        success: 'Sənəd arxivə göndərildi',
                                        error: 'Xəta baş verdi'
                                    });
                                }}
                                className="h-10 px-4 bg-white text-slate-600 border border-slate-200 rounded-xl font-black text-[11px] uppercase tracking-wider hover:bg-slate-50 hover:text-slate-900 transition-all flex items-center gap-2 active:scale-95 shrink-0"
                            >
                                <FolderArchive size={16} className="text-slate-400" /> Tamamlanmayan Sənəd
                            </button>
                        )}
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
                                            onKeyDown={(e) => keyboardNavigation(e, isEditing)}
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
                                            {/* FETCH DATA BUTTON */}
                                            {user?.role === 'SUPERADMIN' && (
                                                <ExpandableButton
                                                    onClick={fetchDataFromPortal}
                                                    icon={<ArrowDownToLine size={14} />}
                                                    label="Məlumatları Gətir"
                                                    className="bg-primary/10 text-primary border-primary/20 hover:bg-primary hover:text-white"
                                                />
                                            )}

                                            {/* WARNING BUTTON */}
                                            {(user?.role === 'SUPERADMIN' || user?.role === 'ADMIN') && (() => {
                                                const overdue = isOverdue(getValue("details.warningDate"));
                                                const hasDate = !!getValue("details.warningDate");
                                                const warningLabel = hasDate
                                                    ? `Göndərilib: ${getValue("details.warningDate")}${overdue ? " (+5)" : ""}`
                                                    : "Xəbərdarlıq Göndər";
                                                return (
                                                    <ExpandableButton
                                                        onClick={handleWarningClick}
                                                        icon={<AlertTriangle size={14} strokeWidth={2.5} />}
                                                        label={warningLabel}
                                                        className={
                                                            !hasDate
                                                                ? "bg-blue-50 text-blue-600 border-blue-200/50 hover:bg-blue-100"
                                                                : overdue
                                                                    ? "bg-red-50 text-red-600 border-red-200/50 hover:bg-red-100"
                                                                    : "bg-amber-50 text-amber-600 border-amber-200/50 hover:bg-amber-100"
                                                        }
                                                    />
                                                );
                                            })()}

                                            {/* EDIT BUTTON */}
                                            {canUpdate && (
                                                <ExpandableButton
                                                    onClick={() => { setIsEditing(true); setIsExpanded(true); }}
                                                    icon={<Edit2 size={13} />}
                                                    label="Məlumatlarda Düzəliş"
                                                    className="bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                                                />
                                            )}

                                            {/* PRINT BUTTON */}
                                            <ExpandableButton
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

                                                    // if (localData.details?.actualAddress) {
                                                    //     sections["Ünvan Məlumatları"]["Faktiki Yaşayış"] = localData.details.actualAddress;
                                                    // }

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
                                                icon={<FileText size={13} />}
                                                label="Sənəd Çapı"
                                                className="bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                                            />
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
                                        <CustomerField label="Cins" isSelect={true} path="details.gender" value={getValue("details.gender")} onChange={handleFieldChange} isEditing={isEditing} className="lg:col-span-12" />
                                    </div>

                                    {/* SECONDARY INFO - COLLAPSIBLE */}
                                    <div className="space-y-4 pt-2 border-t border-slate-100">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowMore(!showMore); }}
                                            className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-primary transition-all"
                                        >
                                            {showMore ? <Minus size={12} /> : <Plus size={12} />}
                                            {showMore ? "Əlavə məlumatları gizlə" : "Əlavə məlumatlar (FİN, Doğum Tarixi, Tel...)"}
                                        </button>

                                        {showMore && (
                                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                                <div className="grid grid-cols-2 lg:grid-cols-12 gap-4">
                                                    <CustomerField label="Doğum Tarixi" path="details.birthDate" value={getValue("details.birthDate")} onChange={handleFieldChange} isEditing={isEditing} className="lg:col-span-6" />
                                                    <CustomerField
                                                        label="FİN"
                                                        path="details.fin"
                                                        value={getValue("details.fin")}
                                                        onChange={handleFieldChange}
                                                        isEditing={isEditing}
                                                        isFin={true}
                                                        maxLength={7}
                                                        className="lg:col-span-6"
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 lg:grid-cols-12 gap-4">
                                                    <CustomerField label="Seriya Nömrəsi" path="details.passportSeries" value={getValue("details.passportSeries")} onChange={handleFieldChange} isEditing={isEditing} className="lg:col-span-5" />
                                                    <CustomerField label="Telefon Nömrəsi" path="details.phone" placeholder="0501234567" value={getValue("details.phone")} onChange={handleFieldChange} isEditing={isEditing} className="lg:col-span-7" />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Address info merged inside personal block as requested */}
                                    <div className="pt-2 grid grid-cols-1 gap-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ünvan Məlumatları</span>
                                            {isEditing && !showActualAddress && !isKarabakhAddress(getValue("details.address")) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setShowActualAddress(true); }}
                                                    className="flex items-center gap-1 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-orange-500 transition-all bg-orange-50 hover:bg-orange-100 border border-orange-200/50 px-2 py-1 rounded-lg"
                                                >
                                                    <Plus size={10} strokeWidth={3} /> Faktiki Ünvan
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            <CustomerField
                                                label="Qeydiyyat Ünvanı"
                                                path="details.address"
                                                placeholder="Şəhər, Rayon..."
                                                value={getValue("details.address")}
                                                onChange={handleFieldChange}
                                                isEditing={isEditing}
                                                className={!isKarabakhAddress(getValue("details.address")) && !showActualAddress ? "lg:col-span-2" : ""}
                                            />
                                            {(isKarabakhAddress(getValue("details.address")) || showActualAddress) && (
                                                <div className="flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                                    <div className="flex-1">
                                                        <CustomerField label="Faktiki Yaşayış" path="details.actualAddress" placeholder="Şəhər, Rayon..." value={getValue("details.actualAddress")} onChange={handleFieldChange} isEditing={isEditing} />
                                                    </div>
                                                    {isEditing && !isKarabakhAddress(getValue("details.address")) && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setShowActualAddress(false); handleFieldChange("details.actualAddress", ""); }}
                                                            className="mt-6 h-8 w-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-500 text-slate-400 transition-all shrink-0"
                                                            title="Faktiki ünvanı sil"
                                                        >
                                                            <X size={13} strokeWidth={2.5} />
                                                        </button>
                                                    )}
                                                </div>
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
                                        initialPayment: getValue("details.initialPayment") || "0.00",
                                        paidAmount: getValue("details.paidAmount") || "0.00",
                                        totalPrice: getValue("details.totalPrice"),
                                        hasImieFee: undefined,
                                        checkedImeis: []
                                    }],
                                    store: localData.store || ""
                                }]).map((inv, idx, allInvs) => (
                                    <div key={inv.id} className="relative group p-6 rounded-[2rem] border-2 border-red-100 hover:border-red-200 transition-all bg-white shadow-sm">

                                        {/* HEADER SECTION */}
                                        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 mb-6">
                                            {/* Left: Invoice Number */}
                                            <div className="flex items-end gap-4 w-full xl:w-auto">
                                                <div className="shrink-0 h-11 w-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-sm font-black text-slate-500 shadow-sm mb-0.5">
                                                    {allInvs.length - idx}
                                                </div>
                                                <div className="space-y-1.5 flex-1 xl:flex-none">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            readOnly={!isEditing}
                                                            value={inv.invoiceNumber || ""}
                                                            onChange={(e) => updateInvoice(inv.id, 'invoiceNumber', e.target.value)}
                                                            onKeyDown={(e) => keyboardNavigation(e, isEditing)}
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
                                                                <span className="truncate flex-1 text-left">{inv.store || "Mağaza Seç"}</span>
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
                                                                                                updateInvoice(inv.id, 'store', filtered[dropdownSelectedIndex].name);
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
                                                                                    updateInvoice(inv.id, 'store', "");
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
                                                                                            updateInvoice(inv.id, 'store', s.name);
                                                                                            setOpenStoreDropdownId(null);
                                                                                            setStoreSearch("");
                                                                                        }}
                                                                                        className={cn(
                                                                                            "w-full text-left px-3 py-2 rounded-lg transition-all text-[11px] font-bold mb-0.5",
                                                                                            inv.store === s.name || dropdownSelectedIndex === sIdx ? "bg-slate-900 text-white" : "hover:bg-slate-100 text-slate-800"
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
                                                            inv.store ? "bg-white text-slate-700 border-slate-200" : "bg-slate-50 text-slate-400 border-slate-500"
                                                        )}>
                                                            <Store size={14} className={inv.store ? "text-primary" : "text-slate-400"} />
                                                            <span className="truncate max-w-[120px]">{inv.store || "Mağaza Seçilməyib"}</span>
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
                                                        <div className="lg:col-span-5 space-y-2.5">
                                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 h-[20px] flex items-center">MƏHSUL ADI</label>
                                                            <textarea
                                                                readOnly={!isEditing}
                                                                value={ord.productDescription || ""}
                                                                onChange={(e) => updateOrder(inv.id, ord.id, 'productDescription', e.target.value)}
                                                                onInput={(e) => {
                                                                    const target = e.currentTarget;
                                                                    target.style.height = 'auto';
                                                                    target.style.height = target.scrollHeight + 'px';
                                                                }}
                                                                onKeyDown={(e) => keyboardNavigation(e, isEditing)}
                                                                className={cn(
                                                                    "w-full min-h-[44px] px-4 py-2.5 rounded-xl text-[13px] font-bold text-slate-800 outline-none transition-all shadow-sm resize-none overflow-hidden",
                                                                    isEditing
                                                                        ? "bg-white border-2 border-slate-900 focus:border-black focus:ring-4 focus:ring-slate-100"
                                                                        : "bg-slate-50 border border-slate-500"
                                                                )}
                                                                placeholder="Məhsul adı..."
                                                                rows={1}
                                                            />
                                                            <div className="mt-1.5 flex flex-wrap gap-2">
                                                                {(() => {
                                                                    const detected = getImeisFromDescription(ord.productDescription || "");
                                                                    if (detected.length === 0) {
                                                                        return (
                                                                            <button
                                                                                onClick={() => {
                                                                                    if (!isEditing) setIsEditing(true);
                                                                                    const newValue = ord.hasImieFee === true ? false : true;
                                                                                    updateOrder(inv.id, ord.id, 'hasImieFee', newValue);
                                                                                }}
                                                                                className={cn(
                                                                                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border",
                                                                                    ord.hasImieFee === true
                                                                                        ? "bg-indigo-600 text-white border-indigo-700 shadow-md shadow-indigo-200"
                                                                                        : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                                                                                )}
                                                                            >
                                                                                <Smartphone size={14} />
                                                                                {ord.hasImieFee === true
                                                                                    ? "İMEİ deaktiv"
                                                                                    : ord.hasImieFee === false
                                                                                        ? "İMEİ aktiv"
                                                                                        : "İMEİ yoxla"}
                                                                            </button>
                                                                        );
                                                                    }

                                                                    return detected.map((item) => {
                                                                        const isActive = (ord.checkedImeis || []).includes(item.imei);
                                                                        return (
                                                                            <button
                                                                                key={item.imei}
                                                                                onClick={() => {
                                                                                    if (!isEditing) setIsEditing(true);
                                                                                    const currentChecked = ord.checkedImeis || [];
                                                                                    const nextChecked = isActive
                                                                                        ? currentChecked.filter(id => id !== item.imei)
                                                                                        : [...currentChecked, item.imei];
                                                                                    updateOrder(inv.id, ord.id, 'checkedImeis', nextChecked);
                                                                                }}
                                                                                className={cn(
                                                                                    "flex items-center gap-2 px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border shrink-0",
                                                                                    isActive
                                                                                        ? "bg-indigo-600 text-white border-indigo-700 shadow-md shadow-indigo-200"
                                                                                        : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                                                                                )}
                                                                            >
                                                                                <Smartphone size={14} />
                                                                                <span className="whitespace-nowrap">İMEİ {item.name}: {isActive ? "DEAKTİV" : "AKTİV"}</span>
                                                                            </button>
                                                                        );
                                                                    });
                                                                })()}
                                                            </div>
                                                        </div>

                                                        {/* Müqavilə Tarixi */}
                                                        <div className="lg:col-span-2 space-y-2.5">
                                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 h-[20px] flex items-center">MÜQAVİLƏ TARİXİ</label>
                                                            <input
                                                                readOnly={!isEditing}
                                                                value={ord.contractDate || ""}
                                                                onChange={(e) => updateOrder(inv.id, ord.id, 'contractDate', formatDateInput(e.target.value))}
                                                                onKeyDown={(e) => keyboardNavigation(e, isEditing)}
                                                                className={cn("w-full h-11 px-4 rounded-xl text-[13px] font-bold text-slate-800 outline-none transition-all text-center shadow-sm", isEditing ? "bg-white border-2 border-slate-900 focus:border-black focus:ring-4 focus:ring-slate-100" : "bg-slate-50 border border-slate-500")}
                                                                placeholder="GG.AA.İİİİ"
                                                            />
                                                        </div>

                                                        {/* Ödəmə Parametrləri */}
                                                        <div className="lg:col-span-4 grid grid-cols-4 gap-3">
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
                                                                    onKeyDown={(e) => keyboardNavigation(e, isEditing)}
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
                                                                    onKeyDown={(e) => keyboardNavigation(e, isEditing)}
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
                                                                    onKeyDown={(e) => keyboardNavigation(e, isEditing)}
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
                                                                    onKeyDown={(e) => keyboardNavigation(e, isEditing)}
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
                                                            <span className="text-[11px] font-black text-slate-600 uppercase tracking-[0.2em]">ALQI SATQI QİYMƏTİ</span>
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
                        <UserSelect
                            users={appUsers}
                            workload={userWorkload}
                            value={localData.assignedTo || ""}
                            onToggle={setIsDropdownOpen}
                            onChange={async (selectedId: string) => {
                                const now = new Date().toISOString();
                                const updated = {
                                    ...localData,
                                    assignedTo: selectedId,
                                    assignedAt: selectedId ? now : localData.assignedAt,
                                    process_status: (selectedId ? 'ASSIGNED_BY_MANAGER' : localData.process_status) as ProcessStatus
                                };
                                setLocalData(updated);

                                toast.promise(onSave(updated), {
                                    loading: 'Təyinat qeyd edilir...',
                                    success: 'Müfəttiş təyin edildi',
                                    error: 'Xəta baş verdi'
                                });
                            }}
                        />
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
                            {(() => {
                                if (row.process_status === 'ASSIGNED_BY_MANAGER' && row.details?.warningDate) {
                                    return 'Xəbərdarlıq göndərildi';
                                }
                                return row.process_status ? STATUS_LABELS[row.process_status].label : "Daxil Edilib";
                            })()}
                        </div>
                    )}
                </div>

                {/* ARCHIVE BUTTON - Only if COMPLETED and can archive */}
                {row.process_status === 'COMPLETED' && (
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
                        className="mt-2 w-full h-11 flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 hover:scale-[1.02] active:scale-95 transition-all font-black text-[11px] uppercase tracking-wider shadow-lg shadow-emerald-600/20 border-none animate-glow-emerald"
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
    const [statusFilter, setStatusFilter] = useState<ProcessStatus | "all">("all");
    const [page, setPage] = useState(1);
    const itemsPerPage = 50;
    const [onlyMyEntries, setOnlyMyEntries] = useState(false);
    const [warningFilter, setWarningFilter] = useState<"all" | "sent" | "overdue" | "unsent">("all");
    const [invoiceCount, setInvoiceCount] = useState<string>("");
    const [invoiceMode, setInvoiceMode] = useState<"exact" | "min" | "max" | "all">("all");
    const [executorFilter, setExecutorFilter] = useState<string>("all");

    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; index: number | null }>({
        isOpen: false,
        index: null
    });

    const fetchCustomers = async (isInitial = false) => {
        if (isInitial) {
            try {
                const cached = localStorage.getItem("legal12_customers");
                if (cached) {
                    const parsed = JSON.parse(cached);
                    setRows(parsed);
                    setLoadingData(false);
                }
            } catch (e) {
                // Silent catch for initial load
                localStorage.removeItem("legal12_customers");
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

            // ULTRA-OPTIMIZATION: Remove EVERYTHING not absolutely needed for the list view
            // to stay under 5MB localStorage quota.
            const optimizedForCache = finalRows
                .slice(0, 1000) // Only cache last 1000 to be safe
                .map(row => ({
                    id: row.id,
                    customerCode: row.customerCode,
                    fullName: row.fullName,
                    debtAmount: row.debtAmount,
                    process_status: row.process_status,
                    assignedTo: row.assignedTo,
                    createdAt: row.createdAt,
                    isArchived: row.isArchived,
                    details: {
                        fin: row.details?.fin,
                        phone: row.details?.phone,
                        isWarningSent: row.details?.isWarningSent
                    }
                }));

            try {
                // Use a non-blocking timeout to ensure it doesn't slow down the UI
                setTimeout(() => {
                    try {
                        localStorage.setItem("legal12_customers", JSON.stringify(optimizedForCache));
                    } catch (quotaError) {
                        // If 1000 is still too large, try even smaller
                        try {
                            localStorage.setItem("legal12_customers", JSON.stringify(optimizedForCache.slice(0, 200)));
                        } catch (e) {
                            localStorage.removeItem("legal12_customers");
                        }
                    }
                }, 100);
            } catch (e) { }

        } catch (err) {
            console.error("Failed to load customers:", err);
            toast.error("Məlumatları yükləmək mümkün olmadı");
        } finally {
            setLoadingData(false);
        }
    };

    useEffect(() => {
        fetchCustomers(true);
        if (user?.role === 'SUPERADMIN' || user?.role === 'MANAGER' || user?.role === 'INSPECTOR_LEAD') {
            getAllUsers().then(users => {
                const assignable = users.filter((u: any) => u.role === 'ADMIN');
                setAppUsers(assignable);
            });
        }
        getStores().then(setStores);
    }, [user?.role]);

    useEffect(() => {
        setPage(1);
    }, [searchTerm, warningFilter, invoiceCount, invoiceMode, statusFilter, onlyMyEntries, executorFilter]);

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
            // Apply status change for ADMIN only if not archived
            if (user?.role === 'ADMIN' && !dataToSave.isArchived) {
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
        const isManager = user?.role === 'SUPERADMIN' || user?.role === 'MANAGER' || user?.role === 'INSPECTOR_LEAD' || user?.role === 'DEP_HEAD';

        return rows.filter(c => {
            // Archive filter: dashboard primarily shows active work.
            // Items in 'UNFINISHED_ARCHIVE' are technically archived but should be visible if that status is selected.
            if (c.isArchived) {
                if (statusFilter !== 'UNFINISHED_ARCHIVE') return false;
            }

            // My Entries filter (only for DEP_HEAD and SUPERADMIN)
            if (onlyMyEntries && (user?.role === 'DEP_HEAD' || user?.role === 'SUPERADMIN' || user?.role === 'MANAGER')) {
                if (c.createdBy !== user?.email) return false;
            }

            // First level: Role based access
            // Inspectors/Admins see only what's assigned to them
            // Admin sees only what's assigned to them, EXCEPT for UNFINISHED_ARCHIVE tasks that are unassigned
            const canSeeUnfinished = user?.role === 'ADMIN' && c.process_status === 'UNFINISHED_ARCHIVE' && !c.assignedTo;
            const isAssignedToMe = c.assignedTo === user?.email;

            if (!isManager && !isAssignedToMe && !canSeeUnfinished) {
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
                const invoices = c.details?.invoices || [];
                // Support legacy data structure (items with a contract number but no invoices array yet)
                const count = invoices.length > 0 ? invoices.length : (c.details?.contractNumber ? 1 : 0);
                const target = parseInt(invoiceCount);
                if (!isNaN(target)) {
                    if (invoiceMode === "exact") matchesInvoiceCount = count === target;
                    else if (invoiceMode === "min") matchesInvoiceCount = count >= target;
                    else if (invoiceMode === "max") matchesInvoiceCount = count <= target;
                }
            }

            let matchesStatus = true;
            if (statusFilter !== "all") {
                matchesStatus = c.process_status === statusFilter;
            }

            let matchesExecutor = true;
            if (executorFilter !== "all") {
                matchesExecutor = c.assignedTo === executorFilter;
            }

            return matchesSearch && matchesWarning && matchesInvoiceCount && matchesStatus && matchesExecutor;
        });
    }, [rows, searchTerm, warningFilter, invoiceCount, invoiceMode, statusFilter, onlyMyEntries, executorFilter, user?.email, user?.role]);

    const userWorkload = useMemo(() => {
        const map: Record<string, number> = {};
        rows.forEach(r => {
            if (r.assignedTo && !r.isArchived) {
                map[r.assignedTo] = (map[r.assignedTo] || 0) + 1;
            }
        });
        return map;
    }, [rows]);

    const myStats = useMemo(() => {
        if (!user?.email) return { active: 0, archived: 0, total: 0, unassigned: 0 };

        const isManager = user?.role === 'SUPERADMIN' || user?.role === 'MANAGER' || user?.role === 'DEP_HEAD';
        const targetEmail = (executorFilter !== 'all') ? executorFilter : (isManager ? null : user.email);

        // Banner 'Active' counts should only include ASSIGNED tasks for consistency with the Assignment dropdown.
        // Unassigned tasks are shown in a separate card for Managers.
        const active = rows.filter(r => (targetEmail ? r.assignedTo === targetEmail : !!r.assignedTo) && !r.isArchived).length;
        const archived = rows.filter(r => (targetEmail ? r.assignedTo === targetEmail : !!r.assignedTo) && r.isArchived).length;

        // Unassigned should only count those needing attention (not archived)
        const unassigned = rows.filter(r => !r.assignedTo && !r.isArchived).length;

        return {
            active,
            archived,
            total: active + archived,
            unassigned,
            isGlobal: !targetEmail
        };
    }, [rows, user?.email, user?.role, executorFilter]);

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

                {/* 0. USER STATS BANNER */}
                <div className={cn(
                    "grid grid-cols-1 gap-4 mb-6 mt-4",
                    (user?.role === 'SUPERADMIN' || user?.role === 'MANAGER') ? "md:grid-cols-4" : "md:grid-cols-3"
                )}>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 group hover:border-blue-400 transition-all">
                        <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 group-hover:scale-110 transition-transform">
                            <Zap size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {myStats.isGlobal || executorFilter !== 'all' ? "Aktiv İşlər" : "Aktiv İşlərim"}
                            </p>
                            <p className="text-2xl font-black text-slate-900">{myStats.active}</p>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 group hover:border-emerald-400 transition-all">
                        <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 group-hover:scale-110 transition-transform">
                            <FolderArchive size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Arxivə Göndərilən</p>
                            <p className="text-2xl font-black text-slate-900">{myStats.archived}</p>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 group hover:border-purple-400 transition-all">
                        <div className="h-12 w-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 group-hover:scale-110 transition-transform">
                            <RefreshCw size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ümumi İş Sayı</p>
                            <p className="text-2xl font-black text-slate-900">{myStats.total}</p>
                        </div>
                    </div>

                    {/* New: Unassigned status for Managers/Admins */}
                    {(user?.role === 'SUPERADMIN' || user?.role === 'MANAGER') && (
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 group hover:border-orange-400 transition-all animate-in fade-in slide-in-from-right-4 duration-500">
                            <div className="h-12 w-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100 group-hover:scale-110 transition-transform">
                                <Users size={24} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Təyinat edilməyən</p>
                                <p className="text-2xl font-black text-slate-900">{myStats.unassigned}</p>
                            </div>
                        </div>
                    )}
                </div>

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
                                <Zap size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within/sel:text-primary transition-colors pointer-events-none" />
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as any)}
                                    className="pl-11 pr-10 py-2.5 bg-white rounded-xl border border-slate-200 hover:border-slate-300 focus:border-primary outline-none text-[12px] font-bold transition-all shadow-sm appearance-none min-w-[200px] uppercase tracking-wider"
                                >
                                    <option value="all">Bütün Statuslar</option>
                                    {STATUS_ORDER.map(status => (
                                        <option key={status} value={status}>{STATUS_LABELS[status].label}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                            </div>

                            <div className="relative group/sel">
                                <AlertTriangle size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within/sel:text-primary transition-colors pointer-events-none" />
                                <select
                                    value={warningFilter}
                                    onChange={(e) => setWarningFilter(e.target.value as any)}
                                    className="pl-11 pr-10 py-2.5 bg-white rounded-xl border border-slate-200 hover:border-slate-300 focus:border-primary outline-none text-[12px] font-bold transition-all shadow-sm appearance-none min-w-[200px] uppercase tracking-wider"
                                >
                                    <option value="all">Bütün Xəbərdarlıqlar</option>
                                    <option value="sent">Göndərilənlər</option>
                                    <option value="overdue">Vaxtı Keçmişlər</option>
                                    <option value="unsent">Göndərilməyənlər</option>
                                </select>
                                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                            </div>

                            {/* <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-4 py-2 transition-all focus-within:border-slate-400 shadow-sm group">
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
                            </div> */}

                            {(user?.role === 'SUPERADMIN' || user?.role === 'MANAGER') && (
                                <div className="relative group/sel">
                                    <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within/sel:text-primary transition-colors pointer-events-none" />
                                    <select
                                        value={executorFilter}
                                        onChange={(e) => setExecutorFilter(e.target.value)}
                                        className="pl-11 pr-10 py-2.5 bg-white rounded-xl border border-slate-200 hover:border-slate-300 focus:border-primary outline-none text-[12px] font-bold transition-all shadow-sm appearance-none min-w-[200px] uppercase tracking-wider"
                                    >
                                        <option value="all">Bütün İnzibatçılar</option>
                                        {appUsers.map(u => (
                                            <option key={u.id} value={u.email}>{u.displayName || u.email}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                                </div>
                            )}

                            {(user?.role === 'SUPERADMIN' || user?.role === 'MANAGER') && (
                                <button
                                    onClick={() => setOnlyMyEntries(!onlyMyEntries)}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all text-[11px] font-black uppercase tracking-wider",
                                        onlyMyEntries
                                            ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200"
                                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                                    )}
                                >
                                    <UserCircle size={16} className={onlyMyEntries ? "text-white" : "text-slate-400"} />
                                    Mənim daxil etdiklərim
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. CARD LIST */}
                <div className="grid grid-cols-1 gap-6 mt-6 pb-20">
                    <style dangerouslySetInnerHTML={{
                        __html: `
                        @keyframes glow-emerald {
                            0% { box-shadow: 0 0 5px rgba(16, 185, 129, 0.2), 0 0 0px rgba(16, 185, 129, 0.1); }
                            50% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.6), 0 0 10px rgba(16, 185, 129, 0.4); }
                            100% { box-shadow: 0 0 5px rgba(16, 185, 129, 0.2), 0 0 0px rgba(16, 185, 129, 0.1); }
                        }
                        .animate-glow-emerald {
                            animation: glow-emerald 2s infinite ease-in-out;
                        }
                    `}} />

                    {filteredRows.slice((page - 1) * itemsPerPage, page * itemsPerPage).map((row, idx) => {
                        const globalIndex = (page - 1) * itemsPerPage + idx;
                        return (
                            <CustomerCard
                                // Important: use a unique key if possible, but fallback to idx for stability if id is missing on new rows
                                key={row.id || globalIndex}
                                row={row}
                                index={globalIndex}
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
                        );
                    })}
                </div>

                {filteredRows.length > 0 && (
                    <div className="flex flex-col items-center gap-4 pt-10 pb-20">
                        <div className="flex items-center gap-2">
                            <button
                                disabled={page === 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="h-10 w-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                <Minus size={16} />
                            </button>

                            <div className="flex items-center gap-1.5 mx-4">
                                {(() => {
                                    const totalPages = Math.ceil(filteredRows.length / itemsPerPage);
                                    let startPage = Math.max(1, page - 2);
                                    let endPage = Math.min(totalPages, startPage + 4);

                                    if (endPage - startPage < 4) {
                                        startPage = Math.max(1, endPage - 4);
                                    }

                                    const pages = [];
                                    for (let i = startPage; i <= endPage; i++) {
                                        pages.push(
                                            <button
                                                key={i}
                                                onClick={() => setPage(i)}
                                                className={cn(
                                                    "h-10 min-w-[40px] px-2 flex items-center justify-center rounded-xl text-xs font-black transition-all border",
                                                    page === i
                                                        ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200"
                                                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                                                )}
                                            >
                                                {i}
                                            </button>
                                        );
                                    }
                                    return pages;
                                })()}

                                {Math.ceil(filteredRows.length / itemsPerPage) > 5 && page < Math.ceil(filteredRows.length / itemsPerPage) - 2 && (
                                    <>
                                        <span className="text-slate-300 mx-1">...</span>
                                        <button
                                            onClick={() => setPage(Math.ceil(filteredRows.length / itemsPerPage))}
                                            className="h-10 min-w-[40px] px-2 flex items-center justify-center rounded-xl text-xs font-black bg-white text-slate-500 border border-slate-200 hover:border-slate-400 transition-all"
                                        >
                                            {Math.ceil(filteredRows.length / itemsPerPage)}
                                        </button>
                                    </>
                                )}
                            </div>

                            <button
                                disabled={page >= Math.ceil(filteredRows.length / itemsPerPage)}
                                onClick={() => setPage(p => p + 1)}
                                className="h-10 w-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                            SƏHİFƏ {page} / {Math.ceil(filteredRows.length / itemsPerPage)} — CƏM {filteredRows.length} MƏLUMAT
                        </span>
                    </div>
                )}

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
        </AuthGuard>
    );
}
