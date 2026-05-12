import { db, storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    runTransaction,
    Transaction,
    query,
    where,
    limit,
    startAfter,
    startAt,
    endAt,
    serverTimestamp,
    deleteDoc,
    writeBatch,
    orderBy,
    increment,
    documentId,
    getCountFromServer,
    QueryConstraint,
    QueryDocumentSnapshot,
    DocumentData
} from "firebase/firestore";
import { AVAILABLE_PERMISSIONS } from "./permissions";

const USERS_COLLECTION = "Users";
const PERMISSIONS_COLLECTION = "Permissions";
const CUSTOMERS_COLLECTION = "Customers";
const AUDIT_COLLECTION = "AuditLogs";
const SETTINGS_COLLECTION = "GlobalSettings";
const COURTS_COLLECTION = "Courts";
const STORES_COLLECTION = "Stores";
const TEMPLATES_COLLECTION = "Templates";
const ERRORS_COLLECTION = "SystemErrors";
const ARCHIVE_REQUEST_CUTOFF = new Date("2026-03-04T00:00:00").getTime();
const ARCHIVE_VISIBLE_CUTOFF = new Date("2026-04-17T00:00:00").getTime();

export type CustomerPageCursor = QueryDocumentSnapshot<DocumentData> | null;

export interface CustomerPageOptions {
    pageSize?: number;
    cursor?: CustomerPageCursor;
    page?: number;
    searchTerm?: string;
    scope?: "all" | "active" | "archived" | "archiveTasks";
    assignedTo?: string;
    archiveAssignedTo?: string;
    createdBy?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    archiveTaskKey?: string;
    archivedCustomerKey?: string;
    filter?: (customer: any) => boolean;
    maxReads?: number;
    searchScanLimit?: number;
}

export interface CustomerPageResult {
    rows: any[];
    cursor: CustomerPageCursor;
    hasMore: boolean;
    searchMode: boolean;
    readCount: number;
}

export interface CustomerDashboardStats {
    active: number;
    archived: number;
    total: number;
    unassigned: number;
    isGlobal: boolean;
    breakdown: {
        active: Array<{ label: string; value: number }>;
        archived: Array<{ label: string; value: number }>;
        total: Array<{ label: string; value: number }>;
    };
}

export type ArchiveTaskFilter = "all" | "unassigned" | "pending" | "done";

export interface ArchiveTaskCount {
    jobs: number;
    invoices: number;
}

export type ArchiveTaskStats = Record<ArchiveTaskFilter, ArchiveTaskCount>;

// --- Helpers ---
/**
 * Recursively removes undefined values from an object or array.
 * Firebase doesn't allow 'undefined' as a value.
 */
function sanitizeFirebaseData(data: any): any {
    if (data === undefined) return null;
    if (data === null || typeof data !== 'object') return data;

    if (Array.isArray(data)) {
        return data.map(v => sanitizeFirebaseData(v));
    }

    const cleaned: any = {};
    Object.keys(data).forEach(key => {
        const value = data[key];
        if (value !== undefined) {
            cleaned[key] = sanitizeFirebaseData(value);
        }
    });
    return cleaned;
}

function normalizeSearchValue(value: unknown) {
    return (value ?? "")
        .toString()
        .toLocaleLowerCase("az-AZ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ə/g, "e")
        .replace(/ı/g, "i")
        .replace(/ö/g, "o")
        .replace(/ü/g, "u")
        .replace(/ğ/g, "g")
        .replace(/ş/g, "s")
        .replace(/ç/g, "c")
        .trim()
        .replace(/\s+/g, " ");
}

function titleCaseSearchValue(value: string) {
    return value
        .split(" ")
        .filter(Boolean)
        .map(part => part.charAt(0).toLocaleUpperCase("az-AZ") + part.slice(1).toLocaleLowerCase("az-AZ"))
        .join(" ");
}

function uniqueSearchVariants(term: string) {
    const trimmed = term.trim();
    return Array.from(new Set([
        trimmed,
        trimmed.toUpperCase(),
        trimmed.toLocaleUpperCase("az-AZ"),
        trimmed.toLocaleLowerCase("az-AZ"),
        titleCaseSearchValue(trimmed)
    ].filter(Boolean)));
}

function addCustomerSearchMeta(data: any) {
    const details = data?.details || {};
    const values = [
        data?.customerCode,
        data?.fullName,
        details?.fin,
        details?.passportSeries,
        data?.createdBy,
        data?.assignedTo,
        data?.archiveAssignedTo
    ];

    return {
        searchText: values.map(normalizeSearchValue).filter(Boolean).join(" "),
        searchTokens: Array.from(new Set(values.flatMap(value =>
            normalizeSearchValue(value)
                .split(/[\s,.;:()/_-]+/)
                .filter(token => token.length >= 2)
        ))).slice(0, 80)
    };
}

function customerMatchesScope(customer: any, scope: CustomerPageOptions["scope"]) {
    if (scope === "active") return !customer.isArchived;
    if (scope === "archived") return !!customer.isArchived;
    if (scope === "archiveTasks") {
        const invoices = customer.details?.invoices || [];
        return invoices.some((inv: any) => inv?.archiveRequested || inv?.archiveUrl)
            || customer.process_status === "WAITING_FOR_ARCHIVE"
            || customer.process_status === "ARCHIVE_UPLOADED";
    }
    return true;
}

function customerMatchesTerm(customer: any, term: string) {
    if (!term.trim()) return true;
    const normalized = normalizeSearchValue(term);
    const haystack = [
        customer.id,
        customer.customerCode,
        customer.fullName,
        customer.createdBy,
        customer.assignedTo,
        customer.archiveAssignedTo,
        customer.details?.fin,
        customer.details?.passportSeries,
        customer.details?.phone,
        customer.details?.contractNumber,
        customer.searchText
    ].map(normalizeSearchValue).join(" ");

    const tokens = normalized.split(" ").filter(token => token.length >= 2);
    return haystack.includes(normalized) || (tokens.length > 0 && tokens.every(token => haystack.includes(token)));
}

function customerMatchesOptions(customer: any, options: CustomerPageOptions) {
    if (!customerMatchesScope(customer, options.scope || "all")) return false;
    if (options.assignedTo && customer.assignedTo !== options.assignedTo) return false;
    if (options.archiveAssignedTo && customer.archiveAssignedTo !== options.archiveAssignedTo) return false;
    if (options.createdBy && customer.createdBy !== options.createdBy) return false;
    if (options.status && customer.process_status !== options.status) return false;
    if (options.archiveTaskKey && !(customer.archiveFilterKeys || []).includes(options.archiveTaskKey)) return false;
    if (options.archivedCustomerKey && !(customer.archivedCustomerKeys || []).includes(options.archivedCustomerKey)) return false;
    if (!customerMatchesTerm(customer, options.searchTerm || "")) return false;

    if (options.startDate || options.endDate) {
        if (!customer.createdAt) return false;
        const created = new Date(customer.createdAt).getTime();
        if (!Number.isFinite(created)) return false;
        if (options.startDate) {
            const start = new Date(options.startDate);
            start.setHours(0, 0, 0, 0);
            if (created < start.getTime()) return false;
        }
        if (options.endDate) {
            const end = new Date(options.endDate);
            end.setHours(23, 59, 59, 999);
            if (created > end.getTime()) return false;
        }
    }

    return options.filter ? options.filter(customer) : true;
}

function snapshotToCustomers(querySnap: any) {
    return querySnap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
}

function parseArchiveTime(value: any) {
    if (!value) return 0;
    if (typeof value?.toDate === "function") return value.toDate().getTime();
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function getArchiveRequestTimeFromCustomer(customer: any) {
    const invoices = customer?.details?.invoices?.filter((inv: any) => inv?.archiveRequested || inv?.archiveUrl) || [];
    const invoiceTimes = invoices
        .map((inv: any) => parseArchiveTime(inv.archiveRequestedAt))
        .filter((time: number) => time > 0);

    if (invoiceTimes.length > 0) return Math.max(...invoiceTimes);

    const latestAction = customer?.statusHistory
        ?.filter((h: any) => h.action === "ARCHIVE_REQUEST" || h.action === "FILE_UPLOAD")
        ?.sort((a: any, b: any) => parseArchiveTime(b.timestamp) - parseArchiveTime(a.timestamp))[0];

    return latestAction ? parseArchiveTime(latestAction.timestamp) : 0;
}

function hasRecentArchiveAction(customer: any) {
    const invoices = customer?.details?.invoices?.filter((inv: any) => inv?.archiveRequested || inv?.archiveUrl) || [];
    return invoices.some((inv: any) => {
        if (inv.archiveRequestedAt) return parseArchiveTime(inv.archiveRequestedAt) >= ARCHIVE_REQUEST_CUTOFF;

        const latestAction = customer?.statusHistory
            ?.filter((h: any) => h.action === "ARCHIVE_REQUEST" || h.action === "FILE_UPLOAD")
            ?.sort((a: any, b: any) => parseArchiveTime(b.timestamp) - parseArchiveTime(a.timestamp))[0];

        return latestAction ? parseArchiveTime(latestAction.timestamp) >= ARCHIVE_REQUEST_CUTOFF : false;
    });
}

function getArchiveMeta(customer: any) {
    const invoices = customer?.details?.invoices?.filter((inv: any) => inv?.archiveRequested || inv?.archiveUrl) || [];
    const total = invoices.length;
    const done = invoices.filter((inv: any) => !!inv.archiveUrl).length;
    const requestTime = getArchiveRequestTimeFromCustomer(customer);
    const isVisibleArchiveTask = total > 0
        && requestTime >= ARCHIVE_REQUEST_CUTOFF
        && requestTime >= ARCHIVE_VISIBLE_CUTOFF
        && hasRecentArchiveAction(customer);
    const assignedTo = customer?.archiveAssignedTo || "";
    const isDone = isVisibleArchiveTask && total > 0 && done === total;
    const isPending = isVisibleArchiveTask && !!assignedTo && !isDone;
    const keys: string[] = [];

    if (isVisibleArchiveTask) {
        if (assignedTo) {
            keys.push("archive:all", `archive:${assignedTo}:all`);
            keys.push(isDone ? "archive:done" : "archive:pending");
            keys.push(isDone ? `archive:${assignedTo}:done` : `archive:${assignedTo}:pending`);
        } else {
            keys.push("archive:unassigned");
        }
    }

    return {
        archiveTaskActive: isVisibleArchiveTask,
        archiveTaskActiveCount: isVisibleArchiveTask ? 1 : 0,
        archiveTaskTime: requestTime || 0,
        archiveInvoiceTotal: isVisibleArchiveTask ? total : 0,
        archiveInvoiceDone: isVisibleArchiveTask ? done : 0,
        archiveIsDone: isDone,
        archiveIsPending: isPending,
        archiveFilterKeys: keys
    };
}

function getArchivedEffectiveStatus(customer: any) {
    const statusHistory = Array.isArray(customer?.statusHistory) ? customer.statusHistory : [];
    const hasCreateInHistory = statusHistory.some((h: any) => h?.action === "CREATE");
    const effectiveCount = statusHistory.length + (customer?.createdAt && !hasCreateInHistory ? 1 : 0);
    return effectiveCount < 2 ? "UNFINISHED_ARCHIVE" : (customer?.process_status || "INSPECTOR_ENTERED");
}

function getArchivedByUser(customer: any) {
    const statusHistory = Array.isArray(customer?.statusHistory) ? customer.statusHistory : [];
    return customer?.archivedBy || statusHistory.find((h: any) => h?.action === "ARCHIVE")?.user || "";
}

function getArchivedCustomerMeta(customer: any) {
    const isArchived = !!customer?.isArchived;
    const status = isArchived ? getArchivedEffectiveStatus(customer) : "";
    const assignedTo = customer?.assignedTo || "";
    const archiveAssignedTo = customer?.archiveAssignedTo || "";
    const archivedBy = isArchived ? getArchivedByUser(customer) : "";
    const keys: string[] = [];

    if (isArchived) {
        keys.push("archived:all", `archived:status:${status}`);

        if (assignedTo) {
            keys.push(`archived:executor:${assignedTo}`, `archived:executor:${assignedTo}:status:${status}`);
        }
        if (archiveAssignedTo) {
            keys.push(`archived:archiver:${archiveAssignedTo}`, `archived:archiver:${archiveAssignedTo}:status:${status}`);
        }
        if (archivedBy) {
            keys.push(`archived:admin:${archivedBy}`, `archived:admin:${archivedBy}:status:${status}`);
            if (assignedTo) {
                keys.push(
                    `archived:admin:${archivedBy}:executor:${assignedTo}`,
                    `archived:admin:${archivedBy}:executor:${assignedTo}:status:${status}`
                );
            }
        }
    }

    return {
        archivedCustomerActive: isArchived,
        archivedEffectiveStatus: status,
        archivedBy,
        archivedCustomerKeys: keys
    };
}

function emptyArchiveStats(): ArchiveTaskStats {
    return {
        all: { jobs: 0, invoices: 0 },
        unassigned: { jobs: 0, invoices: 0 },
        pending: { jobs: 0, invoices: 0 },
        done: { jobs: 0, invoices: 0 }
    };
}

function addArchiveStats(stats: ArchiveTaskStats, filter: ArchiveTaskFilter, customer: any) {
    const meta = getArchiveMeta(customer);
    if (!meta.archiveTaskActive) return;
    if (filter === "all" && !customer.archiveAssignedTo) return;
    if (filter === "unassigned" && customer.archiveAssignedTo) return;
    if (filter === "pending" && (!customer.archiveAssignedTo || meta.archiveIsDone)) return;
    if (filter === "done" && !meta.archiveIsDone) return;

    stats[filter].jobs += 1;
    stats[filter].invoices += meta.archiveInvoiceTotal;
}

async function getAggregateArchiveStats(userEmail?: string | null): Promise<ArchiveTaskStats> {
    const customersRef = collection(db, CUSTOMERS_COLLECTION);
    const stats = emptyArchiveStats();
    const assignedKey = userEmail ? `archive:${userEmail}:all` : "archive:all";
    const assignedSnapPromise = getDocs(query(customersRef, where("archiveFilterKeys", "array-contains", assignedKey)));
    const unassignedSnapPromise = userEmail
        ? Promise.resolve(null)
        : getDocs(query(customersRef, where("archiveFilterKeys", "array-contains", "archive:unassigned")));

    const [assignedSnap, unassignedSnap] = await Promise.all([assignedSnapPromise, unassignedSnapPromise]);

    assignedSnap.docs.forEach((snapDoc) => {
        const customer: any = snapDoc.data();
        const invoices = Number(customer.archiveInvoiceTotal || 0);

        stats.all.jobs += 1;
        stats.all.invoices += invoices;

        const bucket: ArchiveTaskFilter = customer.archiveIsDone ? "done" : "pending";
        stats[bucket].jobs += 1;
        stats[bucket].invoices += invoices;
    });

    unassignedSnap?.docs.forEach((snapDoc) => {
        const customer: any = snapDoc.data();
        stats.unassigned.jobs += 1;
        stats.unassigned.invoices += Number(customer.archiveInvoiceTotal || 0);
    });

    return stats;
}

async function getLegacyArchiveStats(userEmail?: string | null): Promise<ArchiveTaskStats> {
    const stats = emptyArchiveStats();
    const customersRef = collection(db, CUSTOMERS_COLLECTION);
    const archiveCandidateStatuses = [
        "ASSIGNED_BY_MANAGER",
        "FILLED_BY_ADMIN",
        "WAITING_FOR_ARCHIVE",
        "ARCHIVE_UPLOADED"
    ];

    const snap = await getDocs(query(
        customersRef,
        where("process_status", "in", archiveCandidateStatuses)
    ));

    snap.docs.forEach((snapDoc) => {
        const customer: any = { ...snapDoc.data(), id: snapDoc.id };
        if (userEmail && customer.archiveAssignedTo !== userEmail) return;
        addArchiveStats(stats, "all", customer);
        addArchiveStats(stats, "unassigned", customer);
        addArchiveStats(stats, "pending", customer);
        addArchiveStats(stats, "done", customer);
    });

    return stats;
}

export async function getArchiveTaskStats(userEmail?: string | null): Promise<ArchiveTaskStats> {
    try {
        const aggregateStats = await getAggregateArchiveStats(userEmail);
        const legacyStats = await getLegacyArchiveStats(userEmail);
        const merged = emptyArchiveStats();
        (["all", "unassigned", "pending", "done"] as ArchiveTaskFilter[]).forEach((filter) => {
            const aggregate = aggregateStats[filter];
            const legacy = legacyStats[filter];
            merged[filter] = legacy.jobs > aggregate.jobs ? legacy : aggregate;
        });
        return merged;
    } catch (e) {
        console.warn("archive stats fallback:", e);
        return getLegacyArchiveStats(userEmail);
    }
}

const DASHBOARD_STATUS_LABELS: Record<string, string> = {
    INSPECTOR_ENTERED: "Yeni daxil edildi",
    ASSIGNED_BY_MANAGER: "İcraata götürüldü",
    FILLED_BY_ADMIN: "Məlumatlar doldurulub",
    WAITING_FOR_ARCHIVE: "Arxivdən sənəd istənilib",
    ARCHIVE_UPLOADED: "Arxiv faylı əlavə olundu",
    COMPLETED: "Sənədlər tamamlandı",
    UNFINISHED_ARCHIVE: "Tamamlanmayan sənəd"
};

const DASHBOARD_STATUSES = [
    "INSPECTOR_ENTERED",
    "ASSIGNED_BY_MANAGER",
    "FILLED_BY_ADMIN",
    "WAITING_FOR_ARCHIVE",
    "ARCHIVE_UPLOADED",
    "COMPLETED",
    "UNFINISHED_ARCHIVE"
];

const DASHBOARD_ACTIVE_STATUSES = [
    "ASSIGNED_BY_MANAGER",
    "FILLED_BY_ADMIN",
    "WAITING_FOR_ARCHIVE",
    "ARCHIVE_UPLOADED",
    "COMPLETED"
];

async function countCustomersWithConstraints(constraints: QueryConstraint[]) {
    const customersRef = collection(db, CUSTOMERS_COLLECTION);
    const snap = await getCountFromServer(query(customersRef, ...constraints));
    return snap.data().count || 0;
}

export async function getCustomerDashboardStats(targetEmail?: string | null): Promise<CustomerDashboardStats> {
    const scoped = (constraints: QueryConstraint[]) => [
        ...(targetEmail ? [where("assignedTo", "==", targetEmail)] : []),
        ...constraints
    ];

    const [statusTotalsList, archivedStatusList, archivedFlagCount] = await Promise.all([
        Promise.all(DASHBOARD_STATUSES.map(status =>
            countCustomersWithConstraints(scoped([where("process_status", "==", status)]))
        )),
        Promise.all(DASHBOARD_STATUSES.map(status =>
            countCustomersWithConstraints(scoped([where("process_status", "==", status), where("isArchived", "==", true)]))
        )),
        countCustomersWithConstraints(scoped([where("isArchived", "==", true)]))
    ]);

    const statusTotals = DASHBOARD_STATUSES.reduce<Record<string, number>>((acc, status, index) => {
        acc[status] = statusTotalsList[index] || 0;
        return acc;
    }, {});
    const archivedByStatus = DASHBOARD_STATUSES.reduce<Record<string, number>>((acc, status, index) => {
        acc[status] = archivedStatusList[index] || 0;
        return acc;
    }, {});

    const activeBreakdown = DASHBOARD_ACTIVE_STATUSES
        .map(status => ({
            label: DASHBOARD_STATUS_LABELS[status],
            value: Math.max(0, (statusTotals[status] || 0) - (archivedByStatus[status] || 0))
        }))
        .filter(item => item.value > 0);

    const active = activeBreakdown.reduce((sum, item) => sum + item.value, 0);
    const newCount = Math.max(0, (statusTotals.INSPECTOR_ENTERED || 0) - (archivedByStatus.INSPECTOR_ENTERED || 0));
    const unfinishedArchived = Math.max(0, (statusTotals.UNFINISHED_ARCHIVE || 0) - (archivedByStatus.UNFINISHED_ARCHIVE || 0));
    const archived = archivedFlagCount + unfinishedArchived;
    const total = DASHBOARD_STATUSES.reduce((sum, status) => sum + (statusTotals[status] || 0), 0);

    const archivedBreakdown = [
        { label: "Arxiv işləri", value: archivedFlagCount },
        { label: DASHBOARD_STATUS_LABELS.UNFINISHED_ARCHIVE, value: unfinishedArchived }
    ].filter(item => item.value > 0);

    return {
        active,
        archived,
        total,
        unassigned: targetEmail ? 0 : newCount,
        isGlobal: !targetEmail,
        breakdown: {
            active: activeBreakdown,
            archived: archivedBreakdown,
            total: [
                { label: "Davam edən işlər", value: active },
                { label: DASHBOARD_STATUS_LABELS.INSPECTOR_ENTERED, value: newCount },
                { label: "Arxivə göndərilən", value: archived }
            ].filter(item => item.value > 0)
        }
    };
}

// Permissions Logic
export async function getRolePermissions(role: string) {
    try {
        const docRef = doc(db, PERMISSIONS_COLLECTION, role);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data().allowedPaths || [];
        }
    } catch (e) {
        console.error("getRolePermissions error:", e);
    }

    if (role === "SUPERADMIN") return AVAILABLE_PERMISSIONS.map((p: any) => p.id);
    if (role === "MANAGER") return ["page_customers", "page_archive_customers", "page_parameters", "page_users", "action_assignment", "page_letter_list", "page_analytics"];
    if (role === "INSPECTOR_LEAD") return ["page_inspector", "page_inspectors", "page_users"];
    if (role === "ADMIN") return ["page_customers", "page_archive_customers", "page_letter_list"];
    if (role === "INSPECTOR") return ["page_inspector"];
    if (role === "ARCHIVER") return ["page_archiver"];
    if (role === "ARCHIVE_MANAGER") return ["page_archiver", "page_archive_manager", "page_archive_customers", "page_users"];
    if (role === "DEP_HEAD") return ["page_customers", "page_analytics", "page_parameters", "page_letter_list"];
    if (role === "AUDIT_LEAD") return ["page_analytics", "page_audit_logs", "page_parameters", "page_users"];
    return []; // PENDING or others have no default permissions
}

export async function updateRolePermissions(role: string, paths: string[]) {
    const docRef = doc(db, PERMISSIONS_COLLECTION, role);
    return await setDoc(docRef, sanitizeFirebaseData({
        id: role,
        role,
        allowedPaths: paths,
        updatedAt: serverTimestamp()
    }), { merge: true });
}

// User Logic
export async function syncUser(user: { email: string; displayName?: string }) {
    const normalizedEmail = user.email.toLowerCase().trim();
    try {
        const userRef = doc(db, USERS_COLLECTION, normalizedEmail);
        const userSnap = await getDoc(userRef);

        let userDoc: any;
        if (userSnap.exists()) {
            userDoc = {
                ...userSnap.data(),
                lastLogin: new Date().toISOString(),
                displayName: userSnap.data().displayName || user.displayName || normalizedEmail.split('@')[0]
            };
            await updateDoc(userRef, sanitizeFirebaseData(userDoc));
        } else {
            const usersRef = collection(db, USERS_COLLECTION);
            const q = query(usersRef, limit(1));
            const querySnap = await getDocs(q);
            const isFirstUser = querySnap.empty;

            userDoc = {
                id: normalizedEmail,
                email: normalizedEmail,
                displayName: user.displayName || normalizedEmail.split('@')[0],
                role: isFirstUser ? "SUPERADMIN" : "PENDING",
                lastLogin: new Date().toISOString(),
                status: isFirstUser ? "ACTIVE" : "PENDING",
                permissions: []
            };
            await setDoc(userRef, sanitizeFirebaseData(userDoc));
        }

        if (!userDoc.permissions || userDoc.permissions.length === 0) {
            userDoc.permissions = await getRolePermissions(userDoc.role);
        }
        return userDoc;
    } catch (e) {
        console.error("syncUser error:", e);
        throw e;
    }
}

export async function getAllUsers() {
    try {
        const querySnap = await getDocs(collection(db, USERS_COLLECTION));
        return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("getAllUsers error:", e);
        return [];
    }
}

export async function updateUserRole(email: string, role: string, permissions?: string[], userEmail: string = "system") {
    try {
        const userRef = doc(db, USERS_COLLECTION, email);
        const finalPermissions = permissions || await getRolePermissions(role);
        await updateDoc(userRef, { role, permissions: finalPermissions });
        await addAuditLog("UPDATE_ROLE", `${email} rolü ${role} olaraq dəyişdirildi`, userEmail, "USER", { targetUser: email, newRole: role });
        return true;
    } catch (e) {
        console.error("updateUserRole error:", e);
        throw e;
    }
}

export async function updateUserData(email: string, data: any, userEmail: string = "system") {
    try {
        const userRef = doc(db, USERS_COLLECTION, email);
        await updateDoc(userRef, sanitizeFirebaseData({ ...data, updatedAt: serverTimestamp() }));
        return true;
    } catch (e) {
        console.error("updateUserData error:", e);
        throw e;
    }
}

export async function deleteUser(email: string, userEmail: string = "system") {
    try {
        const userRef = doc(db, USERS_COLLECTION, email);
        await deleteDoc(userRef);
        await addAuditLog("USER_DELETE", `${email} istifadəçisi silindi`, userEmail, "USER", { targetUser: email });
        return true;
    } catch (e) {
        console.error("deleteUser error:", e);
        throw e;
    }
}



// Customer Logic
export async function bulkAddCustomers(customers: any[], userEmail: string = "system") {
    try {
        const batch = writeBatch(db);
        const results = [];
        const timestamp = new Date().toISOString();
        for (const customer of customers) {
            const cleanCode = customer.customerCode?.toString().trim();
            const customerId = cleanCode || Math.random().toString(36).substring(7);
            const customerRef = doc(db, CUSTOMERS_COLLECTION, customerId);
            const data = {
                ...customer,
                customerCode: cleanCode,
                id: customerId,
                createdBy: userEmail,
                updatedAt: serverTimestamp(),
                statusHistory: [
                    {
                        label: "Müştəri qeydə alındı",
                        action: "CREATE",
                        timestamp,
                        user: userEmail
                    }
                ]
            };
            batch.set(customerRef, sanitizeFirebaseData({
                ...data,
                ...addCustomerSearchMeta(data),
                ...getArchiveMeta(data),
                ...getArchivedCustomerMeta(data)
            }), { merge: true });
            results.push(data);
        }
        await batch.commit();
        await addAuditLog("BULK_ADD", `Bulk əlavə: ${customers.length} müştəri sistemi daxil edildi`, userEmail, "CUSTOMER", { count: customers.length });
        return results;
    } catch (e) {
        console.error("bulkAddCustomers error:", e);
        throw e;
    }
}

export async function getCustomers() {
    try {
        const querySnap = await getDocs(collection(db, CUSTOMERS_COLLECTION));
        return querySnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    } catch (e) {
        return [];
    }
}

function buildCustomerWhereConstraints(options: CustomerPageOptions, includeDate = true): QueryConstraint[] {
    const constraints: QueryConstraint[] = [];

    if (options.scope === "archived" && !options.archivedCustomerKey) constraints.push(where("isArchived", "==", true));
    if (options.assignedTo) constraints.push(where("assignedTo", "==", options.assignedTo));
    if (options.archiveAssignedTo) constraints.push(where("archiveAssignedTo", "==", options.archiveAssignedTo));
    if (options.createdBy) constraints.push(where("createdBy", "==", options.createdBy));
    if (options.status) constraints.push(where("process_status", "==", options.status));
    if (options.archiveTaskKey) constraints.push(where("archiveFilterKeys", "array-contains", options.archiveTaskKey));
    if (options.archivedCustomerKey) constraints.push(where("archivedCustomerKeys", "array-contains", options.archivedCustomerKey));

    if (includeDate && options.startDate) {
        const start = new Date(options.startDate);
        start.setHours(0, 0, 0, 0);
        constraints.push(where("createdAt", ">=", start.toISOString()));
    }
    if (includeDate && options.endDate) {
        const end = new Date(options.endDate);
        end.setHours(23, 59, 59, 999);
        constraints.push(where("createdAt", "<=", end.toISOString()));
    }

    return constraints;
}

async function runCustomerQueryWithFallback(
    primaryConstraints: QueryConstraint[],
    fallbackConstraints: QueryConstraint[],
    minimalConstraints: QueryConstraint[]
) {
    const customersRef = collection(db, CUSTOMERS_COLLECTION);
    try {
        return await getDocs(query(customersRef, ...primaryConstraints));
    } catch (primaryError) {
        console.warn("customer query fallback:", primaryError);
        try {
            return await getDocs(query(customersRef, ...fallbackConstraints));
        } catch (fallbackError) {
            console.warn("customer query minimal fallback:", fallbackError);
            return await getDocs(query(customersRef, ...minimalConstraints));
        }
    }
}

async function getArchiveScopedSearchPage(options: CustomerPageOptions): Promise<CustomerPageResult> {
    const pageSize = options.pageSize || 25;
    const page = Math.max(1, options.page || 1);
    const needed = page * pageSize + 1;
    const scanLimit = Math.max(needed, options.searchScanLimit ?? 800);
    const customersRef = collection(db, CUSTOMERS_COLLECTION);
    const rows: any[] = [];
    let scanCursor: CustomerPageCursor = null;
    let readCount = 0;
    let reachedEnd = false;

    while (rows.length < needed && readCount < scanLimit) {
        const currentLimit = Math.min(100, scanLimit - readCount);
        const snap: any = await getDocs(query(
            customersRef,
            where("archiveFilterKeys", "array-contains", options.archiveTaskKey as string),
            orderBy(documentId()),
            ...(scanCursor ? [startAfter(scanCursor)] : []),
            limit(currentLimit)
        ));

        readCount += snap.docs.length;
        if (snap.empty) {
            reachedEnd = true;
            break;
        }

        snap.docs.forEach((snapDoc: QueryDocumentSnapshot<DocumentData>) => {
            const customer = { ...snapDoc.data(), id: snapDoc.id };
            if (customerMatchesOptions(customer, options)) rows.push(customer);
        });

        scanCursor = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < currentLimit) {
            reachedEnd = true;
            break;
        }
    }

    const sortedRows = rows.sort((a, b) =>
        new Date(b.archiveTaskTime || b.updatedAt || b.createdAt || 0).getTime()
        - new Date(a.archiveTaskTime || a.updatedAt || a.createdAt || 0).getTime()
    );
    const start = (page - 1) * pageSize;

    return {
        rows: sortedRows.slice(start, start + pageSize),
        cursor: null,
        hasMore: sortedRows.length > start + pageSize || (!reachedEnd && readCount >= scanLimit),
        searchMode: true,
        readCount
    };
}

async function getCustomerSearchPage(options: CustomerPageOptions): Promise<CustomerPageResult> {
    if (options.archiveTaskKey) {
        return getArchiveScopedSearchPage(options);
    }

    const pageSize = options.pageSize || 25;
    const page = Math.max(1, options.page || 1);
    const needed = page * pageSize + 1;
    const perQueryLimit = Math.min(Math.max(needed, pageSize + 1), options.maxReads || 125);
    const term = (options.searchTerm || "").trim();
    const variants = uniqueSearchVariants(term);
    const customersRef = collection(db, CUSTOMERS_COLLECTION);
    const byId = new Map<string, any>();
    let readCount = 0;
    let searchMayHaveMore = false;
    const scopedSearchKey = options.archivedCustomerKey
        ? { field: "archivedCustomerKeys", value: options.archivedCustomerKey }
        : null;
    const queryJobs: Promise<void>[] = [];

    const runAndMerge = async (constraints: QueryConstraint[]) => {
        try {
            const snap = await getDocs(query(customersRef, ...constraints));
            readCount += snap.docs.length;
            snapshotToCustomers(snap).forEach((customer: any) => {
                if (customerMatchesOptions(customer, options)) byId.set(customer.id, customer);
            });
        } catch (e) {
            console.warn("customer search query skipped:", e);
        }
    };

    const queueAndMerge = (constraints: QueryConstraint[]) => {
        queryJobs.push(runAndMerge(constraints));
    };

    const exactDocPromise = getCustomer(term).catch(() => null);

    const token = normalizeSearchValue(term).split(" ")[0];
    if (token.length >= 2) {
        queueAndMerge([
            where("searchTokens", "array-contains", token),
            limit(perQueryLimit)
        ]);
    }

    const exactCustomerCodeVariants = Array.from(new Set([
        term,
        term.trim(),
        term.toUpperCase(),
        term.toLocaleUpperCase("az-AZ"),
        /^\d+$/.test(term.trim()) ? Number(term.trim()) : null
    ].filter(value => value !== null && value !== "")));

    exactCustomerCodeVariants.forEach((value) => {
        queueAndMerge([
            where("customerCode", "==", value),
            limit(perQueryLimit)
        ]);
    });

    const upperTerm = term.toLocaleUpperCase("az-AZ");
    const isNumeric = /^\d+$/.test(term.replace(/\s+/g, ""));
    const looksLikeFinOrSeries = /^[A-Z0-9-]{5,}$/i.test(term.replace(/\s+/g, ""));
    const prefixFields = new Set<string>(["customerCode", "fullName"]);
    if (isNumeric || looksLikeFinOrSeries) {
        prefixFields.add("details.fin");
        prefixFields.add("details.passportSeries");
    }
    if (term.includes("@")) {
        prefixFields.add("createdBy");
        prefixFields.add("assignedTo");
        prefixFields.add("archiveAssignedTo");
    }

    for (const field of prefixFields) {
        const fieldVariants = field === "fullName" ? variants : variants.slice(0, 3);
        for (const variant of fieldVariants) {
            queueAndMerge([
                orderBy(field),
                startAt(variant),
                endAt(`${variant}\uf8ff`),
                limit(perQueryLimit)
            ]);
        }
    }

    for (const variant of [term, upperTerm].filter(Boolean)) {
        queueAndMerge([
            orderBy(documentId()),
            startAt(variant),
            endAt(`${variant}\uf8ff`),
            limit(perQueryLimit)
        ]);
    }

    await Promise.all(queryJobs);
    const exactDoc = await exactDocPromise;
    if (exactDoc && customerMatchesOptions(exactDoc, options)) {
        byId.set((exactDoc as any).id, exactDoc);
    }

    if (term.length >= 2 && byId.size < needed) {
        const scanLimit = Math.max(needed, options.searchScanLimit ?? 3000);
        let scanCursor: CustomerPageCursor = null;
        let scanned = 0;
        let scanReachedEnd = false;

        while (byId.size < needed && scanned < scanLimit) {
            const currentLimit = Math.min(250, scanLimit - scanned);
            const scanConstraints: QueryConstraint[] = [
                ...(scopedSearchKey ? [where(scopedSearchKey.field, "array-contains", scopedSearchKey.value)] : []),
                orderBy(documentId()),
                ...(scanCursor ? [startAfter(scanCursor)] : []),
                limit(currentLimit)
            ];

            const snap = await getDocs(query(customersRef, ...scanConstraints));
            readCount += snap.docs.length;
            scanned += snap.docs.length;

            if (snap.empty) {
                scanReachedEnd = true;
                break;
            }

            snap.docs.forEach((snapDoc: QueryDocumentSnapshot<DocumentData>) => {
                const customer = { ...snapDoc.data(), id: snapDoc.id };
                if (customerMatchesOptions(customer, options)) byId.set(customer.id, customer);
            });

            scanCursor = snap.docs[snap.docs.length - 1];
            if (snap.docs.length < currentLimit) {
                scanReachedEnd = true;
                break;
            }
        }

        searchMayHaveMore = byId.size < needed && !scanReachedEnd && scanned >= scanLimit;
    }

    const rows = Array.from(byId.values()).sort((a, b) =>
        new Date((options.scope === "archived" ? b.archivedAt : b.createdAt) || b.updatedAt || b.createdAt || 0).getTime()
        - new Date((options.scope === "archived" ? a.archivedAt : a.createdAt) || a.updatedAt || a.createdAt || 0).getTime()
    );
    const start = (page - 1) * pageSize;

    return {
        rows: rows.slice(start, start + pageSize),
        cursor: null,
        hasMore: rows.length > start + pageSize || searchMayHaveMore,
        searchMode: true,
        readCount
    };
}

export async function getCustomerPage(options: CustomerPageOptions = {}): Promise<CustomerPageResult> {
    const pageSize = options.pageSize || 25;
    const maxReads = Math.max(pageSize + 1, options.maxReads || pageSize * 6);

    if ((options.searchTerm || "").trim()) {
        return getCustomerSearchPage(options);
    }

    const whereConstraints = buildCustomerWhereConstraints(options);
    const fallbackWhereConstraints = buildCustomerWhereConstraints(options, false);
    const batchSize = Math.min(Math.max(pageSize + 1, 40), maxReads);
    let queryCursor = options.cursor || null;
    let resultCursor: CustomerPageCursor = options.cursor || null;
    let lastScannedCursor: CustomerPageCursor = options.cursor || null;
    const rows: any[] = [];
    let readCount = 0;
    let hasMore = false;
    let reachedCollectionEnd = false;

    while (rows.length <= pageSize && readCount < maxReads) {
        const remainingReads = Math.max(1, Math.min(batchSize, maxReads - readCount));
        const cursorConstraint = queryCursor ? [startAfter(queryCursor)] : [];
        const hasDateRange = !!(options.startDate || options.endDate);
        const orderedConstraints = hasDateRange
            ? [orderBy("createdAt", "desc")]
            : [orderBy(documentId())];
        const primaryConstraints = [
            ...whereConstraints,
            ...orderedConstraints,
            ...cursorConstraint,
            limit(remainingReads)
        ];
        const fallbackConstraints = [
            ...fallbackWhereConstraints,
            orderBy(documentId()),
            ...cursorConstraint,
            limit(remainingReads)
        ];
        const minimalConstraints = [
            orderBy(documentId()),
            ...cursorConstraint,
            limit(remainingReads)
        ];

        const snap = await runCustomerQueryWithFallback(primaryConstraints, fallbackConstraints, minimalConstraints);
        if (snap.empty) {
            reachedCollectionEnd = true;
            break;
        }

        readCount += snap.docs.length;
        let lastRawDoc: CustomerPageCursor = null;

        for (const snapDoc of snap.docs) {
            lastRawDoc = snapDoc;
            lastScannedCursor = snapDoc;
            const customer = { ...snapDoc.data(), id: snapDoc.id };
            if (!customerMatchesOptions(customer, options)) continue;

            if (rows.length < pageSize) {
                rows.push(customer);
                resultCursor = snapDoc;
            } else {
                hasMore = true;
                break;
            }
        }

        if (hasMore) break;
        if (snap.docs.length < remainingReads) {
            reachedCollectionEnd = true;
            break;
        }
        queryCursor = lastRawDoc;
    }

    if (!hasMore && !reachedCollectionEnd && lastScannedCursor && readCount >= maxReads) {
        hasMore = true;
        resultCursor = lastScannedCursor;
    }

    return {
        rows,
        cursor: resultCursor,
        hasMore,
        searchMode: false,
        readCount
    };
}

export async function getInspectorCustomers(email: string) {
    try {
        const q = query(collection(db, CUSTOMERS_COLLECTION), where("createdBy", "==", email));
        const querySnap = await getDocs(q);
        return querySnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    } catch (e) {
        return [];
    }
}

export async function deleteCustomer(id: string, userEmail: string = "system") {
    try {
        await deleteDoc(doc(db, CUSTOMERS_COLLECTION, id));
        await addAuditLog("DELETE", `Müştəri silindi`, userEmail, "CUSTOMER", { targetId: id });
        return true;
    } catch (e) {
        throw e;
    }
}

export async function getCustomer(id: string) {
    try {
        if (!id) return null;
        const cleanId = id.toString().trim();
        const docRef = doc(db, CUSTOMERS_COLLECTION, cleanId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };

        // If not found by ID, try querying by customerCode field as fallback
        return await findCustomerByCode(cleanId);
    } catch (e) {
        return null;
    }
}

/** 
 * Find a customer by the customerCode field (case insensitive/trimmed)
 */
export async function findCustomerByCode(code: string) {
    try {
        if (!code) return null;
        const cleanCode = code.trim();
        const q = query(
            collection(db, CUSTOMERS_COLLECTION),
            where("customerCode", "==", cleanCode),
            limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
            const d = snap.docs[0];
            return { id: d.id, ...d.data() };
        }
        return null;
    } catch (e) {
        return null;
    }
}

export async function updateCustomer(id: string, data: any, userEmail: string = "system") {
    try {
        const customerRef = doc(db, CUSTOMERS_COLLECTION, id);
        let resultData: any = null;

        await runTransaction(db, async (transaction: Transaction) => {
            const oldSnap = await transaction.get(customerRef);
            const oldData = oldSnap.exists() ? oldSnap.data() : null;

            // Maintain status history
            let statusHistory = [...(oldData?.statusHistory || [])];
            const timestamp = new Date().toISOString();

            if (!oldSnap.exists() && statusHistory.length === 0) {
                statusHistory.push({
                    label: "Müştəri qeydə alındı",
                    action: "CREATE",
                    timestamp,
                    user: userEmail
                });
            }

            // --- SMART MERGE FOR INVOICES ---
            // Crucial for preventing data loss when multiple users edit the same customer
            let mergedInvoices = [...(oldData?.details?.invoices || [])];
            const incomingInvoices = data.details?.invoices;

            if (incomingInvoices && Array.isArray(incomingInvoices)) {
                if (data._forceReplaceInvoices) {
                    // Dashboard is saving, we replace the list (allowing deletions)
                    mergedInvoices = incomingInvoices;
                } else {
                    // Partial or Archive update, we MERGE to prevent stale state from deleting data
                    incomingInvoices.forEach((newInv: any) => {
                        const idx = mergedInvoices.findIndex(i => i.id === newInv.id);
                        if (idx !== -1) {
                            mergedInvoices[idx] = { ...mergedInvoices[idx], ...newInv };
                        } else {
                            mergedInvoices.push(newInv);
                        }
                    });
                }
            }

            // Construct final data object for this update
            // We merge top-level data to support partial updates
            const cleanedData = {
                ...oldData,
                ...data,
                details: {
                    ...oldData?.details,
                    ...data.details,
                    invoices: mergedInvoices
                },
                statusHistory
            };

            let action = "UPDATE";
            let detail = `Müştəri məlumatı yeniləndi`;
            let category: "CUSTOMER" | "ARCHIVE" | "DOCUMENT" | "SYSTEM" | "USER" = "CUSTOMER";

            const oldFiles = oldData?.details?.invoices?.filter((i: any) => !!i.archiveUrl)?.length || 0;
            const newFiles = cleanedData.details?.invoices?.filter((i: any) => !!i.archiveUrl)?.length || 0;
            const oldReq = oldData?.details?.invoices?.filter((i: any) => (i as any).archiveRequested)?.length || 0;
            const newReq = cleanedData.details?.invoices?.filter((i: any) => (i as any).archiveRequested)?.length || 0;

            // --- ENHANCED AUDIT LOGGING ---
            const changes: string[] = [];
            const auditMeta: any = { targetId: id, targetName: data.fullName || oldData?.fullName };

            // 1. Core Fields
            const coreFields = ['fullName', 'customerCode', 'debtAmount', 'assignedTo', 'archiveAssignedTo', 'process_status', 'isArchived', 'store', 'courtName'];
            coreFields.forEach(f => {
                if (data[f] !== undefined && data[f] !== oldData?.[f]) {
                    changes.push(`${f}: ${oldData?.[f] || 'N/A'} -> ${data[f] || 'N/A'}`);
                    auditMeta[`old_${f}`] = oldData?.[f] || null;
                    auditMeta[`new_${f}`] = data[f] || null;
                }
            });

            // 2. Details Fields
            const detailsToTrack = ['fin', 'phone', 'address', 'actualAddress', 'totalPrice', 'paidAmount', 'totalUnpaid', 'fee', 'penalty', 'warningDate'];
            detailsToTrack.forEach(f => {
                if (data.details?.[f] !== undefined && data.details?.[f] !== oldData?.details?.[f]) {
                    changes.push(`details.${f}: ${oldData?.details?.[f] || 'N/A'} -> ${data.details?.[f] || 'N/A'}`);
                    auditMeta[`old_details_${f}`] = oldData?.details?.[f] || null;
                    auditMeta[`new_details_${f}`] = data.details?.[f] || null;
                }
            });

            // 3. ULTRA-DETAILED INVOICE COMPARISON
            const oldInvoices = oldData?.details?.invoices || [];
            const invoiceChanges: string[] = [];

            // Find Removed
            oldInvoices.forEach((oi: any) => {
                if (incomingInvoices && !mergedInvoices.some((ni: any) => ni.id === oi.id)) {
                    invoiceChanges.push(`SİLİNDİ: Faktura №${oi.invoiceNumber || 'N/A'} (ID: ${oi.id})`);
                }
            });

            // Find Added
            if (incomingInvoices) {
                incomingInvoices.forEach((ni: any) => {
                    if (!oldInvoices.some((oi: any) => oi.id === ni.id)) {
                        invoiceChanges.push(`ƏLAVƏ: Faktura №${ni.invoiceNumber || 'N/A'} (ID: ${ni.id})`);
                    }
                });

                // Find Modified
                incomingInvoices.forEach((ni: any) => {
                    const oi = oldInvoices.find((o: any) => o.id === ni.id);
                    if (oi && JSON.stringify(oi) !== JSON.stringify(ni)) {
                        const subChanges: string[] = [];
                        if (oi.invoiceNumber !== ni.invoiceNumber) subChanges.push(`Nömrə: ${oi.invoiceNumber || 'N/A'} -> ${ni.invoiceNumber || 'N/A'}`);
                        if (JSON.stringify(oi.orders) !== JSON.stringify(ni.orders)) subChanges.push(`Sifarişlər/Məbləğ dəyişdirildi`);
                        if (oi.archiveUrl !== ni.archiveUrl) subChanges.push(`Sənəd faylı yeniləndi`);

                        invoiceChanges.push(`REDAKTƏ: Faktura №${ni.invoiceNumber || 'N/A'} (${subChanges.join(', ')})`);
                    }
                });
            }

            if (invoiceChanges.length > 0) {
                changes.push(...invoiceChanges);
                auditMeta.oldInvoices = oldInvoices;
                auditMeta.newInvoices = mergedInvoices;
            }

            // --- ALWAYS PREPARE SNAPSHOT FOR AUDIT ---
            auditMeta.snapshot = cleanedData;
            auditMeta.changesCount = changes.length;
            auditMeta.changesList = changes;

            // Generic update log if fields changed
            if (changes.length > 0) {
                await addAuditLog("UPDATE", "Məlumatlar güncəlləndi: " + changes.join(' | '), userEmail, "CUSTOMER", auditMeta);
            }

            if (data.isArchived && !oldData?.isArchived) {
                action = "ARCHIVE";
                category = "ARCHIVE";
                detail = "Müştəri arxivə göndərildi";
                cleanedData.archivedAt = timestamp;
            } else if (oldData?.isArchived && !data.isArchived) {
                action = "RESTORE";
                category = "ARCHIVE";
                detail = "Müştəri arxivdən bərpa edildi";
            } else if (newFiles > oldFiles) {
                action = "FILE_UPLOAD";
                category = "ARCHIVE";
                detail = `Arxiv sənədi yükləndi (Cəmi: ${newFiles})`;
            } else if (oldFiles > newFiles) {
                action = "FILE_DELETE";
                category = "ARCHIVE";
                detail = "Arxiv sənədi silindi";
            } else if (newReq > oldReq) {
                action = "ARCHIVE_REQUEST";
                category = "ARCHIVE";
                detail = "Arxiv sənəd sorğusu göndərildi";
            } else if (data.details?.isWarningSent && !oldData?.details?.isWarningSent) {
                action = "WARNING_SENT";
                detail = "Xəbərdarlıq məktubu göndərildi";
                category = "DOCUMENT";
            } else if (data.process_status && oldData?.process_status !== data.process_status) {
                action = "STATUS_CHANGE";
                const statusLabels: any = {
                    'INSPECTOR_ENTERED': 'Müştəri qeydə alındı',
                    'ASSIGNED_BY_MANAGER': 'Müfəttiş təyin edildi',
                    'FILLED_BY_ADMIN': 'Məlumatlar dolduruldu',
                    'WAITING_FOR_ARCHIVE': 'Arxiv sorğusu göndərildi',
                    'ARCHIVE_UPLOADED': 'Arxiv sənədi yükləndi',
                    'COMPLETED': 'Arxiv Müştəri'
                };
                detail = statusLabels[data.process_status] || `Status dəyişdi: ${data.process_status}`;
            } else if (data.assignedTo && oldData?.assignedTo !== data.assignedTo) {
                action = "ASSIGN";
                detail = `Müfəttiş təyin edildi: ${data.assignedTo}`;
            } else if (data.archiveAssignedTo && oldData?.archiveAssignedTo !== data.archiveAssignedTo) {
                action = "ARCHIVE_ASSIGN";
                detail = `Arxivçi təyin edildi: ${data.archiveAssignedTo}`;
                category = "ARCHIVE";
            }

            if (action !== "UPDATE") {
                statusHistory.push({
                    label: detail,
                    action,
                    timestamp,
                    user: userEmail
                });
                cleanedData.statusHistory = statusHistory;
            }

            transaction.set(customerRef, sanitizeFirebaseData({
                ...cleanedData,
                ...addCustomerSearchMeta(cleanedData),
                ...getArchiveMeta(cleanedData),
                ...getArchivedCustomerMeta(cleanedData),
                updatedAt: serverTimestamp()
            }), { merge: true });

            if (action !== "UPDATE") {
                await addAuditLog(action, detail, userEmail, category, {
                    ...auditMeta,
                    oldStatus: oldData?.process_status,
                    newStatus: cleanedData.process_status
                });
            }

            resultData = cleanedData;
        });

        return resultData;
    } catch (e) {
        console.error("updateCustomer xətası:", e);
        throw e;
    }
}

// Audit & Global Settings
export async function addAuditLog(action: string, details: string, userEmail: string, category: "CUSTOMER" | "ARCHIVE" | "DOCUMENT" | "SYSTEM" | "USER" = "SYSTEM", metadata: any = {}) {
    try {
        const logRef = doc(collection(db, AUDIT_COLLECTION));
        await setDoc(logRef, {
            id: logRef.id,
            action,
            category,
            details,
            userEmail,
            metadata,
            createdAt: serverTimestamp()
        });
    } catch (e) { }
}

export async function logError(error: any, context: string = "CLIENT", userEmail: string = "anonymous") {
    try {
        const logRef = doc(collection(db, ERRORS_COLLECTION));
        await setDoc(logRef, sanitizeFirebaseData({
            id: logRef.id,
            message: error.message || String(error),
            stack: error.stack || null,
            context,
            userEmail,
            url: typeof window !== 'undefined' ? window.location.href : null,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            createdAt: serverTimestamp()
        }));
    } catch (e) {
        console.error("Critical: Could not log error to Firestore", e);
    }
}

export async function getAuditLogs(limitCount: number = 200) {
    try {
        const q = query(collection(db, AUDIT_COLLECTION), orderBy("createdAt", "desc"), limit(limitCount));
        const querySnap = await getDocs(q);
        return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        return [];
    }
}

export async function deleteAuditLogsBeforeDate(date: Date, userEmail: string = "system") {
    try {
        const q = query(collection(db, AUDIT_COLLECTION), where("createdAt", "<=", date));
        const querySnap = await getDocs(q);
        const docs = querySnap.docs;

        if (docs.length === 0) return 0;

        let deletedCount = 0;
        const batchSize = 500;
        for (let i = 0; i < docs.length; i += batchSize) {
            const batch = writeBatch(db);
            const chunk = docs.slice(i, i + batchSize);
            chunk.forEach(d => {
                batch.delete(d.ref);
                deletedCount++;
            });
            await batch.commit();
        }

        await addAuditLog("SYSTEM_CLEANUP", `${deletedCount} köhnə loq təmizləndi (Tarix <= ${date.toLocaleDateString()})`, userEmail, "SYSTEM");
        return deletedCount;
    } catch (e) {
        console.error("deleteAuditLogsBeforeDate error:", e);
        throw e;
    }
}

export async function getSystemErrors(limitCount: number = 100) {
    try {
        const q = query(collection(db, ERRORS_COLLECTION), orderBy("createdAt", "desc"), limit(limitCount));
        const querySnap = await getDocs(q);
        return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        return [];
    }
}

export async function getGlobalSettings() {
    try {
        const docSnap = await getDoc(doc(db, SETTINGS_COLLECTION, "current"));
        return docSnap.exists() ? docSnap.data() : null;
    } catch (e) { return null; }
}

export async function updateGlobalSettings(data: any, userEmail: string = "system") {
    try {
        await setDoc(doc(db, SETTINGS_COLLECTION, "current"), sanitizeFirebaseData({ ...data, updatedAt: serverTimestamp() }), { merge: true });
        await addAuditLog("SETTINGS_UPDATE", "Qlobal tənzimləmələr yeniləndi", userEmail, "SYSTEM", { company: data.companyName });
        return true;
    } catch (e) { throw e; }
}

// Court Logic
export async function getCourts() {
    try {
        const querySnap = await getDocs(collection(db, COURTS_COLLECTION));
        return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) { return []; }
}

export async function addCourt(courtData: any, userEmail: string = "system") {
    const docRef = doc(collection(db, COURTS_COLLECTION));
    const data = { ...courtData, id: docRef.id, createdAt: serverTimestamp() };
    await setDoc(docRef, sanitizeFirebaseData(data));
    await addAuditLog("COURT_ADD", `Yeni məhkəmə əlavə edildi: ${courtData.name}`, userEmail, "SYSTEM", { targetId: docRef.id });
    return data;
}

export async function updateCourt(id: string, courtData: any, userEmail: string = "system") {
    await updateDoc(doc(db, COURTS_COLLECTION, id), sanitizeFirebaseData({ ...courtData, updatedAt: serverTimestamp() }));
    await addAuditLog("COURT_UPDATE", `Məhkəmə məlumatı yeniləndi: ${courtData.name}`, userEmail, "SYSTEM", { targetId: id });
}

export async function deleteCourt(id: string, userEmail: string = "system") {
    await deleteDoc(doc(db, COURTS_COLLECTION, id));
    await addAuditLog("COURT_DELETE", "Məhkəmə silindi", userEmail, "SYSTEM", { targetId: id });
}

// Store Logic
export async function getStores() {
    try {
        const querySnap = await getDocs(collection(db, STORES_COLLECTION));
        return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) { return []; }
}

export async function addStore(name: string, userEmail: string = "system") {
    const docRef = doc(collection(db, STORES_COLLECTION));
    const data = { id: docRef.id, name, createdAt: serverTimestamp() };
    await setDoc(docRef, sanitizeFirebaseData(data));
    await addAuditLog("STORE_ADD", `Yeni mağaza əlavə edildi: ${name}`, userEmail, "SYSTEM", { targetId: docRef.id });
    return data;
}

export async function updateStore(id: string, name: string, userEmail: string = "system") {
    await updateDoc(doc(db, STORES_COLLECTION, id), sanitizeFirebaseData({ name, updatedAt: serverTimestamp() }));
    await addAuditLog("STORE_UPDATE", `Mağaza nömrəsi yeniləndi: ${name}`, userEmail, "SYSTEM", { targetId: id });
}

export async function deleteStore(id: string, userEmail: string = "system") {
    await deleteDoc(doc(db, STORES_COLLECTION, id));
    await addAuditLog("STORE_DELETE", "Mağaza silindi", userEmail, "SYSTEM", { targetId: id });
}

// Templates collection logic
export async function getTemplates() {
    try {
        const querySnap = await getDocs(collection(db, TEMPLATES_COLLECTION));
        return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) { return []; }
}

export async function addTemplate(data: any, userEmail: string = "system") {
    const docRef = doc(collection(db, TEMPLATES_COLLECTION));
    const finalData = { ...data, id: docRef.id, createdAt: serverTimestamp() };
    await setDoc(docRef, sanitizeFirebaseData(finalData));
    await addAuditLog("TEMPLATE_ADD", `Yeni şablon əlavə edildi: ${data.name}`, userEmail, "SYSTEM", { targetId: docRef.id });
    return docRef.id;
}

export async function deleteTemplate(id: string, userEmail: string = "system") {
    await deleteDoc(doc(db, TEMPLATES_COLLECTION, id));
    await addAuditLog("TEMPLATE_DELETE", "Şablon silindi", userEmail, "SYSTEM", { targetId: id });
}

export async function updateTemplate(id: string, data: any, userEmail: string = "system") {
    await updateDoc(doc(db, TEMPLATES_COLLECTION, id), sanitizeFirebaseData({ ...data, updatedAt: serverTimestamp() }));
    await addAuditLog("TEMPLATE_UPDATE", `Şablon yeniləndi: ${data.name}`, userEmail, "SYSTEM", { targetId: id });
}

/**
 * "Moves" a customer record to a new ID.
 * Creates a new document with the new ID/code and deletes the old one.
 */
export async function moveCustomer(oldId: string, newCode: string, userEmail: string) {
    try {
        const oldDocRef = doc(db, CUSTOMERS_COLLECTION, oldId);
        const docSnap = await getDoc(oldDocRef);
        if (!docSnap.exists()) throw new Error("Müştəri tapılmadı");

        const data = docSnap.data();
        const cleanNewCode = newCode.trim();
        const newDocRef = doc(db, CUSTOMERS_COLLECTION, cleanNewCode);

        // Check if new code already exists
        const checkNew = await getDoc(newDocRef);
        if (checkNew.exists()) throw new Error("Bu kodlu müştəri artıq mövcuddur");

        // Start a batch or just consecutive calls
        await setDoc(newDocRef, {
            ...data,
            id: cleanNewCode,
            customerCode: cleanNewCode,
            ...addCustomerSearchMeta({ ...data, id: cleanNewCode, customerCode: cleanNewCode }),
            ...getArchiveMeta({ ...data, id: cleanNewCode, customerCode: cleanNewCode }),
            ...getArchivedCustomerMeta({ ...data, id: cleanNewCode, customerCode: cleanNewCode }),
            updatedAt: serverTimestamp(),
            updatedBy: userEmail
        });

        await deleteDoc(oldDocRef);
        return true;
    } catch (e: any) {
        console.error("Move error:", e);
        throw e;
    }
}
