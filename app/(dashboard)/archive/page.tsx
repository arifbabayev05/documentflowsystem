"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
    Search,
    Loader2,
    FileText,
    FileUp,
    Download,
    User,
    Box,
    X,
    FileArchive,
    SearchX,
    CheckCircle2,
    Bell,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    FolderOpen,
    Trash2,
    UserCheck,
    UserPlus,
    BarChart3,
    RefreshCw,
    AlertCircle,
    Calendar,
    Store,
    ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getCustomersPage, updateCustomer, getAllUsers } from "@/lib/db";
import { parseDate } from "@/lib/format";
import AuthGuard from "@/components/auth/AuthGuard";
import { deleteAppFile, uploadAppFile } from "@/lib/app-storage";
import * as XLSX from 'xlsx';
import { ProcessStatus } from "../dashboard/page";
import { MultiSelect } from "@/components/shared/MultiSelect";

const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

interface Invoice {
    id: string;
    invoiceNumber: string;
    archiveUrl?: string;
    archiveName?: string;
    archiveRequested?: boolean;
    archiveRequestedAt?: string;
    orders?: any[];
    store?: string;
}

interface CustomerRow {
    id: string;
    customerCode: string;
    fullName: string;
    debtAmount: string;
    process_status: ProcessStatus;
    createdBy?: string;
    assignedTo?: string;
    createdAt?: string;
    details?: { 
        invoices?: Invoice[];
        fin?: string;
        address?: string;
        actualAddress?: string;
        phone?: string;
        birthDate?: string;
        passportSeries?: string;
        productDescription?: string;
        contractNumber?: string;
        contractDate?: string;
        paymentPeriod?: string;
        initialPayment?: string;
        monthlyPayment?: string;
        paidAmount?: string;
        totalPrice?: string;
    };
    updatedAt?: any;
    statusHistory?: any[];
    archiveAssignedTo?: string;
    archiveAssignedAt?: string;
    store?: string;
}

// Ensure STATUS_LABELS exact mapping is present
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    CONTACT_CENTER: { label: "1. Əlaqə mərkəzindədir", color: "text-amber-500", bg: "bg-amber-50" },
    ASSIGNED: { label: "2. İcraçıya təyin olundu", color: "text-blue-500", bg: "bg-blue-50" },
    IN_PROCESS: { label: "3. Müştəri ilə əlaqə yaradıldı", color: "text-blue-600", bg: "bg-blue-50" },
    CANT_REACH: { label: "Zəng Çatmır", color: "text-rose-500", bg: "bg-rose-50" },
    ARCHIVED: { label: "Arxiv", color: "text-slate-500", bg: "bg-slate-100" },
    LAWYER: { label: "Rəhbərdə", color: "text-indigo-500", bg: "bg-indigo-50" },
    COURT: { label: "Məhkəmədədir", color: "text-purple-500", bg: "bg-purple-50" },
    DECISION_OBTAINED: { label: "Qərar alınmışdır", color: "text-green-600", bg: "bg-green-50" },
    ICRA_YONELTILDI: { label: "İcraya yönəldilmişdir", color: "text-red-500", bg: "bg-red-50" },
    CLOSED: { label: "Bağlanmış", color: "text-slate-500", bg: "bg-slate-100" },
    ARCHIVE_REQUESTED: { label: "Arxiv Sənədi İstənilib", color: "text-orange-500", bg: "bg-orange-50" },
    ARCHIVE_UPLOADED: { label: "Arxiv Sənədi Yükləndi", color: "text-emerald-500", bg: "bg-emerald-50" }
};

const months = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "İyun", "İyul", "Avqust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
const NEW_ARCHIVE_CUTOFF = new Date("2026-04-17T00:00:00").getTime();

const emptyArchiveStats = {
    filterStats: {
        all: "0 iş / 0 faktura",
        unassigned: "0 iş / 0 faktura",
        pending: "0 iş / 0 faktura",
        done: "0 iş / 0 faktura"
    },
    workloadsByEmail: {} as Record<string, any>,
    myStats: { customerCount: 0, customersDone: 0, totalInvoices: 0, doneInvoices: 0, pendingInvoices: 0, completionRate: 0 },
    overallStats: { totalCustomers: 0, totalInvoices: 0, doneInvoices: 0, pendingInvoices: 0, pendingCustomers: 0, completionRate: 0, avgInvoices: "0", storeDist: [] as any[] }
};

const formatRequestDate = (dateVal: any) => {
    if (!dateVal) return "";
    const d = parseDate(dateVal);
    if (!d || isNaN(d.getTime())) return "";
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} ${hours}:${minutes}`;
};

export default function ArchiveDocumentsPage() {
    const { user, can } = useAuth();
    const isManager = user?.role === "ARCHIVE_MANAGER" || user?.role === "SUPERADMIN" || can("page_archive_manager");

    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [totalCustomers, setTotalCustomers] = useState(0);
    const [archivers, setArchivers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
    const [uploadingId, setUploadingId] = useState<string | null>(null);
    const [sideTab, setSideTab] = useState<"tasks" | "stats">("tasks");
    const [filter, setFilter] = useState<"all" | "pending" | "done" | "unassigned">("all");
    const [page, setPage] = useState(1);
    const itemsPerPage = 50;
    const [archiveStats, setArchiveStats] = useState(emptyArchiveStats);

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [assignOpen, setAssignOpen] = useState(false);
    const [quickAssignId, setQuickAssignId] = useState<string | null>(null);
    const [dropdownSearch, setDropdownSearch] = useState("");
    const [keyboardIndex, setKeyboardIndex] = useState(-1);
    const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
    const [selectedArchiverEmail, setSelectedArchiverEmail] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const bulkDropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [isAssigning, setIsAssigning] = useState(false);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportStartDate, setExportStartDate] = useState("");
    const [exportEndDate, setExportEndDate] = useState("");
    const [exportExecutor, setExportExecutor] = useState<string[]>([]);
    const [exportArchiveStatus, setExportArchiveStatus] = useState<string[]>([]);

    const fetchData = useCallback(async () => {
        if (!user?.email) return;
        try {
            setLoading(true);
            const result = await getCustomersPage({
                mode: "archive-tasks",
                page,
                pageSize: itemsPerPage,
                search: debouncedSearchTerm,
                currentUserEmail: user.email,
                currentUserRole: user.role,
                archiveFilter: filter,
                selectedArchiverEmail
            }) as any;

            setCustomers((result.rows || []) as CustomerRow[]);
            setTotalCustomers(Number(result.total || 0));
            setArchiveStats({ ...emptyArchiveStats, ...(result.stats || {}) });
        } catch (error) {
            console.error("Fetch error:", error);
            toast.error("Məlumatlar yüklənmədi");
        } finally {
            setLoading(false);
        }
    }, [user?.email, user?.role, page, debouncedSearchTerm, filter, selectedArchiverEmail]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        getAllUsers().then(userData => {
            setArchivers((userData as any[]).filter(u => u.role === "ARCHIVER" || u.role === "ARCHIVE_MANAGER"));
        });
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
        return () => window.clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setPage(1);
    }, [searchTerm, filter]);

    useEffect(() => {
        if (sideTab === "stats") {
            setSelectedCustomer(null);
        }
    }, [sideTab]);

    useEffect(() => {
        if (assignOpen || quickAssignId || bulkAssignOpen) {
            setDropdownSearch("");
            setKeyboardIndex(-1);
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [assignOpen, quickAssignId, bulkAssignOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (quickAssignId && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setQuickAssignId(null);
            }
            if (bulkAssignOpen && bulkDropdownRef.current && !bulkDropdownRef.current.contains(event.target as Node)) {
                setBulkAssignOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [quickAssignId, bulkAssignOpen]);

    const handleUpload = async (file: File, invoiceId: string) => {
        if (!selectedCustomer) return;
        if (!file.name.endsWith(".pdf")) { toast.error("Yalnız PDF formatı!"); return; }
        try {
            setUploadingId(invoiceId);
            const upload = await uploadAppFile(`UploadedPDFs/${selectedCustomer.id}/${invoiceId}.pdf`, file, file.name);

            // Create a minimal update object
            const invoiceUpdate = {
                id: invoiceId,
                archiveUrl: upload.url,
                archiveName: file.name,
                archiveStorageId: upload.storageId || ""
            };

            const updatePayload = {
                process_status: 'ARCHIVE_UPLOADED' as ProcessStatus,
                details: {
                    invoices: [invoiceUpdate]
                },
                _isArchivePart: true // Specialized flag for our new merge logic
            };

            const updated = await updateCustomer(selectedCustomer.id, updatePayload, user?.email || "system");

            setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, ...updated } : c));
            setSelectedCustomer(prev => prev ? { ...prev, ...updated } : null);
            toast.success("Sənəd uğurla yükləndi");
        } catch (error) {
            console.error("Upload error:", error);
            toast.error("Yükləmə zamanı xəta baş verdi");
        }
        finally { setUploadingId(null); }
    };

    const handleRemoveFile = async (invoiceId: string) => {
        if (!selectedCustomer) return;
        try {
            const existing = selectedCustomer.details?.invoices?.find(inv => inv.id === invoiceId);
            await deleteAppFile(existing?.archiveUrl || `UploadedPDFs/${selectedCustomer.id}/${invoiceId}.pdf`);

            const invoiceUpdate = {
                id: invoiceId,
                archiveUrl: "",
                archiveName: "",
                archiveStorageId: ""
            };

            const updatePayload = {
                details: {
                    invoices: [invoiceUpdate]
                },
                _isArchivePart: true
            };

            const updated = await updateCustomer(selectedCustomer.id, updatePayload, user?.email || "system");
            setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, ...updated } : c));
            setSelectedCustomer(prev => prev ? { ...prev, ...updated } : null);
            toast.success("Sənəd silindi");
        } catch { toast.error("Silinmə zamanı xəta baş verdi"); }
    };

    const handleAssign = async (archiverEmail: string, targetId?: string) => {
        if (isAssigning) return;
        const idsToUpdate = targetId ? [targetId] : (selectedIds.length > 0 ? selectedIds : (selectedCustomer ? [selectedCustomer.id] : []));
        if (idsToUpdate.length === 0) return;

        try {
            setIsAssigning(true);
            const assignAt = archiverEmail ? new Date().toISOString() : "";
            const archiverToSet = archiverEmail || "";

            const updates = idsToUpdate.map(async (cid) => {
                const updatePayload = {
                    archiveAssignedTo: archiverToSet,
                    archiveAssignedAt: assignAt
                };
                return updateCustomer(cid, updatePayload, user?.email || "system");
            });

            const results = await Promise.all(updates);

            setCustomers(prev => prev.map(c => {
                const foundIdx = idsToUpdate.indexOf(c.id);
                if (foundIdx !== -1 && results[foundIdx]) {
                    return { ...c, ...results[foundIdx] };
                }
                return c;
            }));

            if (selectedCustomer && idsToUpdate.includes(selectedCustomer.id)) {
                const myResult = results[idsToUpdate.indexOf(selectedCustomer.id)];
                if (myResult) {
                    setSelectedCustomer(prev => prev ? { ...prev, ...myResult } : null);
                }
            }

            setAssignOpen(false);
            setQuickAssignId(null);
            setBulkAssignOpen(false);
            setSelectedIds([]);
            toast.success(archiverEmail ? `${idsToUpdate.length} tapşırıq təyin edildi` : "Təyinatlar ləğv edildi");
        } catch { toast.error("Xəta baş verdi"); } finally { setIsAssigning(false); }
    };

    const getArchiveCounts = (c: CustomerRow) => {
        const rel = c.details?.invoices?.filter(inv => (inv as any).archiveRequested || inv.archiveUrl) || [];
        return {
            total: rel.length,
            done: rel.filter(inv => !!inv.archiveUrl).length
        };
    };

    const isCustomerDone = (c: CustomerRow) => {
        const { total, done } = getArchiveCounts(c);
        return total > 0 && done === total;
    };

    const isCustomerInProgress = (c: CustomerRow) => {
        const { total, done } = getArchiveCounts(c);
        return done > 0 && done < total;
    };

    const isCustomerNew = (c: CustomerRow) => {
        const { total, done } = getArchiveCounts(c);
        return total > 0 && done === 0;
    };

    const getArchiveRequestTime = useCallback((c: CustomerRow) => {
        const invoices = c.details?.invoices?.filter(inv => (inv as any).archiveRequested || inv.archiveUrl) || [];
        const activityTimes = invoices.map(inv => {
            if (inv.archiveRequestedAt) return parseDate(inv.archiveRequestedAt)?.getTime() || 0;
            return 0;
        }).filter(t => t > 0);

        if (activityTimes.length > 0) return Math.max(...activityTimes);

        const latestAction = c.statusHistory
            ?.filter(h => h.action === "ARCHIVE_REQUEST" || h.action === "FILE_UPLOAD")
            ?.sort((a: any, b: any) => (parseDate(b.timestamp)?.getTime() || 0) - (parseDate(a.timestamp)?.getTime() || 0))[0];

        return latestAction ? parseDate(latestAction.timestamp)?.getTime() || 0 : 0;
    }, []);


    const getTotalInvoiceCounts = useCallback((custList: CustomerRow[]) => {
        let totalInv = 0;
        let doneInv = 0;
        custList.forEach(c => {
            const { total, done } = getArchiveCounts(c);
            totalInv += total;
            doneInv += done;
        });
        return { totalInv, doneInv };
    }, []);

    const visibleCustomers = customers; /*
        return customers.filter(c => {
            if (getArchiveRequestTime(c) < NEW_ARCHIVE_CUTOFF) return false;
            return isManager || c.archiveAssignedTo === user?.email;
        });
    */

    const filteredCustomers = customers; /*
        const s = searchTerm.toLowerCase();
        return visibleCustomers.filter(c => {
            const nameMatch = c.fullName.toLowerCase().includes(s) || (c.customerCode || "").toLowerCase().includes(s);
            if (!nameMatch) return false;
            
            // "Hamısı" shows assigned tasks.
            if (filter === "all" && !c.archiveAssignedTo) return false;
            // "Yeni" shows only unassigned and after cutoff
            if (filter === "unassigned" && (!!c.archiveAssignedTo || getArchiveRequestTime(c) < NEW_ARCHIVE_CUTOFF)) return false;
            // "İşlənilir" shows assigned but not yet fully done
            if (filter === "pending" && (!c.archiveAssignedTo || isCustomerDone(c))) return false;
            // "Tamamlanıb" shows fully done
            if (filter === "done" && !isCustomerDone(c)) return false;
            return true;
        });
    */


    const filterStats = archiveStats.filterStats; /*
        const getStr = (list: CustomerRow[]) => {
            const invoices = getTotalInvoiceCounts(list).totalInv;
            return `${list.length} iş / ${invoices} faktura`;
        };
        return {
            all: getStr(visibleCustomers.filter(c => !!c.archiveAssignedTo)),
            unassigned: getStr(visibleCustomers.filter(c => !c.archiveAssignedTo && getArchiveRequestTime(c) >= NEW_ARCHIVE_CUTOFF)),
            pending: getStr(visibleCustomers.filter(c => !!c.archiveAssignedTo && !isCustomerDone(c))),
            done: getStr(visibleCustomers.filter(c => isCustomerDone(c)))
        };
    */


    const archiverWorkloads = useMemo(() => archivers.map(a => ({
        ...a,
        customerCount: Number(archiveStats.workloadsByEmail?.[a.email]?.customerCount || 0),
        invoiceCount: Number(archiveStats.workloadsByEmail?.[a.email]?.invoiceCount || 0),
        customerDone: Number(archiveStats.workloadsByEmail?.[a.email]?.customerDone || 0),
        invoiceDone: Number(archiveStats.workloadsByEmail?.[a.email]?.invoiceDone || 0)
    })).sort((a, b) => b.customerCount - a.customerCount), [archivers, archiveStats.workloadsByEmail]); /*
        return archivers.map(a => {
            const assigned = customers.filter(c => c.archiveAssignedTo === a.email && getArchiveRequestTime(c) >= NEW_ARCHIVE_CUTOFF);
            const { totalInv, doneInv } = getTotalInvoiceCounts(assigned);
            return {
                ...a,
                customerCount: assigned.length,
                invoiceCount: totalInv,
                customerDone: assigned.filter(c => isCustomerDone(c)).length,
                invoiceDone: doneInv
            };
        }).sort((a, b) => b.customerCount - a.customerCount);
    */

    const myStats = archiveStats.myStats; /*
        if (!user) return { customerCount: 0, customersDone: 0, totalInvoices: 0, doneInvoices: 0, pendingInvoices: 0, completionRate: 0 };
        const assigned = customers.filter(c => c.archiveAssignedTo === user.email && getArchiveRequestTime(c) >= NEW_ARCHIVE_CUTOFF);
        const customersDone = assigned.filter(c => isCustomerDone(c)).length;
        const { totalInv, doneInv } = getTotalInvoiceCounts(assigned);
        return {
            customerCount: assigned.length,
            customersDone,
            totalInvoices: totalInv,
            doneInvoices: doneInv,
            pendingInvoices: totalInv - doneInv,
            completionRate: totalInv > 0 ? Math.round((doneInv / totalInv) * 100) : 0
        };
    */

    const filteredArchivers = useMemo(() => {
        const s = dropdownSearch.toLowerCase();
        return archiverWorkloads.filter(a => a.displayName?.toLowerCase().includes(s) || a.email?.toLowerCase().includes(s));
    }, [archiverWorkloads, dropdownSearch]);

    const statsArchiver = useMemo(() => {
        if (!selectedArchiverEmail) return null;
        return archiverWorkloads.find(a => a.email === selectedArchiverEmail);
    }, [selectedArchiverEmail, archiverWorkloads]);

    const overallStats = archiveStats.overallStats; /*
        let targets = selectedArchiverEmail
            ? customers.filter(c => c.archiveAssignedTo === selectedArchiverEmail)
            : customers;

        targets = targets.filter(c => getArchiveRequestTime(c) >= NEW_ARCHIVE_CUTOFF);

        const { totalInv, doneInv } = getTotalInvoiceCounts(targets);

        // Store breakdown
        const storeStats: Record<string, { total: number, done: number }> = {};
        targets.forEach(c => {
            const store = c.store || "Seçilməyən Mağaza";
            if (!storeStats[store]) storeStats[store] = { total: 0, done: 0 };
            const { total, done } = getArchiveCounts(c);
            storeStats[store].total += total;
            storeStats[store].done += done;
        });

        const storeDist = Object.entries(storeStats)
            .map(([name, data]) => ({
                name,
                ...data,
                rate: data.total > 0 ? Math.round((data.done / data.total) * 100) : 0
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 4);

        return {
            totalCustomers: targets.length,
            totalInvoices: totalInv,
            doneInvoices: doneInv,
            pendingInvoices: totalInv - doneInv,
            pendingCustomers: targets.filter(c => !isCustomerDone(c)).length,
            completionRate: totalInv > 0 ? Math.round((doneInv / totalInv) * 100) : 0,
            avgInvoices: targets.length > 0 ? (totalInv / targets.length).toFixed(1) : "0",
            storeDist
        };
    */

    useEffect(() => {
        if (isExportModalOpen) {
            if (!isManager && user?.email) {
                setExportExecutor([user.email]);
            } else {
                setExportExecutor([]);
            }
        }
    }, [isExportModalOpen, isManager, user?.email]);

    const handleKeyDown = (e: React.KeyboardEvent, targetId?: string) => {
        if (!quickAssignId && !bulkAssignOpen && !assignOpen) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setKeyboardIndex(prev => (prev < filteredArchivers.length - 1 ? prev + 1 : prev));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setKeyboardIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === "Enter" && keyboardIndex >= 0) {
            e.preventDefault();
            handleAssign(filteredArchivers[keyboardIndex].email, targetId);
        } else if (e.key === "Escape") {
            setQuickAssignId(null);
            setBulkAssignOpen(false);
            setAssignOpen(false);
        }
    };

    const handleExcelExport = () => {
        let dataToExport = filteredCustomers.filter(c => {
            if (exportStartDate || exportEndDate) {
                if (!c.createdAt) return false;
                const createdAt = new Date(c.createdAt);
                if (isNaN(createdAt.getTime())) return false;

                createdAt.setHours(0, 0, 0, 0);
                if (exportStartDate) {
                    const s = new Date(exportStartDate);
                    s.setHours(0, 0, 0, 0);
                    if (createdAt < s) return false;
                }
                if (exportEndDate) {
                    const e = new Date(exportEndDate);
                    e.setHours(0, 0, 0, 0);
                    if (createdAt > e) return false;
                }
            }
            if (exportExecutor.length > 0) {
                if (!exportExecutor.includes(c.archiveAssignedTo as string)) return false;
            }
            if (exportArchiveStatus.length > 0) {
                const isNew = isCustomerNew(c);
                const isPending = isCustomerInProgress(c);
                const isDone = isCustomerDone(c);
                const isUnassigned = !c.archiveAssignedTo;
                
                let matches = false;
                if (exportArchiveStatus.includes("new") && isNew) matches = true;
                if (exportArchiveStatus.includes("pending") && isPending) matches = true;
                if (exportArchiveStatus.includes("done") && isDone) matches = true;
                if (exportArchiveStatus.includes("unassigned") && isUnassigned) matches = true;
                
                if (!matches) return false;
            }
            return true;
        });

        let snCounter = 1;
        const excelData = dataToExport.flatMap((item, i) => {
            const dateObj = item.createdAt ? new Date(item.createdAt) : null;
            const validDateStr = (dateObj && !isNaN(dateObj.getTime())) ? dateObj.toLocaleDateString('az-AZ') : "";

            const rawPassportSeries = item.details?.passportSeries || "";
            const finStr = item.details?.fin || "";
            const cleanSeries = rawPassportSeries.replace(new RegExp(`[- ]?${finStr}$`, 'i'), '').trim();

            const baseRowData: any = {
                "Müştəri Nömrəsi": item.customerCode || "",
                "FİN": finStr || "",
                "A.S.A": item.fullName || "",
                "Ünvan": item.details?.address || "",
                "Faktiki Ünvan": item.details?.actualAddress || "",
                "Əlaqə nömrəsi": item.details?.phone || "",
                "Doğum tarixi": item.details?.birthDate || "",
                "Seriya Nömrəsi": cleanSeries,
                "Borc məbləği": item.debtAmount || "0.00",
                "Məhsul (Ümumi)": item.details?.productDescription || "",
                "Daxil edilib": validDateStr,
                "Daxil edən": item.createdBy || "",
                "İnzibatçı": item.assignedTo || "",
                "Status": STATUS_LABELS[item.process_status as ProcessStatus]?.label || item.process_status || ""
            };

            const allInvoices = item.details?.invoices || [];
            const relevantInvoices = allInvoices.filter(inv => (inv as any).archiveRequested || inv.archiveUrl);
            const invoicesToUse = relevantInvoices.length > 0 ? relevantInvoices : allInvoices;

            if (invoicesToUse.length > 0) {
                return invoicesToUse.map((inv) => {
                    const orders = inv.orders || [];
                    const mergedProductDesc = orders.map(o => o.productDescription).filter(Boolean).join(" + ") || "";
                    const totalContractPrice = orders.reduce((sum, o) => sum + (parseFloat(o.totalPrice) || 0), 0);
                    const o = orders[0] || {};

                    return {
                        "S/N": snCounter++,
                        ...baseRowData,
                        "Mağaza": inv.store || item.store || "",
                        "Faktura Nömrəsi": inv.invoiceNumber || "",
                        "Məhsul (Faktura)": mergedProductDesc,
                        "Müqavilə Tarixi": o.contractDate || "",
                        "Müddət (ay)": o.paymentPeriod || "",
                        "İlkin Ödəniş": o.initialPayment || "",
                        "Aylıq Ödəniş": o.monthlyPayment || "",
                        "Ödənilmiş": o.paidAmount || "",
                        "Alqı-Satqı Qiyməti (Faktura)": totalContractPrice > 0 ? totalContractPrice.toString() : "",
                        "Qoşma Sənəd (Arxiv)": inv.archiveUrl ? "Yüklənib" : (inv.archiveRequested ? "İstənilib" : "Gözlənilir")
                    };
                });
            } else {
                return [{
                    "S/N": snCounter++,
                    ...baseRowData,
                    "Mağaza": item.store || "",
                    "Faktura Nömrəsi": item.details?.contractNumber || "",
                    "Məhsul (Faktura)": item.details?.productDescription || "",
                    "Müqavilə Tarixi": item.details?.contractDate || "",
                    "Müddət (ay)": item.details?.paymentPeriod || "",
                    "İlkin Ödəniş": item.details?.initialPayment || "",
                    "Aylıq Ödəniş": item.details?.monthlyPayment || "",
                    "Ödənilmiş": item.details?.paidAmount || "",
                    "Alqı-Satqı Qiyməti (Faktura)": item.details?.totalPrice || "",
                    "Qoşma Sənəd (Arxiv)": ""
                }];
            }
        });

        if (excelData.length === 0) {
            toast.error("Göstərilən filtrlərə uyğun məlumat tapılmadı");
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const objectMaxLength: number[] = [];
        excelData.forEach(obj => {
            Object.entries(obj).forEach(([key, val], idx) => {
                const v = val ? val.toString() : "";
                const max = Math.max(key.length, v.length) + 2;
                objectMaxLength[idx] = Math.max(objectMaxLength[idx] || 0, max);
            });
        });
        worksheet["!cols"] = Object.keys(excelData[0]).map((_, idx) => ({
            width: Math.min(objectMaxLength[idx], 50)
        }));

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Arxiv");
        XLSX.writeFile(workbook, `Arxiv_Export_${new Date().toISOString().split('T')[0]}.xlsx`);

        setIsExportModalOpen(false);
        toast.success("Excel faylı hazırlandı və yükləndi!");
    };

    if (!user || (!can("page_archiver") && !can("page_archive_manager") && user.role !== "SUPERADMIN")) {
        return <AuthGuard><div className="h-[60vh] flex flex-col items-center justify-center opacity-40"><FileArchive size={40} /><h2 className="mt-4 font-bold">Girişə icazə yoxdur</h2></div></AuthGuard>;
    }

    return (
        <AuthGuard>
            <div className="flex bg-[#F8FAFC] h-[calc(100vh-64px)] overflow-hidden">
                {/* Sidebar */}
                <div className="w-[580px] bg-white border-r border-slate-300 flex flex-col shrink-0 shadow-sm z-20">
                    <div className="p-6 pb-4 space-y-5 shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg">
                                    <FileArchive size={18} className="text-white" />
                                </div>
                                <div>
                                    <h1 className="text-[14px] font-bold text-slate-800 tracking-tight leading-none">Arxiv Paneli</h1>
                                    <p className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-wider">İdarəetmə Paneli</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {selectedArchiverEmail && (
                                    <button
                                        onClick={() => setSelectedArchiverEmail(null)}
                                        className="h-8 px-3 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm"
                                    >
                                        <X size={14} /> Ümumi Bax
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsExportModalOpen(true)}
                                    className="h-8 px-3 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm"
                                >
                                    <Download size={14} /> Export
                                </button>
                                <button onClick={fetchData} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-50 transition-all">
                                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                                </button>
                            </div>
                        </div>

                        {isManager && (
                            <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                                <button onClick={() => setSideTab("tasks")}
                                    className={cn("flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                                        sideTab === "tasks" ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500")}>
                                    Tapşırıqlar
                                </button>
                                <button onClick={() => setSideTab("stats")}
                                    className={cn("flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                                        sideTab === "stats" ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500")}>
                                    İş Yükü
                                </button>
                            </div>
                        )}

                        {sideTab === "tasks" && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                            placeholder="Müştəri və ya kod üzrə axtar..."
                                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium outline-none focus:bg-white focus:border-slate-400 transition-all placeholder:text-slate-400/70" />
                                    </div>
                                    {isManager && (
                                        <button
                                            onClick={() => {
                                                if (selectedIds.length === filteredCustomers.length) setSelectedIds([]);
                                                else setSelectedIds(filteredCustomers.map(c => c.id));
                                            }}
                                            className={cn("h-10 px-3 rounded-xl border flex items-center justify-center transition-all",
                                                selectedIds.length > 0 && selectedIds.length === filteredCustomers.length ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-300 text-slate-500 hover:border-slate-500")}
                                            title="Hamısını Seç"
                                        >
                                            <CheckCircle2 size={18} className={selectedIds.length > 0 ? "opacity-100" : "opacity-30"} />
                                        </button>
                                    )}
                                </div>

                                {isManager && (
                                    <div className="flex gap-1.5 overflow-x-auto pb-1.5 custom-scrollbar">
                                        {(["all", "unassigned", "pending", "done"] as const).map(f => {
                                            const labels = { all: "Hamısı", unassigned: "Yeni", pending: "İşlənilir", done: "Tamamlanıb" };
                                            const count = filterStats[f];
                                            return (
                                                <button key={f} onClick={() => setFilter(f)}
                                                    className={cn("h-8 px-3 rounded-xl text-[11px] font-semibold transition-all flex items-center gap-1.5 border whitespace-nowrap shrink-0",
                                                        filter === f ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400")}>
                                                    {labels[f]} <span className={cn("text-[10px] font-bold tracking-tight whitespace-nowrap shrink-0", filter === f ? "text-white/80" : "text-slate-400")}>({count})</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2.5 custom-scrollbar">
                        {loading ? (
                            <div className="flex flex-col items-center py-16 opacity-30"><Loader2 className="animate-spin mb-2" size={24} /><p className="text-[11px] font-bold uppercase tracking-widest">Yüklənir</p></div>
                        ) : sideTab === "stats" ? (
                            <div className="space-y-3">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 mb-4">Əməkdaşlar</h3>
                                {archiverWorkloads.map((a, i) => (
                                    <button
                                        key={a.id}
                                        onClick={() => setSelectedArchiverEmail(a.email)}
                                        className={cn(
                                            "w-full p-4 rounded-2xl border transition-all text-left",
                                            selectedArchiverEmail === a.email
                                                ? "bg-indigo-50 border-indigo-500 shadow-md ring-1 ring-indigo-500/20 scale-[1.02]"
                                                : "bg-slate-50 border-slate-300 hover:border-slate-400 hover:bg-white"
                                        )}
                                    >
                                        <div className="flex items-center gap-3.5 mb-3.5">
                                            <div className={cn(
                                                "h-10 w-10 rounded-xl flex items-center justify-center text-[13px] font-bold border shadow-sm transition-colors",
                                                selectedArchiverEmail === a.email ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-300"
                                            )}>
                                                {a.displayName?.[0]?.toUpperCase()}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className={cn("text-[12px] font-bold truncate tracking-tight", selectedArchiverEmail === a.email ? "text-indigo-900" : "text-slate-900")}>{a.displayName}</div>
                                                <div className={cn("text-[10px] truncate mt-0.5 font-medium", selectedArchiverEmail === a.email ? "text-indigo-600/70" : "text-slate-500")}>{a.email}</div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className={cn("text-[12px] font-black", selectedArchiverEmail === a.email ? "text-indigo-900" : "text-slate-900")}>{a.customerCount}</div>
                                                <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Ümumi Müştəri</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2 mb-2">
                                            <div className="flex items-center justify-between px-2 text-[9px] font-bold tracking-widest">
                                                <span className="text-emerald-600 uppercase">Tamamlanıb</span>
                                                <span className="text-rose-500 uppercase">Gözləyir</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <div className="flex-1 bg-white/50 rounded-lg p-2 border border-slate-200/60 transition-colors text-center">
                                                    <div className="text-[12px] font-black text-slate-800">
                                                        {a.customerDone} <span className="text-[9px] text-slate-400 font-medium">iş</span>
                                                    </div>
                                                    <div className="text-[9px] text-slate-400 font-medium mt-0.5 whitespace-nowrap">({a.invoiceDone} fakt.)</div>
                                                </div>
                                                <div className="flex-1 bg-white/50 rounded-lg p-2 border border-slate-200/60 transition-colors text-center shadow-sm border-rose-100 bg-rose-50/30">
                                                    <div className="text-[12px] font-black text-slate-800">
                                                        {a.customerCount - a.customerDone} <span className="text-[9px] text-slate-400 font-medium">iş</span>
                                                    </div>
                                                    <div className="text-[9px] text-slate-400 font-medium mt-0.5 whitespace-nowrap">({a.invoiceCount - a.invoiceDone} fakt.)</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className={cn("h-1.5 rounded-full overflow-hidden border border-slate-300/30", selectedArchiverEmail === a.email ? "bg-indigo-200/50" : "bg-slate-200")}>
                                            <div
                                                className={cn(
                                                    "h-full transition-all duration-1000 ease-out",
                                                    selectedArchiverEmail === a.email ? "bg-indigo-600" : "bg-slate-500"
                                                )}
                                                style={{ width: a.invoiceCount > 0 ? `${(a.invoiceDone / a.invoiceCount) * 100}%` : '0%' }}
                                            />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : filteredCustomers.map(c => {
                            const isSelected = selectedCustomer?.id === c.id;
                            const invoices = c.details?.invoices?.filter(i => (i as any).archiveRequested || i.archiveUrl) || [];
                            const done = invoices.filter(i => !!i.archiveUrl).length;
                            const total = invoices.length;
                            const isDone = done === total && total > 0;
                            const archiverName = archivers.find(a => a.email === c.archiveAssignedTo)?.displayName;
                            const assignDate = c.archiveAssignedAt ? new Date(c.archiveAssignedAt).toLocaleDateString('az-AZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;

                            const isSelectedInList = selectedIds.includes(c.id);

                            return (
                                <div key={c.id} className="flex items-center gap-2 text-[13px] group/card">
                                    {isManager && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]);
                                            }}
                                            className={cn("h-6 w-6 rounded-md border flex items-center justify-center transition-all shrink-0",
                                                isSelectedInList ? "bg-slate-900 border-slate-900 text-white shadow-sm" : "bg-white border-slate-200 text-transparent hover:border-slate-400 group-hover/card:text-slate-400")}
                                        >
                                            <Check size={14} strokeWidth={4} />
                                        </button>
                                    )}
                                    <div onClick={() => setSelectedCustomer(c)} role="button" tabIndex={0}
                                        className={cn("flex-1 p-4 rounded-2xl text-left border transition-all relative cursor-pointer outline-none",
                                            isSelected ? "bg-slate-900 border-slate-900 shadow-xl scale-[1.02] z-10" : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-400")}>
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="min-w-0 flex-1">
                                                <h3 className={cn("text-[13px] font-semibold truncate tracking-tight", isSelected ? "text-white" : "text-slate-900")}>{c.fullName}</h3>
                                                <p className={cn("text-[10px] font-medium mt-1 text-slate-400")}>#{c.customerCode}</p>
                                            </div>
                                            <div className={cn("text-[10px] font-bold px-2 py-1 rounded-md border", isSelected ? "bg-white/10 text-white border-white/20" : "bg-slate-50 text-slate-500 border-slate-200")}>
                                                {done}/{total}
                                            </div>
                                        </div>

                                        {/* Latest Request Time */}
                                        {(() => {
                                            const latestReq = invoices
                                                .filter(i => i.archiveRequestedAt)
                                                .sort((a, b) => new Date(b.archiveRequestedAt!).getTime() - new Date(a.archiveRequestedAt!).getTime())[0];

                                            // Fallback to status history if no direct invoice timestamp
                                            const historyReq = !latestReq ? c.statusHistory
                                                ?.filter((h: any) => h.action === "ARCHIVE_REQUEST")
                                                ?.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0] : null;

                                            const displayDate = latestReq?.archiveRequestedAt || (historyReq ? historyReq.timestamp : null);

                                            if (!displayDate) return null;

                                            return (
                                                <div className={cn("flex items-center gap-1.5 mb-3 text-[10px] font-bold", isSelected ? "text-emerald-400" : "text-emerald-600")}>
                                                    <Clock size={11} />
                                                    Son İstək Göndərildi: {formatRequestDate(displayDate)}
                                                </div>
                                            );
                                        })()}

                                        <div className="space-y-3">
                                            <div className={cn("h-1.5 rounded-md overflow-hidden", isSelected ? "bg-white/10" : "bg-slate-100 border border-slate-200")}>
                                                <div className={cn("h-full transition-all duration-500", isDone ? "bg-emerald-500" : isSelected ? "bg-white" : "bg-slate-900")} style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }} />
                                            </div>

                                            <div className="flex items-center justify-between group/row relative">
                                                {c.archiveAssignedTo ? (
                                                    <div className={cn("flex items-center gap-2", isSelected ? "text-slate-400" : "text-slate-500")}>
                                                        <UserCheck size={11} className="shrink-0" />
                                                        <span className="text-[10px] font-medium truncate max-w-[140px]">{archiverName || c.archiveAssignedTo}</span>
                                                        {assignDate && <span className="text-[9px] font-medium opacity-70">• {assignDate}</span>}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-500">
                                                        <AlertCircle size={11} className="shrink-0" /> Təyinat yoxdur
                                                    </div>
                                                )}

                                                {isManager && (
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <button onClick={(e) => { e.stopPropagation(); setQuickAssignId(quickAssignId === c.id ? null : c.id); }}
                                                            className={cn("h-8 px-4 rounded-md flex items-center justify-center gap-2 transition-all border text-[10px] font-bold shadow-sm",
                                                                quickAssignId === c.id ? "bg-white text-slate-900 border-white" :
                                                                    isSelected ? "bg-white/10 text-white border-white/20 hover:bg-white/20" : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900 active:scale-95")}>
                                                            {c.archiveAssignedTo ? <UserCheck size={12} /> : <UserPlus size={12} />}
                                                            {c.archiveAssignedTo ? "Dəyiş" : "Təyin Et"}
                                                        </button>
                                                    </div>
                                                )}

                                                {quickAssignId === c.id && (
                                                    <div ref={dropdownRef} className="absolute top-[calc(100%+8px)] right-0 w-64 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-300 ring-1 ring-slate-900/5" onClick={e => e.stopPropagation()}>
                                                        <div className="relative mb-2">
                                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                                                            <input ref={searchInputRef} type="text" placeholder="Arxivçi axtar..." value={dropdownSearch}
                                                                onChange={e => { setDropdownSearch(e.target.value); setKeyboardIndex(-1); }}
                                                                onKeyDown={(e) => handleKeyDown(e, c.id)}
                                                                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-[11px] font-bold outline-none focus:bg-white focus:border-slate-500 transition-all" />
                                                        </div>
                                                        <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-0.5">
                                                            {filteredArchivers.length === 0 ? (
                                                                <div className="py-4 text-center text-[10px] text-slate-400 font-bold uppercase italic">Tapılmadı</div>
                                                            ) : filteredArchivers.map((a, i) => (
                                                                <button key={a.id} disabled={isAssigning} onClick={(e) => { e.stopPropagation(); handleAssign(a.email, c.id); }} onMouseEnter={() => setKeyboardIndex(i)}
                                                                    className={cn("w-full p-2 rounded-lg flex items-center gap-3 text-left transition-all", keyboardIndex === i ? "bg-slate-900 shadow-lg" : "hover:bg-slate-50", isAssigning && "opacity-50 cursor-not-allowed")}>
                                                                    <div className={cn("h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 border", keyboardIndex === i ? "bg-white/10 text-white border-white/20" : "bg-white text-slate-700 border-slate-200")}>
                                                                        {a.displayName?.[0]}
                                                                    </div>
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <p className={cn("text-[11px] font-bold truncate", keyboardIndex === i ? "text-white" : "text-slate-900")}>{a.displayName}</p>
                                                                            <span className={cn("text-[9px] font-black shrink-0", keyboardIndex === i ? "text-white/60" : "text-slate-400")}>
                                                                                {a.customerCount} / {a.invoiceCount}
                                                                            </span>
                                                                        </div>
                                                                        <p className={cn("text-[9px] truncate opacity-50", keyboardIndex === i ? "text-slate-400" : "text-slate-500")}>{a.email}</p>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                        {user?.role === "SUPERADMIN" && c.archiveAssignedTo && (
                                                            <div className="mt-2 pt-2 border-t border-slate-100">
                                                                <button disabled={isAssigning} onClick={(e) => { e.stopPropagation(); handleAssign("", c.id); }}
                                                                    className={cn("w-full p-2 rounded-lg text-rose-500 hover:bg-rose-50 text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2", isAssigning && "opacity-50 cursor-not-allowed")}>
                                                                    <Trash2 size={12} /> Təyinatı Sil
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {sideTab === "tasks" && !loading && totalCustomers > itemsPerPage && (
                            <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border-t border-slate-200 pt-3 pb-1 mt-3">
                                <div className="flex items-center justify-between gap-2">
                                    <button
                                        disabled={page === 1}
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30 flex items-center justify-center hover:border-slate-400 transition-all"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                                        Səhifə {page} / {Math.ceil(totalCustomers / itemsPerPage)} · Cəm {totalCustomers}
                                    </div>
                                    <button
                                        disabled={page >= Math.ceil(totalCustomers / itemsPerPage)}
                                        onClick={() => setPage(p => p + 1)}
                                        className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30 flex items-center justify-center hover:border-slate-400 transition-all"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bulk Action Bar - Floating Center Pill */}
                    {isManager && selectedIds.length > 0 && (
                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-8 fade-in duration-500 scale-100 hover:scale-[1.02] transition-transform">
                            <div className="bg-slate-900/90 backdrop-blur-2xl text-white rounded-full p-2 pl-7 flex items-center gap-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.4)] border border-white/10">
                                <div className="flex items-center gap-4">
                                    <p className="text-[12px] font-medium text-white/70">{selectedIds.length} müştəri seçilib</p>
                                </div>
                                <div className="flex items-center gap-2 relative">
                                    <button onClick={() => setSelectedIds([])}
                                        className="h-10 px-5 text-[11px] font-semibold text-rose-300 hover:text-rose-200 transition-all hover:bg-white/5 rounded-full">
                                        Seçimi təmizlə
                                    </button>
                                    <div className="h-6 w-px bg-white/10 mx-2" />
                                    <button onClick={(e) => { e.stopPropagation(); setBulkAssignOpen(!bulkAssignOpen); }}
                                        className="h-11 px-8 bg-white text-slate-950 rounded-full text-[11px] font-bold shadow-xl flex items-center gap-3 transition-all active:scale-95 group hover:bg-slate-50">
                                        Toplu Təyin Et <ChevronDown size={16} className={cn("transition-transform duration-300 opacity-60", bulkAssignOpen && "rotate-180")} />
                                    </button>

                                    {bulkAssignOpen && (
                                        <div ref={bulkDropdownRef} className="absolute bottom-full right-0 mb-5 w-80 bg-white border border-slate-200 rounded-[2.5rem] shadow-[0_30px_80px_-15px_rgba(0,0,0,0.5)] p-5 z-50 animate-in fade-in zoom-in-95 duration-300 ring-1 ring-black/5" onClick={e => e.stopPropagation()}>
                                            <div className="relative mb-4">
                                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                                <input ref={searchInputRef} type="text" placeholder="Arxivçi axtar..." value={dropdownSearch}
                                                    onChange={e => { setDropdownSearch(e.target.value); setKeyboardIndex(-1); }}
                                                    onKeyDown={(e) => handleKeyDown(e)}
                                                    className="w-full pl-11 pr-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-[13px] font-bold outline-none focus:bg-white focus:border-slate-500 transition-all text-slate-900 shadow-inner font-sans" />
                                            </div>
                                            <div className="max-h-[350px] overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                                                {filteredArchivers.length === 0 ? (
                                                    <div className="py-10 text-center text-[11px] text-slate-400 font-bold uppercase italic tracking-[0.3em]">Nəticə tapılmadı</div>
                                                ) : filteredArchivers.map((a, i) => (
                                                    <button key={a.id} disabled={isAssigning} onClick={() => handleAssign(a.email)} onMouseEnter={() => setKeyboardIndex(i)}
                                                        className={cn("w-full p-4 rounded-[1.25rem] flex items-center gap-4 text-left transition-all", keyboardIndex === i ? "bg-slate-900 shadow-xl" : "hover:bg-slate-50", isAssigning && "opacity-50 cursor-not-allowed")}>
                                                        <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center text-[14px] font-black shrink-0 border transition-colors", keyboardIndex === i ? "bg-white/10 text-white border-white/20" : "bg-white text-slate-700 border-slate-200 shadow-sm")}>
                                                            {a.displayName?.[0]}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center justify-between gap-2 mb-0.5">
                                                                <p className={cn("text-[14px] font-black truncate tracking-tight", keyboardIndex === i ? "text-white" : "text-slate-900")}>{a.displayName}</p>
                                                                <span className={cn("text-[11px] font-black shrink-0", keyboardIndex === i ? "text-white/60" : "text-slate-500")}>
                                                                    {a.customerCount} / {a.invoiceCount}
                                                                </span>
                                                            </div>
                                                            <p className={cn("text-[10px] truncate font-bold uppercase opacity-50", keyboardIndex === i ? "text-slate-400" : "text-slate-500")}>{a.email}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                            {user?.role === "SUPERADMIN" && (
                                                <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                                                    <button disabled={isAssigning} onClick={() => handleAssign("")}
                                                        className={cn("flex-1 p-3.5 rounded-2xl border border-rose-100 text-rose-500 hover:bg-rose-50 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2", isAssigning && "opacity-50 cursor-not-allowed")}>
                                                        <Trash2 size={14} /> Təyinatları Sil
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Main Content */}
                <div className="flex-1 overflow-y-auto bg-slate-50/50 relative custom-scrollbar">
                    {/* NEW: Archiver Stats Header for Non-Managers */}
                    {!isManager && (
                        <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-8 py-4 shadow-sm">
                            <div className="max-w-[1200px] mx-auto">
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between group hover:border-indigo-300 transition-all">
                                        <div className="flex-1">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Tamamlanma</span>
                                            <p className="text-2xl font-black text-slate-900 leading-none mb-2">{myStats.completionRate}%</p>
                                            <div className="h-1 bg-white rounded-full overflow-hidden w-24 border border-slate-100">
                                                <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${myStats.completionRate}%` }} />
                                            </div>
                                        </div>
                                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 border",
                                            myStats.completionRate >= 80 ? "bg-white text-emerald-600 border-emerald-100 shadow-sm" :
                                                myStats.completionRate >= 40 ? "bg-white text-amber-600 border-amber-100 shadow-sm" : "bg-white text-rose-500 border-rose-100 shadow-sm"
                                        )}>
                                            %
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between group hover:border-indigo-300 transition-all">
                                        <div>
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Müştəri</span>
                                            <div className="flex items-end gap-2">
                                                <p className="text-2xl font-black text-slate-900 leading-none">{myStats.customerCount}</p>
                                                <p className="text-[9px] font-bold text-emerald-600 mb-0.5">{myStats.customersDone} b.</p>
                                            </div>
                                        </div>
                                        <div className="h-10 w-10 rounded-xl bg-white text-slate-400 border border-slate-200 flex items-center justify-center shrink-0 shadow-sm group-hover:text-indigo-600 group-hover:border-indigo-200 transition-all">
                                            <User size={16} />
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between group hover:border-indigo-300 transition-all">
                                        <div>
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Faktura</span>
                                            <div className="flex items-end gap-2">
                                                <p className="text-2xl font-black text-slate-900 leading-none">{myStats.doneInvoices}</p>
                                                <p className="text-[9px] font-bold text-slate-400 mb-0.5">/ {myStats.totalInvoices}</p>
                                            </div>
                                        </div>
                                        <div className="h-10 w-10 rounded-xl bg-white text-slate-400 border border-slate-200 flex items-center justify-center shrink-0 shadow-sm group-hover:text-indigo-600 group-hover:border-indigo-200 transition-all">
                                            <FileText size={16} />
                                        </div>
                                    </div>

                                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center justify-between group hover:border-rose-300 transition-all shadow-sm">
                                        <div>
                                            <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1.5 block">Qalan İş / Fakt.</span>
                                            <div className="flex items-end gap-2">
                                                <p className="text-2xl font-black text-slate-900 leading-none">{myStats.customerCount - myStats.customersDone}</p>
                                                <p className="text-[9px] font-bold text-slate-400 mb-0.5">iş</p>
                                                <p className="text-[12px] font-black text-slate-600 ml-1 leading-tight border-l pl-2 border-slate-300">{myStats.pendingInvoices}</p>
                                                <p className="text-[9px] font-bold text-slate-400 mb-0.5 whitespace-nowrap">fakt. qalıb</p>
                                            </div>
                                        </div>
                                        <div className="h-10 w-10 rounded-xl bg-white text-rose-500 border border-rose-200 flex items-center justify-center shrink-0 shadow-sm transition-all">
                                            <Clock size={16} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {sideTab === "stats" ? (
                        <div className="flex flex-col p-6 max-w-[1200px] mx-auto space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                            {/* Unified Admin Header */}
                            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5 flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0">
                                        {statsArchiver ? <User size={20} /> : <BarChart3 size={20} />}
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-none truncate">
                                            {statsArchiver ? statsArchiver.displayName : "Mərkəzi İş Yükü Dashboard"}
                                        </h2>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mt-1.5 truncate">
                                            {statsArchiver ? statsArchiver.email : "Arxiv sisteminin ümumi məhsuldarlıq göstəriciləri"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {selectedArchiverEmail && (
                                        <button
                                            onClick={() => setSelectedArchiverEmail(null)}
                                            className="h-8 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-[9px] font-black uppercase tracking-wider text-slate-600 transition-colors"
                                        >
                                            Ümumi Görünüşə Qayıt
                                        </button>
                                    )}

                                </div>
                            </div>

                            {/* Dense Stats Grid */}
                            <div className="grid grid-cols-5 gap-4 mb-5">
                                {[
                                    { label: "Müştəri (İş)", val: overallStats.totalCustomers, icon: <User size={14} />, color: "text-blue-600" },
                                    { label: "Faktura", val: overallStats.totalInvoices, icon: <FileText size={14} />, color: "text-indigo-600" },
                                    { label: "BİtƏN İŞLƏR", val: overallStats.totalCustomers - overallStats.pendingCustomers, icon: <CheckCircle2 size={14} />, color: "text-emerald-600" },
                                    { label: "QALAN İŞLƏR", val: overallStats.pendingCustomers, icon: <Clock size={14} />, color: "text-rose-500" },
                                    { label: "Qalan Faktura", val: overallStats.pendingInvoices, icon: <BarChart3 size={14} />, color: "text-rose-700" },
                                ].map((item, i) => (
                                    <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                                            <p className="text-xl font-black text-slate-900 leading-none tracking-tight">{item.val}</p>
                                        </div>
                                        <div className={cn("h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100", item.color)}>
                                            {item.icon}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Main Analysis Area */}
                            <div className="grid grid-cols-12 gap-4 items-start">
                                {/* Performance & Progress */}
                                <div className="col-span-12 lg:col-span-7 flex flex-col gap-4">
                                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-8">
                                        <div>
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Performans Analizi</h3>
                                                <span className="text-[9px] font-bold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded border border-emerald-100 uppercase">Real-Time</span>
                                            </div>
                                            <div className="flex items-end gap-3 mb-1">
                                                <span className="text-6xl font-black tracking-tighter text-slate-900 leading-none">{overallStats.completionRate}%</span>
                                                <div className="pb-1.5">
                                                    <p className="text-[13px] font-black text-slate-800 uppercase leading-none">Arxiv Fondu</p>
                                                    <p className="text-[10px] font-medium text-slate-400 mt-1">Sənədlərin yüklənmə nisbəti</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                                <div
                                                    className="h-full bg-emerald-500 transition-all duration-1000 ease-in-out"
                                                    style={{ width: `${overallStats.completionRate}%` }}
                                                />
                                            </div>
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="space-y-1">
                                                    <p className="text-[18px] font-black text-emerald-600 leading-none">{overallStats.doneInvoices}</p>
                                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Yüklənmiş</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[18px] font-black text-rose-500 leading-none">{overallStats.pendingInvoices}</p>
                                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Gözləyən</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[18px] font-black text-slate-900 leading-none">{overallStats.totalInvoices}</p>
                                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Cəmi Hədəf</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                                        <div className="flex items-center justify-between mb-4 px-1">
                                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status İcmalı</h3>
                                            <span className="text-[9px] font-bold text-slate-400">Müştəri Sayı</span>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="flex-1 p-3 bg-emerald-50/20 rounded-lg border border-emerald-100 flex items-center justify-between">
                                                <span className="text-[9px] font-bold text-emerald-700 uppercase">Bitən</span>
                                                <span className="text-[13px] font-black text-emerald-900">{overallStats.totalCustomers - overallStats.pendingCustomers}</span>
                                            </div>
                                            <div className="flex-1 p-3 bg-rose-50/20 rounded-lg border border-rose-100 flex items-center justify-between">
                                                <span className="text-[9px] font-bold text-rose-700 uppercase">Gözləyən</span>
                                                <span className="text-[13px] font-black text-rose-900">{overallStats.pendingCustomers}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Breakdown */}
                                <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
                                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
                                        <div className="flex items-center justify-between mb-2 px-1">
                                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mağaza Paylanması</h3>
                                            <BarChart3 size={14} className="text-slate-400" />
                                        </div>
                                        <div className="space-y-4 max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
                                            {overallStats.storeDist.map((s, i) => (
                                                <div key={i} className="group cursor-default">
                                                    <div className="flex items-center justify-between mb-1.5 px-0.5">
                                                        <span className="text-[10px] font-bold text-slate-700 group-hover:text-indigo-600 transition-colors uppercase truncate max-w-[150px]">{s.name}</span>
                                                        <span className="text-[10px] font-black text-slate-900">{s.total}</span>
                                                    </div>
                                                    <div className="h-1 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                                                        <div
                                                            className="h-full bg-slate-300 group-hover:bg-indigo-500 transition-all duration-500"
                                                            style={{ width: `${(s.total / overallStats.totalInvoices) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="pt-4 border-t border-slate-100">
                                            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                                                <span className="text-[8px] font-bold text-slate-500 uppercase">Ən Çox Sənəd İstənən Mağaza</span>
                                                <span className="text-[9px] font-black text-slate-900 uppercase truncate max-w-[120px]">{overallStats.storeDist[0]?.name || "N/A"}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : !selectedCustomer ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-40 text-center p-12">
                            <Box size={50} strokeWidth={1} className="text-slate-400 mb-8" />
                            <h2 className="text-2xl font-bold text-slate-900 uppercase tracking-tight italic">Tapşırıq Seçilməyib</h2>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.3em] mt-3">Məlumatları görmək üçün sol siyahıdan müştəri seçin</p>
                        </div>
                    ) : (
                        <div className="max-w-5xl mx-auto py-12 px-10 animate-in fade-in duration-500">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-12 pb-8 border-b border-slate-200">
                                <div className="flex items-center gap-8">
                                    <div className="h-16 w-16 rounded-[1.25rem] bg-slate-900 flex items-center justify-center text-white shadow-2xl ring-4 ring-slate-50">
                                        <User size={30} />
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-bold text-slate-900 tracking-tight leading-none">{selectedCustomer.fullName}</h2>
                                        <div className="flex items-center gap-5 text-[12px] font-medium text-slate-500 mt-4">
                                            <span className="flex items-center gap-2 font-semibold text-slate-400"><FolderOpen size={14} /> {selectedCustomer.customerCode}</span>
                                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                                            <span className="text-slate-400">Arxiv Paneli</span>
                                            {selectedCustomer.archiveAssignedTo && (
                                                <>
                                                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                                                    <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3.5 py-1.5 rounded-full text-[11px] font-semibold border border-emerald-100 shadow-sm">
                                                        <UserCheck size={12} className="text-emerald-500" />
                                                        Məsul: {archivers.find(a => a.email === selectedCustomer.archiveAssignedTo)?.displayName || selectedCustomer.archiveAssignedTo}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedCustomer(null)} className="h-12 w-12 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all border border-transparent hover:border-rose-100">
                                    <X size={28} />
                                </button>
                            </div>

                            {/* Section Title */}
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3">
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-900" />
                                    Fakturalar Və Sənədlər
                                </h3>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
                                    Cəmi: {(selectedCustomer.details?.invoices || []).filter(inv => (inv as any).archiveRequested || inv.archiveUrl).length} Faktura
                                </div>
                            </div>

                            {/* Invoices List */}
                            <div className="grid grid-cols-1 gap-3">
                                {(selectedCustomer.details?.invoices || [])
                                    .filter(inv => (inv as any).archiveRequested || inv.archiveUrl)
                                    .map((inv, idx) => {
                                        const isUploaded = !!inv.archiveUrl;
                                        const isMyUpload = uploadingId === inv.id;

                                        // Heuristic for request date
                                        const requestDate = inv.archiveRequestedAt ||
                                            (selectedCustomer.statusHistory || [])
                                                .filter((h: any) => h.action === "ARCHIVE_REQUEST")
                                                .sort((a: any, b: any) => (parseDate(b.timestamp)?.getTime() || 0) - (parseDate(a.timestamp)?.getTime() || 0))[idx]?.timestamp ||
                                            (selectedCustomer.statusHistory || [])
                                                .filter((h: any) => h.action === "ARCHIVE_REQUEST")[0]?.timestamp;

                                        return (
                                            <div key={inv.id} className={cn(
                                                "p-4 rounded-xl border transition-all relative group flex items-center justify-between gap-4",
                                                isUploaded ? "bg-emerald-50/20 border-emerald-500/20 shadow-sm" : "bg-white border-slate-200 hover:border-slate-400 shadow-sm"
                                            )}>
                                                <div className="flex items-center gap-5 min-w-0">
                                                    <div className={cn(
                                                        "h-10 w-10 rounded-lg flex items-center justify-center font-bold text-[13px] shrink-0 border",
                                                        isUploaded ? "bg-emerald-500 text-white border-emerald-400" : "bg-slate-50 text-slate-400 border-slate-200 shadow-inner"
                                                    )}>
                                                        {isUploaded ? <Check size={18} /> : (idx + 1).toString().padStart(2, '0')}
                                                    </div>

                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-3 mb-1">
                                                            <h4 className="text-[15px] font-bold text-slate-900 truncate">№ {inv.invoiceNumber || "N/A"}</h4>
                                                            {isUploaded && (
                                                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase tracking-wider">Yüklənib</span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-4 text-[11px] font-medium text-slate-500">
                                                            {inv.orders && inv.orders[0] && (
                                                                <span className="flex items-center gap-1.5"><Calendar size={12} className="text-slate-400" /> {inv.orders[0].contractDate || "00.00.0000"}</span>
                                                            )}
                                                            {selectedCustomer.store && (
                                                                <span className="flex items-center gap-1.5"><Store size={12} className="text-slate-400" /> {selectedCustomer.store}</span>
                                                            )}
                                                            {requestDate && (
                                                                <span className="flex items-center gap-1.5 text-emerald-600 font-bold bg-emerald-50 px-2 rounded">
                                                                    <Clock size={12} /> İstək Göndərildi: {formatRequestDate(requestDate)}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {isUploaded && inv.archiveName && (
                                                            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400 truncate max-w-sm italic">
                                                                <FileText size={10} /> {inv.archiveName}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    {isUploaded ? (
                                                        <>
                                                            <a href={inv.archiveUrl} target="_blank"
                                                                className="h-9 px-4 bg-white text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold hover:bg-slate-950 hover:text-white hover:border-slate-950 transition-all flex items-center gap-2 shadow-sm">
                                                                Sənədə Bax <ExternalLink size={12} />
                                                            </a>
                                                            {(isManager || selectedCustomer.archiveAssignedTo === user?.email) && (
                                                                <button onClick={() => handleRemoveFile(inv.id)}
                                                                    className="h-9 w-9 flex items-center justify-center bg-white text-rose-500 border border-rose-100 hover:bg-rose-500 hover:text-white rounded-lg transition-all shadow-sm">
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
                                                        </>
                                                    ) : (
                                                        (isManager || selectedCustomer.archiveAssignedTo === user?.email) && (
                                                            <label className={cn(
                                                                "h-9 px-6 bg-slate-950 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-all shadow-md hover:shadow-lg flex items-center gap-2.5 active:scale-95",
                                                                isMyUpload && "opacity-50 pointer-events-none"
                                                            )}>
                                                                {isMyUpload ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                                                                {isMyUpload ? "Yüklənir..." : "Sənədi Yüklə"}
                                                                <input type="file" className="hidden" accept=".pdf" disabled={!!uploadingId}
                                                                    onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], inv.id)} />
                                                            </label>
                                                        )
                                                    )}

                                                    {!isUploaded && !isManager && selectedCustomer.archiveAssignedTo !== user?.email && (
                                                        <div className="px-3 py-2 bg-slate-50 text-slate-400 rounded-lg text-[9px] font-black uppercase border border-slate-200 flex items-center gap-2 italic tracking-widest">
                                                            <Clock size={14} className="opacity-40" /> Gözlənilir
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* EXPORT MODAL */}
            {isExportModalOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300 cursor-pointer"
                    onClick={() => setIsExportModalOpen(false)}
                >
                    <div
                        className="bg-white rounded-xl p-8 max-w-2xl w-full shadow-2xl border border-slate-200 animate-in zoom-in duration-200 cursor-default flex flex-col gap-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col text-center gap-2">
                            <div className="h-16 w-16 bg-green-50 text-green-600 rounded-xl flex items-center justify-center border border-green-100 mx-auto mb-2">
                                <Download size={32} />
                            </div>
                            <h3 className="text-xl font-black text-slate-800 uppercase">Excel Export (Arxiv)</h3>
                            <p className="text-sm text-slate-600 font-medium">Məlumatları filtrləyin və yükləyin</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Başlanğıc Tarix</label>
                                <div className="relative">
                                    <input
                                        type="date"
                                        value={exportStartDate}
                                        onClick={(e) => "showPicker" in HTMLInputElement.prototype && (e.target as any).showPicker()}
                                        onChange={(e) => setExportStartDate(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-xs focus:border-primary transition-colors cursor-pointer"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Bitiş Tarix</label>
                                <div className="relative">
                                    <input
                                        type="date"
                                        value={exportEndDate}
                                        onClick={(e) => "showPicker" in HTMLInputElement.prototype && (e.target as any).showPicker()}
                                        onChange={(e) => setExportEndDate(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-xs focus:border-primary transition-colors cursor-pointer"
                                    />
                                </div>
                            </div>

                            {isManager && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">İşin kimin üstündə olduğu (İcraçı)</label>
                                    <MultiSelect
                                        options={Array.from(new Set(customers.map(c => c.archiveAssignedTo).filter(Boolean))).map(email => ({ 
                                            value: email as string, 
                                            label: archivers.find(a => a.email === email)?.displayName || email as string 
                                        }))}
                                        selected={exportExecutor}
                                        onChange={setExportExecutor}
                                        placeholder="Bütün icraçılar"
                                    />
                                </div>
                            )}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Arxiv Statusu</label>
                                <MultiSelect
                                    options={[
                                        { value: "new", label: "Yeni" },
                                        { value: "pending", label: "İşlənilir / Gözlənilir" },
                                        { value: "done", label: "Tamamlanıb (Yüklənib)" },
                                        { value: "unassigned", label: "Təyinat olunmayıb" }
                                    ]}
                                    selected={exportArchiveStatus}
                                    onChange={setExportArchiveStatus}
                                    placeholder="Bütün statuslar"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row w-full gap-3 mt-4">
                            <button
                                onClick={handleExcelExport}
                                className="w-full sm:flex-1 bg-green-600 text-white py-3.5 rounded-lg font-black text-[12px] uppercase tracking-widest hover:bg-green-700 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                            >
                                <Download size={16} />
                                Export Seçimi Yüklə
                            </button>
                            <button
                                onClick={() => setIsExportModalOpen(false)}
                                className="w-full sm:w-auto px-8 bg-slate-50 text-slate-600 py-3.5 rounded-lg font-black text-[12px] uppercase tracking-widest border border-slate-200 hover:bg-slate-100 transition-all"
                            >
                                Ləğv Et
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AuthGuard >
    );
}
