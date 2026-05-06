"use server";

import mysql from 'mysql2/promise';

const DEFAULT_MYSQL_URI = 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev';
const connectionString = process.env.MYSQL_URI || process.env.DATABASE_URL || DEFAULT_MYSQL_URI;

let pool: mysql.Pool;
const READ_CACHE_TTL_MS = Number(process.env.MYSQL_READ_CACHE_TTL_MS || 30000);
const readCache = new Map<string, { expiresAt: number; value?: any; promise?: Promise<any> }>();

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            uri: connectionString,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 100,
            connectTimeout: 10000,
            enableKeepAlive: true,
        });
    }
    return pool;
}

async function cachedRead<T>(key: string, loader: () => Promise<T>, ttlMs: number = READ_CACHE_TTL_MS): Promise<T> {
    const now = Date.now();
    const cached = readCache.get(key);
    if (cached && cached.expiresAt > now) {
        if (cached.promise) return cached.promise;
        return cached.value as T;
    }

    const promise = loader()
        .then((value) => {
            readCache.set(key, { value, expiresAt: Date.now() + ttlMs });
            return value;
        })
        .catch((error) => {
            readCache.delete(key);
            throw error;
        });

    readCache.set(key, { promise, expiresAt: now + ttlMs });
    return promise;
}

function invalidateReadCache(prefix?: string) {
    if (!prefix) {
        readCache.clear();
        return;
    }

    for (const key of readCache.keys()) {
        if (key.startsWith(prefix)) readCache.delete(key);
    }
}

function parseJsonFields(row: any, fields: string[]) {
    if (!row) return row;
    const parsed = { ...row };
    for (const field of fields) {
        if (typeof parsed[field] === 'string') {
            try {
                parsed[field] = JSON.parse(parsed[field]);
            } catch (e) {
                // Ignore parse errors, leave as string
            }
        }
    }
    return parsed;
}

function stringifyJsonFields(data: any, fields: string[]) {
    if (!data) return data;
    const strData = { ...data };
    for (const field of fields) {
        if (strData[field] !== undefined && typeof strData[field] !== 'string') {
            strData[field] = JSON.stringify(strData[field]);
        }
    }
    return strData;
}

function parseJsonValue(value: any) {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function mergePreferPresent(base: any, overlay: any) {
    const merged = { ...(base || {}) };
    for (const [key, value] of Object.entries(overlay || {})) {
        if (value !== undefined && value !== null) {
            merged[key] = value;
        }
    }
    return merged;
}

let invoiceSchemaReady: Promise<void> | null = null;
let customerSchemaReady: Promise<void> | null = null;

async function ensureCustomerSchema() {
    if (!customerSchemaReady) {
        customerSchemaReady = (async () => {
            const [customerCols] = await getPool().query('DESCRIBE Customers') as any;
            const customerColNames = new Set(customerCols.map((c: any) => c.Field));
            if (!customerColNames.has('document_data')) {
                await getPool().query('ALTER TABLE Customers ADD COLUMN `document_data` JSON NULL');
            }
        })();
    }
    return customerSchemaReady;
}

async function ensureInvoiceSchema() {
    if (!invoiceSchemaReady) {
        invoiceSchemaReady = (async () => {
            const [invoiceCols] = await getPool().query('DESCRIBE CustomerInvoices') as any;
            const invColNames = new Set(invoiceCols.map((c: any) => c.Field));
            const invoiceAdds = [];
            if (!invColNames.has('archiveStorageId')) invoiceAdds.push('ADD COLUMN `archiveStorageId` VARCHAR(255) NULL');
            if (!invColNames.has('exceptionProduct')) invoiceAdds.push('ADD COLUMN `exceptionProduct` TEXT NULL');
            if (!invColNames.has('exceptionProductQty')) invoiceAdds.push('ADD COLUMN `exceptionProductQty` VARCHAR(255) NULL');
            if (!invColNames.has('exceptionProducts')) invoiceAdds.push('ADD COLUMN `exceptionProducts` JSON NULL');
            if (!invColNames.has('document_data')) invoiceAdds.push('ADD COLUMN `document_data` JSON NULL');
            if (invoiceAdds.length > 0) {
                await getPool().query(`ALTER TABLE CustomerInvoices ${invoiceAdds.join(', ')}`);
            }

            const [orderCols] = await getPool().query('DESCRIBE InvoiceOrders') as any;
            const orderColNames = new Set(orderCols.map((c: any) => c.Field));
            if (!orderColNames.has('document_data')) {
                await getPool().query('ALTER TABLE InvoiceOrders ADD COLUMN `document_data` JSON NULL');
            }
        })();
    }
    return invoiceSchemaReady;
}

// Ensure boolean string parsing (e.g. "1" to true)
function parseBooleans(row: any, fields: string[]) {
    if (!row) return row;
    const parsed = { ...row };
    for (const field of fields) {
        if (parsed[field] === '1' || parsed[field] === 1 || parsed[field] === 'true' || parsed[field] === true) {
            parsed[field] = true;
        } else if (parsed[field] === '0' || parsed[field] === 0 || parsed[field] === 'false' || parsed[field] === false) {
            parsed[field] = false;
        } else if (parsed[field] === 'undefined') {
             parsed[field] = false;
        }
    }
    return parsed;
}

// --- Permissions ---
export async function mysqlGetRolePermissions(role: string) {
    return cachedRead(`permissions:${role}`, async () => {
        const [rows] = await getPool().query('SELECT allowedPaths FROM Permissions WHERE id = ?', [role]) as any;
        if (rows.length > 0) {
            return parseJsonFields(rows[0], ['allowedPaths']).allowedPaths || [];
        }
        // Fallbacks identical to firebase
        if (role === "SUPERADMIN") return [/* all from format but firebase logic handles this if we return default */]; 
        return null; // Return null to let the caller handle defaults
    }, 60000);
}

export async function mysqlUpdateRolePermissions(role: string, paths: string[]) {
    const id = role;
    const allowedPaths = JSON.stringify(paths);
    const updatedAt = new Date().toISOString();
    await getPool().query(
        'INSERT INTO Permissions (id, role, allowedPaths, updatedAt) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE allowedPaths = ?, updatedAt = ?',
        [id, role, allowedPaths, updatedAt, allowedPaths, updatedAt]
    );
    invalidateReadCache('permissions:');
    return true;
}

// --- Users ---
export async function mysqlSyncUser(user: { email: string; displayName?: string }) {
    const normalizedEmail = user.email.toLowerCase().trim();
    const [rows] = await getPool().query('SELECT * FROM Users WHERE id = ?', [normalizedEmail]) as any;
    
    let userDoc: any;
    const now = new Date().toISOString();

    if (rows.length > 0) {
        userDoc = parseJsonFields(rows[0], ['permissions']);
        userDoc.lastLogin = now;
        userDoc.displayName = userDoc.displayName || user.displayName || normalizedEmail.split('@')[0];
        
        await getPool().query(
            'UPDATE Users SET lastLogin = ?, displayName = ? WHERE id = ?',
            [userDoc.lastLogin, userDoc.displayName, normalizedEmail]
        );
    } else {
        const [allUsers] = await getPool().query('SELECT id FROM Users LIMIT 1') as any;
        const isFirstUser = allUsers.length === 0;

        userDoc = {
            id: normalizedEmail,
            email: normalizedEmail,
            displayName: user.displayName || normalizedEmail.split('@')[0],
            role: isFirstUser ? "SUPERADMIN" : "PENDING",
            lastLogin: now,
            status: isFirstUser ? "ACTIVE" : "PENDING",
            permissions: []
        };
        
        await getPool().query(
            'INSERT INTO Users (id, email, displayName, role, lastLogin, status, permissions) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userDoc.id, userDoc.email, userDoc.displayName, userDoc.role, userDoc.lastLogin, userDoc.status, JSON.stringify(userDoc.permissions)]
        );
    }
    invalidateReadCache('users');
    return userDoc;
}

export async function mysqlGetAllUsers() {
    return cachedRead('users:all', async () => {
        const [rows] = await getPool().query('SELECT * FROM Users') as any;
        return rows.map((r: any) => parseJsonFields(r, ['permissions']));
    });
}

export async function mysqlUpdateUserRole(email: string, role: string, permissions: string[] | null) {
    const permsStr = permissions ? JSON.stringify(permissions) : '[]'; // Simplified, caller should provide
    await getPool().query('UPDATE Users SET role = ?, permissions = ? WHERE id = ?', [role, permsStr, email]);
    invalidateReadCache('users');
    return true;
}

export async function mysqlUpdateUserData(email: string, data: any) {
    const updates = [];
    const values = [];
    for (const [key, value] of Object.entries(data)) {
        if (key === 'permissions') {
            updates.push(`\`${key}\` = ?`);
            values.push(JSON.stringify(value));
        } else {
            updates.push(`\`${key}\` = ?`);
            values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        }
    }
    if (updates.length > 0) {
        updates.push(`\`updatedAt\` = ?`);
        values.push(new Date().toISOString());
        values.push(email);
        await getPool().query(`UPDATE Users SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    invalidateReadCache('users');
    return true;
}

export async function mysqlDeleteUser(email: string) {
    await getPool().query('DELETE FROM Users WHERE id = ?', [email]);
    invalidateReadCache('users');
    return true;
}

const CUSTOMER_COLUMNS = [
    'id', 'createdBy', 'customerCode', 'fullName', 'updatedAt', 
    '_forceReplaceInvoices', 'assignedAt', 'assignedTo', 'fullData', 
    'store', 'courtName', 'debtAmount', 'printedAt', 'process_status', 
    'details', 'archivedAt', 'statusHistory', 'isArchived', 'createdAt', 
    'archiveAssignedTo', '_isArchivePart', 'archiveAssignedAt', 'updatedBy',
    'executorName', 'gender', 'phone', 'fin', 'birthDate', 'passportSeries', 
    'actualAddress', 'address', 'fee', 'contractNumber', 'paidAmount', 
    'contractDate', 'monthlyPayment', 'productDescription', 'isWarningSent', 
    'warningDate', 'initialPayment', 'unpaidAmount', 'totalPrice', 
    'totalUnpaid', 'penalty', 'discountAmount', 'paymentPeriod', 'courtFee', 
    'phoneCount', 'document_data'
];

function buildCustomerDocumentData(customer: any) {
    const existing = parseJsonValue(customer?.document_data);
    const documentData: any = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};

    for (const [key, value] of Object.entries(customer || {})) {
        if (key === 'document_data' || value === undefined) continue;

        if (key === 'details') {
            const existingDetails = documentData.details && typeof documentData.details === 'object' && !Array.isArray(documentData.details)
                ? documentData.details
                : {};
            const incomingDetails = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
            documentData.details = { ...existingDetails, ...incomingDetails };
        } else {
            documentData[key] = value;
        }
    }

    return JSON.stringify(documentData);
}

function parseCustomer(row: any) {
    const rawDocument = parseJsonValue(row?.document_data);
    let parsed = parseJsonFields(mergePreferPresent(rawDocument && typeof rawDocument === 'object' && !Array.isArray(rawDocument) ? rawDocument : {}, row), ['details', 'statusHistory']);
    delete parsed.document_data;
    parsed = parseBooleans(parsed, ['isArchived', 'fullData', '_forceReplaceInvoices', '_isArchivePart', 'isWarningSent']);
    
    // Ensure all root columns are available in details for frontend backward compatibility
    if (!parsed.details) parsed.details = {};
    CUSTOMER_COLUMNS.forEach(col => {
        if (col !== 'details' && col !== 'statusHistory' && col !== 'document_data' && parsed[col] !== undefined && parsed[col] !== null) {
            parsed.details[col] = parsed[col];
        }
    });

    // Cast some specific fields back to numbers if present
    const numFields = ['phoneCount', 'totalUnpaid', 'penalty', 'discountAmount', 'paidAmount', 'totalPrice', 'monthlyPayment', 'initialPayment', 'fee', 'courtFee', 'debtAmount'];
    for (const nf of numFields) {
        if (parsed[nf] !== undefined && parsed[nf] !== null && parsed[nf] !== '') {
            parsed[nf] = Number(parsed[nf]);
        }
        if (parsed.details && parsed.details[nf] !== undefined && parsed.details[nf] !== null && parsed.details[nf] !== '') {
            parsed.details[nf] = Number(parsed.details[nf]);
        }
    }

    if (parsed.details && parsed.details.isWarningSent !== undefined) {
        parsed.details.isWarningSent = parsed.details.isWarningSent === '1' || parsed.details.isWarningSent === 1 || parsed.details.isWarningSent === 'true' || parsed.details.isWarningSent === true;
    }

    return parsed;
}

export type CustomerListMode = "dashboard" | "archived" | "archive-tasks";

export type CustomerListOptions = {
    mode: CustomerListMode;
    page?: number;
    pageSize?: number;
    search?: string;
    currentUserEmail?: string;
    currentUserRole?: string;
    statusFilter?: string;
    warningFilter?: string;
    invoiceCount?: string;
    invoiceMode?: string;
    executorFilter?: string;
    startDate?: string;
    endDate?: string;
    archiveFilter?: "all" | "pending" | "done" | "unassigned";
    selectedArchiverEmail?: string | null;
};

export type CustomerListResult = {
    rows: any[];
    total: number;
    page: number;
    pageSize: number;
    stats?: any;
};

const MAX_CUSTOMER_PAGE_SIZE = 500;
const DASHBOARD_MANAGER_ROLES = new Set(["SUPERADMIN", "MANAGER", "INSPECTOR_LEAD", "DEP_HEAD"]);
const ARCHIVE_MANAGER_ROLES = new Set(["ARCHIVE_MANAGER", "SUPERADMIN", "MANAGER", "DEP_HEAD"]);
const ARCHIVE_TASK_CUTOFF_SQL = "2026-04-17 00:00:00";

function clampCustomerPage(options: CustomerListOptions) {
    const page = Math.max(1, Number(options.page || 1));
    const requestedPageSize = Number(options.pageSize || 50);
    const pageSize = Math.min(MAX_CUSTOMER_PAGE_SIZE, Math.max(1, requestedPageSize));
    const offset = (page - 1) * pageSize;
    return { page, pageSize, offset };
}

function truthySql(column: string) {
    return `(${column} = 1 OR ${column} = '1' OR ${column} = 'true' OR ${column} = TRUE)`;
}

function falsySql(column: string) {
    return `(${column} IS NULL OR ${column} = 0 OR ${column} = '0' OR ${column} = 'false' OR ${column} = FALSE OR ${column} = '')`;
}

function emptySql(column: string) {
    return `(${column} IS NULL OR ${column} = '')`;
}

function notEmptySql(column: string) {
    return `(${column} IS NOT NULL AND ${column} <> '')`;
}

function normalizeRole(role?: string) {
    return (role || "").toUpperCase();
}

function normalizeEmail(email?: string) {
    return (email || "").toLowerCase().trim();
}

function addSearchFilter(where: string[], params: any[], search?: string) {
    const normalized = (search || "").trim();
    if (!normalized) return;
    const like = `%${normalized}%`;
    where.push(`(
        COALESCE(c.fullName, '') LIKE ?
        OR COALESCE(c.customerCode, '') LIKE ?
        OR COALESCE(c.fin, '') LIKE ?
        OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(c.document_data, '$.details.fin')), '') LIKE ?
        OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(c.document_data, '$.fin')), '') LIKE ?
    )`);
    params.push(like, like, like, like, like);
}

function invoiceCountSql() {
    return `(SELECT COUNT(*) FROM CustomerInvoices ci WHERE ci.customerId = c.id)`;
}

function archiveInvoiceTotalSql(alias = "c") {
    return `(SELECT COUNT(*) FROM CustomerInvoices ci WHERE ci.customerId = ${alias}.id AND (ci.archiveRequested = 1 OR ci.archiveRequested = TRUE OR ci.archiveUrl IS NOT NULL AND ci.archiveUrl <> ''))`;
}

function archiveInvoiceDoneSql(alias = "c") {
    return `(SELECT COUNT(*) FROM CustomerInvoices ci WHERE ci.customerId = ${alias}.id AND (ci.archiveRequested = 1 OR ci.archiveRequested = TRUE OR ci.archiveUrl IS NOT NULL AND ci.archiveUrl <> '') AND ci.archiveUrl IS NOT NULL AND ci.archiveUrl <> '')`;
}

function archiveTaskActivitySql() {
    return `EXISTS (
        SELECT 1
        FROM CustomerInvoices ci
        WHERE ci.customerId = c.id
          AND (ci.archiveRequested = 1 OR ci.archiveRequested = TRUE OR ci.archiveUrl IS NOT NULL AND ci.archiveUrl <> '')
          AND (
              ci.archiveRequestedAt >= ?
              OR (ci.archiveRequestedAt IS NULL AND c.updatedAt >= ?)
              OR (ci.archiveRequestedAt IS NULL AND c.archivedAt >= ?)
          )
    )`;
}

async function queryCustomersWithInvoices(where: string[], params: any[], orderBy: string, pageSize: number, offset: number) {
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const [rows] = await getPool().query(
        `SELECT c.* FROM Customers c ${whereSql} ${orderBy} LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    ) as any;
    const customers = rows.map(parseCustomer);
    return await attachInvoicesToCustomers(customers);
}

async function queryCustomerCount(where: string[], params: any[]) {
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const [rows] = await getPool().query(
        `SELECT COUNT(*) AS total FROM Customers c ${whereSql}`,
        params
    ) as any;
    return Number(rows?.[0]?.total || 0);
}

function buildDashboardWhere(options: CustomerListOptions, includeUiFilters = true) {
    const where: string[] = ["c.id IS NOT NULL"];
    const params: any[] = [];
    const role = normalizeRole(options.currentUserRole);
    const email = normalizeEmail(options.currentUserEmail);
    const isManager = DASHBOARD_MANAGER_ROLES.has(role);

    if (!isManager && email) {
        where.push(`(
            c.assignedTo = ?
            OR (? = 'ADMIN' AND c.process_status = 'UNFINISHED_ARCHIVE' AND ${emptySql("c.assignedTo")})
        )`);
        params.push(email, role);
    }

    if (includeUiFilters) {
        if (options.statusFilter !== "UNFINISHED_ARCHIVE") {
            where.push(falsySql("c.isArchived"));
        }

        addSearchFilter(where, params, options.search);

        if (options.warningFilter === "sent") {
            where.push(truthySql("c.isWarningSent"));
        } else if (options.warningFilter === "unsent") {
            where.push(falsySql("c.isWarningSent"));
        } else if (options.warningFilter === "overdue") {
            where.push(`${truthySql("c.isWarningSent")} AND STR_TO_DATE(c.warningDate, '%d.%m.%Y') < DATE_SUB(CURDATE(), INTERVAL 5 DAY)`);
        }

        if (options.invoiceMode && options.invoiceMode !== "all" && options.invoiceCount) {
            const target = Number(options.invoiceCount);
            if (!Number.isNaN(target)) {
                const countExpr = invoiceCountSql();
                if (options.invoiceMode === "exact") where.push(`${countExpr} = ?`);
                else if (options.invoiceMode === "min") where.push(`${countExpr} >= ?`);
                else if (options.invoiceMode === "max") where.push(`${countExpr} <= ?`);
                params.push(target);
            }
        }

        if (options.statusFilter && options.statusFilter !== "all") {
            where.push("c.process_status = ?");
            params.push(options.statusFilter);
        }

        if (options.executorFilter && options.executorFilter !== "all") {
            where.push("c.assignedTo = ?");
            params.push(options.executorFilter);
        }
    }

    return { where, params };
}

function buildDashboardStatsWhere(options: CustomerListOptions) {
    const where: string[] = ["c.id IS NOT NULL"];
    const params: any[] = [];
    const role = normalizeRole(options.currentUserRole);
    const email = normalizeEmail(options.currentUserEmail);
    const isManager = DASHBOARD_MANAGER_ROLES.has(role);
    const targetEmail = options.executorFilter && options.executorFilter !== "all"
        ? options.executorFilter
        : (isManager ? "" : email);

    if (targetEmail) {
        where.push("c.assignedTo = ?");
        params.push(targetEmail);
    }

    return { where, params, isGlobal: !targetEmail };
}

async function getDashboardStats(options: CustomerListOptions) {
    const { where, params, isGlobal } = buildDashboardStatsWhere(options);
    const whereSql = `WHERE ${where.join(" AND ")}`;
    const notArchived = falsySql("c.isArchived");
    const archived = `(${truthySql("c.isArchived")} OR c.process_status = 'UNFINISHED_ARCHIVE')`;

    const countExtra = async (extra: string, extraParams: any[] = []) => {
        const [rows] = await getPool().query(
            `SELECT COUNT(*) AS total FROM Customers c ${whereSql} AND ${extra}`,
            [...params, ...extraParams]
        ) as any;
        return Number(rows?.[0]?.total || 0);
    };

    const [active, archivedCount, total, unassigned, newRows] = await Promise.all([
        countExtra(`${notArchived} AND c.process_status <> 'UNFINISHED_ARCHIVE' AND c.process_status <> 'INSPECTOR_ENTERED'`),
        countExtra(archived),
        queryCustomerCount(where, params),
        countExtra(`${emptySql("c.assignedTo")} AND ${notArchived} AND c.process_status <> 'UNFINISHED_ARCHIVE'`),
        countExtra(`${notArchived} AND c.process_status <> 'UNFINISHED_ARCHIVE' AND c.process_status = 'INSPECTOR_ENTERED'`)
    ]);

    const [activeBreakdownRows] = await getPool().query(
        `SELECT COALESCE(c.process_status, 'Təyinat edilmiş') AS status, COUNT(*) AS value
         FROM Customers c
         ${whereSql}
           AND ${notArchived}
           AND c.process_status <> 'UNFINISHED_ARCHIVE'
           AND c.process_status <> 'INSPECTOR_ENTERED'
         GROUP BY c.process_status
         ORDER BY value DESC`,
        params
    ) as any;

    const archivedCompleted = await countExtra(`${archived} AND c.process_status <> 'UNFINISHED_ARCHIVE'`);
    const archivedUnfinished = await countExtra("c.process_status = 'UNFINISHED_ARCHIVE'");

    const [workloadRows] = await getPool().query(
        `SELECT c.assignedTo AS email, COUNT(*) AS count
         FROM Customers c
         WHERE ${notEmptySql("c.assignedTo")} AND ${falsySql("c.isArchived")}
         GROUP BY c.assignedTo`
    ) as any;

    const workload = (workloadRows || []).reduce((acc: Record<string, number>, row: any) => {
        if (row.email) acc[row.email] = Number(row.count || 0);
        return acc;
    }, {});

    return {
        active,
        archived: archivedCount,
        total,
        unassigned,
        isGlobal,
        workload,
        breakdown: {
            active: (activeBreakdownRows || []).map((row: any) => ({ status: row.status, value: Number(row.value || 0) })),
            archived: [
                { status: "COMPLETED", value: archivedCompleted },
                { status: "UNFINISHED_ARCHIVE", value: archivedUnfinished }
            ].filter(item => item.value > 0),
            total: [
                { status: "ACTIVE", value: active },
                { status: "INSPECTOR_ENTERED", value: newRows },
                { status: "ARCHIVED", value: archivedCount }
            ].filter(item => item.value > 0)
        }
    };
}

function buildArchiveTaskWhere(options: CustomerListOptions, includeUiFilters = true) {
    const where: string[] = [archiveTaskActivitySql()];
    const params: any[] = [ARCHIVE_TASK_CUTOFF_SQL, ARCHIVE_TASK_CUTOFF_SQL, ARCHIVE_TASK_CUTOFF_SQL];
    const role = normalizeRole(options.currentUserRole);
    const email = normalizeEmail(options.currentUserEmail);
    const isManager = ARCHIVE_MANAGER_ROLES.has(role);
    const totalExpr = archiveInvoiceTotalSql();
    const doneExpr = archiveInvoiceDoneSql();
    const doneCondition = `(${totalExpr} > 0 AND ${doneExpr} = ${totalExpr})`;

    if (!isManager && email) {
        where.push("c.archiveAssignedTo = ?");
        params.push(email);
    }

    if (includeUiFilters) {
        addSearchFilter(where, params, options.search);

        if (options.archiveFilter === "all") {
            where.push(notEmptySql("c.archiveAssignedTo"));
        } else if (options.archiveFilter === "unassigned") {
            where.push(emptySql("c.archiveAssignedTo"));
        } else if (options.archiveFilter === "pending") {
            where.push(`${notEmptySql("c.archiveAssignedTo")} AND NOT ${doneCondition}`);
        } else if (options.archiveFilter === "done") {
            where.push(doneCondition);
        }
    }

    return { where, params, isManager };
}

async function getArchiveFilterStat(baseWhere: string[], baseParams: any[], condition: string) {
    const totalExpr = archiveInvoiceTotalSql();
    const whereSql = `WHERE ${baseWhere.join(" AND ")} AND ${condition}`;
    const [rows] = await getPool().query(
        `SELECT COUNT(*) AS customerCount, COALESCE(SUM(${totalExpr}), 0) AS invoiceCount
         FROM Customers c
         ${whereSql}`,
        baseParams
    ) as any;
    const customerCount = Number(rows?.[0]?.customerCount || 0);
    const invoiceCount = Number(rows?.[0]?.invoiceCount || 0);
    return `${customerCount} iş / ${invoiceCount} faktura`;
}

async function getArchiveTaskStats(options: CustomerListOptions) {
    const { where, params } = buildArchiveTaskWhere({ ...options, search: "", archiveFilter: undefined }, false);
    const totalExpr = archiveInvoiceTotalSql();
    const doneExpr = archiveInvoiceDoneSql();
    const doneCondition = `(${totalExpr} > 0 AND ${doneExpr} = ${totalExpr})`;
    const assignedCondition = notEmptySql("c.archiveAssignedTo");
    const unassignedCondition = emptySql("c.archiveAssignedTo");

    const [filterStats, workloadRows, myRows, storeRows, overallRows] = await Promise.all([
        Promise.all([
            getArchiveFilterStat(where, params, assignedCondition),
            getArchiveFilterStat(where, params, unassignedCondition),
            getArchiveFilterStat(where, params, `${assignedCondition} AND NOT ${doneCondition}`),
            getArchiveFilterStat(where, params, doneCondition)
        ]),
        getPool().query(
            `SELECT
                c.archiveAssignedTo AS email,
                COUNT(*) AS customerCount,
                COALESCE(SUM(${totalExpr}), 0) AS invoiceCount,
                COALESCE(SUM(${doneExpr}), 0) AS invoiceDone,
                COALESCE(SUM(CASE WHEN ${doneCondition} THEN 1 ELSE 0 END), 0) AS customerDone
             FROM Customers c
             WHERE ${where.join(" AND ")} AND ${notEmptySql("c.archiveAssignedTo")}
             GROUP BY c.archiveAssignedTo`,
            params
        ),
        getPool().query(
            `SELECT
                COUNT(*) AS customerCount,
                COALESCE(SUM(CASE WHEN ${doneCondition} THEN 1 ELSE 0 END), 0) AS customersDone,
                COALESCE(SUM(${totalExpr}), 0) AS totalInvoices,
                COALESCE(SUM(${doneExpr}), 0) AS doneInvoices
             FROM Customers c
             WHERE ${where.join(" AND ")} AND c.archiveAssignedTo = ?`,
            [...params, normalizeEmail(options.currentUserEmail)]
        ),
        getPool().query(
            `SELECT
                COALESCE(NULLIF(c.store, ''), 'Seçilməyən Mağaza') AS name,
                COALESCE(SUM(${totalExpr}), 0) AS total,
                COALESCE(SUM(${doneExpr}), 0) AS done
             FROM Customers c
             WHERE ${where.join(" AND ")} ${options.selectedArchiverEmail ? "AND c.archiveAssignedTo = ?" : ""}
             GROUP BY COALESCE(NULLIF(c.store, ''), 'Seçilməyən Mağaza')
             ORDER BY total DESC
             LIMIT 4`,
            options.selectedArchiverEmail ? [...params, options.selectedArchiverEmail] : params
        ),
        getPool().query(
            `SELECT
                COUNT(*) AS totalCustomers,
                COALESCE(SUM(${totalExpr}), 0) AS totalInvoices,
                COALESCE(SUM(${doneExpr}), 0) AS doneInvoices,
                COALESCE(SUM(CASE WHEN NOT ${doneCondition} THEN 1 ELSE 0 END), 0) AS pendingCustomers
             FROM Customers c
             WHERE ${where.join(" AND ")} ${options.selectedArchiverEmail ? "AND c.archiveAssignedTo = ?" : ""}`,
            options.selectedArchiverEmail ? [...params, options.selectedArchiverEmail] : params
        )
    ]);

    const workloadsByEmail = ((workloadRows as any)[0] || []).reduce((acc: Record<string, any>, row: any) => {
        if (!row.email) return acc;
        acc[row.email] = {
            customerCount: Number(row.customerCount || 0),
            invoiceCount: Number(row.invoiceCount || 0),
            customerDone: Number(row.customerDone || 0),
            invoiceDone: Number(row.invoiceDone || 0)
        };
        return acc;
    }, {});

    const my = ((myRows as any)[0] || [])[0] || {};
    const totalInvoices = Number(my.totalInvoices || 0);
    const doneInvoices = Number(my.doneInvoices || 0);
    const overall = ((overallRows as any)[0] || [])[0] || {};
    const overallTotalInvoices = Number(overall.totalInvoices || 0);
    const overallDoneInvoices = Number(overall.doneInvoices || 0);

    const storeDist = (((storeRows as any)[0] || []) as any[]).map(row => ({
        name: row.name,
        total: Number(row.total || 0),
        done: Number(row.done || 0),
        rate: Number(row.total || 0) > 0 ? Math.round((Number(row.done || 0) / Number(row.total || 0)) * 100) : 0
    }));

    return {
        filterStats: {
            all: filterStats[0],
            unassigned: filterStats[1],
            pending: filterStats[2],
            done: filterStats[3]
        },
        workloadsByEmail,
        myStats: {
            customerCount: Number(my.customerCount || 0),
            customersDone: Number(my.customersDone || 0),
            totalInvoices,
            doneInvoices,
            pendingInvoices: totalInvoices - doneInvoices,
            completionRate: totalInvoices > 0 ? Math.round((doneInvoices / totalInvoices) * 100) : 0
        },
        overallStats: {
            totalCustomers: Number(overall.totalCustomers || 0),
            totalInvoices: overallTotalInvoices,
            doneInvoices: overallDoneInvoices,
            pendingInvoices: overallTotalInvoices - overallDoneInvoices,
            pendingCustomers: Number(overall.pendingCustomers || 0),
            completionRate: overallTotalInvoices > 0 ? Math.round((overallDoneInvoices / overallTotalInvoices) * 100) : 0,
            avgInvoices: Number(overall.totalCustomers || 0) > 0 ? (overallTotalInvoices / Number(overall.totalCustomers || 0)).toFixed(1) : "0",
            storeDist
        }
    };
}

function buildArchivedCustomersWhere(options: CustomerListOptions, includeUiFilters = true) {
    const where: string[] = [truthySql("c.isArchived")];
    const params: any[] = [];
    const role = normalizeRole(options.currentUserRole);
    const email = normalizeEmail(options.currentUserEmail);
    const isManager = ARCHIVE_MANAGER_ROLES.has(role);

    if (!isManager && role === "ARCHIVER" && email) {
        where.push("c.archiveAssignedTo = ?");
        params.push(email);
    } else if (!isManager && role === "ADMIN" && email) {
        where.push("(c.statusHistory LIKE ? AND c.statusHistory LIKE '%ARCHIVE%')");
        params.push(`%${email}%`);
    }

    if (includeUiFilters) {
        addSearchFilter(where, params, options.search);

        const dateExpr = "COALESCE(NULLIF(c.archivedAt, ''), NULLIF(c.createdAt, ''))";
        if (options.startDate) {
            where.push(`${dateExpr} >= ?`);
            params.push(`${options.startDate} 00:00:00`);
        }
        if (options.endDate) {
            where.push(`${dateExpr} <= ?`);
            params.push(`${options.endDate} 23:59:59`);
        }

        if (options.executorFilter && options.executorFilter !== "all") {
            where.push("c.assignedTo = ?");
            params.push(options.executorFilter);
        }

        if (options.statusFilter && options.statusFilter !== "all") {
            where.push("c.process_status = ?");
            params.push(options.statusFilter);
        }
    }

    return { where, params };
}

export async function mysqlGetCustomersPage(options: CustomerListOptions): Promise<CustomerListResult> {
    const normalizedOptions = {
        ...options,
        currentUserEmail: normalizeEmail(options.currentUserEmail),
        currentUserRole: normalizeRole(options.currentUserRole),
        search: (options.search || "").trim()
    };
    const { page, pageSize, offset } = clampCustomerPage(normalizedOptions);
    const cacheKey = `customers:page:${JSON.stringify({ ...normalizedOptions, page, pageSize })}`;

    return cachedRead(cacheKey, async () => {
        if (normalizedOptions.mode === "dashboard") {
            const { where, params } = buildDashboardWhere(normalizedOptions, true);
            const [rows, total, stats] = await Promise.all([
                queryCustomersWithInvoices(where, params, "ORDER BY COALESCE(c.createdAt, c.updatedAt) DESC", pageSize, offset),
                queryCustomerCount(where, params),
                getDashboardStats(normalizedOptions)
            ]);
            return { rows, total, page, pageSize, stats };
        }

        if (normalizedOptions.mode === "archive-tasks") {
            const { where, params } = buildArchiveTaskWhere(normalizedOptions, true);
            const [rows, total, stats] = await Promise.all([
                queryCustomersWithInvoices(where, params, "ORDER BY COALESCE(c.updatedAt, c.createdAt) DESC", pageSize, offset),
                queryCustomerCount(where, params),
                getArchiveTaskStats(normalizedOptions)
            ]);
            return { rows, total, page, pageSize, stats };
        }

        const { where, params } = buildArchivedCustomersWhere(normalizedOptions, true);
        const [rows, total] = await Promise.all([
            queryCustomersWithInvoices(where, params, "ORDER BY COALESCE(c.archivedAt, c.updatedAt, c.createdAt) DESC", pageSize, offset),
            queryCustomerCount(where, params)
        ]);
        return { rows, total, page, pageSize, stats: {} };
    });
}

async function attachInvoicesToCustomers(customers: any[]) {
    if (customers.length === 0) return customers;
    const customerIds = customers.map(c => c.id);
    const [invoices] = await getPool().query(`SELECT * FROM CustomerInvoices WHERE customerId IN (?)`, [customerIds]) as any;
    if (invoices.length === 0) {
        for (const c of customers) {
            if (!c.details) c.details = {};
            c.details.invoices = [];
        }
        return customers;
    }
    
    const invoiceIds = invoices.map((i: any) => i.id);
    const [orders] = await getPool().query(`SELECT * FROM InvoiceOrders WHERE invoiceId IN (?)`, [invoiceIds]) as any;

    const invoicesById: Record<string, any> = {};
    for (const row of invoices) {
        const raw = parseJsonValue(row.document_data);
        const inv = raw && typeof raw === 'object' && !Array.isArray(raw) ? mergePreferPresent(raw, row) : { ...row };
        inv.archiveRequested = inv.archiveRequested === 1 || inv.archiveRequested === true || inv.archiveRequested === 'true';
        inv.isException = inv.isException === 1 || inv.isException === true || inv.isException === 'true';
        inv.exceptionProducts = parseJsonValue(inv.exceptionProducts);
        delete inv.document_data;
        inv.orders = [];
        invoicesById[inv.id] = inv;
    }

    for (const row of orders) {
        const raw = parseJsonValue(row.document_data);
        const ord = raw && typeof raw === 'object' && !Array.isArray(raw) ? mergePreferPresent(raw, row) : { ...row };
        ord.hasImieFee = ord.hasImieFee === 1 || ord.hasImieFee === true || ord.hasImieFee === 'true';
        ord.checkedImeis = parseJsonValue(ord.checkedImeis);
        delete ord.document_data;
        // numeric conversions
        if (ord.phoneCount) ord.phoneCount = Number(ord.phoneCount);
        if (invoicesById[ord.invoiceId]) {
            invoicesById[ord.invoiceId].orders.push(ord);
        }
    }

    const customersById = new Map();
    for (const c of customers) {
        if (!c.details) c.details = {};
        c.details.invoices = [];
        customersById.set(c.id, c);
    }

    for (const inv of invoices) {
        const c = customersById.get(inv.customerId);
        if (c) {
            c.details.invoices.push(invoicesById[inv.id] || inv);
        }
    }

    return customers;
}

export async function mysqlGetCustomers() {
    return cachedRead('customers:all', async () => {
        const [rows] = await getPool().query('SELECT * FROM Customers') as any;
        const customers = rows.map(parseCustomer);
        return await attachInvoicesToCustomers(customers);
    });
}

export async function mysqlGetInspectorCustomers(email: string) {
    return cachedRead(`customers:inspector:${email}`, async () => {
        const [rows] = await getPool().query('SELECT * FROM Customers WHERE createdBy = ?', [email]) as any;
        const customers = rows.map(parseCustomer);
        return await attachInvoicesToCustomers(customers);
    });
}

export async function mysqlDeleteCustomer(id: string) {
    await getPool().query('DELETE FROM Customers WHERE id = ?', [id]);
    invalidateReadCache('customers:');
    return true;
}

export async function mysqlGetCustomer(id: string) {
    return cachedRead(`customers:id:${id}`, async () => {
        const [rows] = await getPool().query('SELECT * FROM Customers WHERE id = ?', [id]) as any;
        if (rows.length > 0) {
            const customers = await attachInvoicesToCustomers([parseCustomer(rows[0])]);
            return customers[0];
        }
        return null;
    });
}

export async function mysqlFindCustomerByCode(code: string) {
    return cachedRead(`customers:code:${code}`, async () => {
        const [rows] = await getPool().query('SELECT * FROM Customers WHERE customerCode = ? LIMIT 1', [code]) as any;
        if (rows.length > 0) {
            const customers = await attachInvoicesToCustomers([parseCustomer(rows[0])]);
            return customers[0];
        }
        return null;
    });
}

async function upsertCustomerInvoices(customerId: string, invoices: any[]) {
    await ensureInvoiceSchema();
    const conn = await getPool().getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM CustomerInvoices WHERE customerId = ?', [customerId]);

        if (invoices && Array.isArray(invoices) && invoices.length > 0) {
            for (const inv of invoices) {
                const invId = (inv.id && inv.id !== 'def') ? inv.id : Math.random().toString(36).substring(2, 9);
                await conn.query(`
                    INSERT INTO CustomerInvoices (
                        id, customerId, invoiceNumber, archiveUrl, archiveName, archiveBase64,
                        archiveStorageId,
                        archiveRequested, archiveRequestedAt, isException, exceptionDate,
                        exceptionInvoice, exceptionInvoiceDate, exceptionReturnedPrice, store,
                        exceptionProduct, exceptionProductQty, exceptionProducts, document_data
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    invId,
                    customerId,
                    inv.invoiceNumber || null,
                    inv.archiveUrl || null,
                    inv.archiveName || null,
                    inv.archiveBase64 || null,
                    inv.archiveStorageId || null,
                    inv.archiveRequested === true || inv.archiveRequested === 'true',
                    inv.archiveRequestedAt ? new Date(inv.archiveRequestedAt) : null,
                    inv.isException === true || inv.isException === 'true',
                    inv.exceptionDate || null,
                    inv.exceptionInvoice || null,
                    inv.exceptionInvoiceDate || null,
                    inv.exceptionReturnedPrice || null,
                    inv.store || null,
                    inv.exceptionProduct || null,
                    inv.exceptionProductQty || null,
                    inv.exceptionProducts ? JSON.stringify(inv.exceptionProducts) : null,
                    JSON.stringify(inv)
                ]);

                if (inv.orders && Array.isArray(inv.orders)) {
                    for (const ord of inv.orders) {
                        const ordId = (ord.id && ord.id !== 'o_def') ? ord.id : Math.random().toString(36).substring(2, 9);
                        await conn.query(`
                            INSERT INTO InvoiceOrders (
                                id, invoiceId, productDescription, paidAmount, initialPayment,
                                contractDate, phoneCount, monthlyPayment, totalPrice, paymentPeriod,
                                checkedImeis, hasImieFee, document_data
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            ordId,
                            invId,
                            ord.productDescription || null,
                            ord.paidAmount || null,
                            ord.initialPayment || null,
                            ord.contractDate || null,
                            Number(ord.phoneCount) || 0,
                            ord.monthlyPayment || null,
                            ord.totalPrice || null,
                            ord.paymentPeriod || null,
                            ord.checkedImeis ? JSON.stringify(ord.checkedImeis) : null,
                            ord.hasImieFee === true || ord.hasImieFee === 'true',
                            JSON.stringify(ord)
                        ]);
                    }
                }
            }
        }

        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

export async function mysqlAddCustomer(customer: any) {
    await ensureCustomerSchema();
    const customerData = { ...customer };
    customerData.document_data = buildCustomerDocumentData(customerData);
    let invoices = [];
    if (customerData.details) {
        if (customerData.details.invoices) {
            invoices = customerData.details.invoices;
            delete customerData.details.invoices;
        }
        CUSTOMER_COLUMNS.forEach(col => {
            if (col !== 'details' && col !== 'statusHistory' && col !== 'document_data' && customerData.details[col] !== undefined) {
                customerData[col] = customerData.details[col];
                delete customerData.details[col];
            }
        });
    }

    const data = stringifyJsonFields(customerData, ['details', 'statusHistory']);
    const keys = Object.keys(data).filter(k => CUSTOMER_COLUMNS.includes(k) && k !== 'createdAt' && k !== 'updatedAt');
    const cols = keys.map(k => `\`${k}\``).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(k => {
        if (typeof data[k] === 'boolean') return data[k] ? '1' : '0';
        return data[k] === undefined ? null : data[k];
    });

    const finalCols = cols ? cols + ', `createdAt`, `updatedAt`' : '`createdAt`, `updatedAt`';
    const finalPlaceholders = placeholders ? placeholders + ', ?, ?' : '?, ?';
    const createdAtVal = data.createdAt && typeof data.createdAt === 'string' && !data.createdAt.includes('serverTimestamp') ? data.createdAt : new Date().toISOString();
    const updatedAtVal = data.updatedAt && typeof data.updatedAt === 'string' && !data.updatedAt.includes('serverTimestamp') ? data.updatedAt : new Date().toISOString();
    values.push(createdAtVal, updatedAtVal);

    await getPool().query(`INSERT INTO Customers (${finalCols}) VALUES (${finalPlaceholders})`, values);
    
    if (invoices.length > 0) {
        await upsertCustomerInvoices(data.id, invoices);
    }
    
    invalidateReadCache('customers:');
    return true;
}

export async function mysqlUpdateCustomerRaw(id: string, customer: any) {
    await ensureCustomerSchema();
    const customerData = { ...customer };
    customerData.document_data = buildCustomerDocumentData(customerData);
    let invoices = null;
    if (customerData.details) {
        if (customerData.details.invoices) {
            invoices = customerData.details.invoices;
            delete customerData.details.invoices;
        }
        CUSTOMER_COLUMNS.forEach(col => {
            if (col !== 'details' && col !== 'statusHistory' && col !== 'document_data' && customerData.details[col] !== undefined) {
                customerData[col] = customerData.details[col];
                delete customerData.details[col]; // Clean up JSON blob
            }
        });
    }

    const data = stringifyJsonFields(customerData, ['details', 'statusHistory']);
    const keys = Object.keys(data).filter(k => k !== 'id' && CUSTOMER_COLUMNS.includes(k));
    const updates = keys.map(k => `\`${k}\` = ?`).join(', ');
    const values = keys.map(k => {
        if (k === 'updatedAt' || k === 'createdAt') {
            if (typeof data[k] === 'object' || (typeof data[k] === 'string' && data[k].includes('serverTimestamp'))) {
                return new Date().toISOString();
            }
        }
        if (typeof data[k] === 'boolean') return data[k] ? '1' : '0';
        return data[k] === undefined ? null : data[k];
    });
    values.push(id);

    await getPool().query(`UPDATE Customers SET ${updates} WHERE id = ?`, values);
    
    if (invoices !== null) {
        await upsertCustomerInvoices(id, invoices);
    }

    invalidateReadCache('customers:');
    return true;
}

// --- Audit & Others ---
export async function mysqlAddAuditLog(log: any) {
    const data = stringifyJsonFields(log, ['metadata']);
    
    // Ensure missing fields are explicitly defined as null if undefined
    const action = data.action ?? null;
    const category = data.category ?? null;
    const details = data.details ?? null;
    const userEmail = data.userEmail ?? null;
    const metadata = data.metadata ?? null;
    const createdAt = data.createdAt || new Date().toISOString();

    await getPool().query(
        'INSERT INTO AuditLogs (`id`, `action`, `category`, `details`, `userEmail`, `metadata`, `createdAt`) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [data.id, action, category, details, userEmail, metadata, createdAt]
    );
    invalidateReadCache('audit:');
    return true;
}

export async function mysqlGetAuditLogs(limitCount: number) {
    const safeLimit = Number(limitCount);
    return cachedRead(`audit:${safeLimit}`, async () => {
        const [rows] = await getPool().query(`SELECT * FROM AuditLogs ORDER BY createdAt DESC LIMIT ${safeLimit}`) as any;
        return rows.map((r: any) => parseJsonFields(r, ['metadata']));
    }, 15000);
}

export async function mysqlDeleteAuditLogsBeforeDate(dateStr: string) {
    const [result] = await getPool().query('DELETE FROM AuditLogs WHERE createdAt <= ?', [dateStr]) as any;
    invalidateReadCache('audit:');
    return result.affectedRows;
}

export async function mysqlLogError(errorData: any) {
    const id = errorData.id || Math.random().toString(36).substring(7);
    await getPool().query(
        'INSERT INTO SystemErrors (id, message, stack, context, userEmail, url, userAgent, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, errorData.message, errorData.stack, errorData.context, errorData.userEmail, errorData.url, errorData.userAgent, errorData.createdAt || new Date().toISOString()]
    );
    invalidateReadCache('errors:');
    return true;
}

export async function mysqlGetSystemErrors(limitCount: number) {
    const safeLimit = Number(limitCount);
    return cachedRead(`errors:${safeLimit}`, async () => {
        const [rows] = await getPool().query(`SELECT * FROM SystemErrors ORDER BY createdAt DESC LIMIT ${safeLimit}`) as any;
        return rows;
    }, 15000);
}

// --- Global Settings ---
export async function mysqlGetGlobalSettings() {
    return cachedRead('settings:current', async () => {
        const [rows] = await getPool().query('SELECT * FROM GlobalSettings WHERE id = "current"') as any;
        if (rows.length > 0) return rows[0];
        return null;
    }, 15000);
}

export async function mysqlUpdateGlobalSettings(data: any) {
    const keys = Object.keys(data).filter(k => k !== 'id');
    if (keys.length === 0) return true;
    
    // First ensure it exists
    const [rows] = await getPool().query('SELECT id FROM GlobalSettings WHERE id = "current"') as any;
    if (rows.length === 0) {
        await getPool().query('INSERT INTO GlobalSettings (id) VALUES ("current")');
    }

    const updates = keys.map(k => `\`${k}\` = ?`).join(', ');
    const values = keys.map(k => data[k]);
    values.push('current');

    await getPool().query(`UPDATE GlobalSettings SET ${updates} WHERE id = ?`, values);
    invalidateReadCache('settings:');
    return true;
}

// --- Courts, Stores, Templates ---
export async function mysqlGetCourts() {
    return cachedRead('courts:all', async () => {
        const [rows] = await getPool().query('SELECT * FROM Courts') as any;
        return rows;
    }, 30000);
}
export async function mysqlAddCourt(data: any) {
    await getPool().query('INSERT INTO Courts (id, name, address, phone, fax, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [data.id, data.name, data.address || null, data.phone || null, data.fax || null, data.createdAt]);
    invalidateReadCache('courts:');
}
export async function mysqlUpdateCourt(id: string, data: any) {
    const updatedAt = data.updatedAt || new Date().toISOString();
    await getPool().query('UPDATE Courts SET name = ?, address = ?, phone = ?, fax = ?, updatedAt = ? WHERE id = ?', [data.name, data.address || null, data.phone || null, data.fax || null, updatedAt, id]);
    invalidateReadCache('courts:');
}
export async function mysqlDeleteCourt(id: string) {
    await getPool().query('DELETE FROM Courts WHERE id = ?', [id]);
    invalidateReadCache('courts:');
}

export async function mysqlGetStores() {
    return cachedRead('stores:all', async () => {
        const [rows] = await getPool().query('SELECT * FROM Stores') as any;
        return rows;
    }, 30000);
}
export async function mysqlAddStore(data: any) {
    await getPool().query('INSERT INTO Stores (id, name, createdAt) VALUES (?, ?, ?)', [data.id, data.name, data.createdAt]);
    invalidateReadCache('stores:');
}
export async function mysqlUpdateStore(id: string, name: string, updatedAt?: string) {
    const ts = updatedAt || new Date().toISOString();
    await getPool().query('UPDATE Stores SET name = ?, updatedAt = ? WHERE id = ?', [name, ts, id]);
    invalidateReadCache('stores:');
}
export async function mysqlDeleteStore(id: string) {
    await getPool().query('DELETE FROM Stores WHERE id = ?', [id]);
    invalidateReadCache('stores:');
}

export async function mysqlGetTemplates() {
    return cachedRead('templates:all', async () => {
        const [rows] = await getPool().query('SELECT * FROM Templates') as any;
        return rows;
    }, 30000);
}
export async function mysqlAddTemplate(data: any) {
    await getPool().query('INSERT INTO Templates (id, name, content, createdAt) VALUES (?, ?, ?, ?)', [data.id, data.name, data.content, data.createdAt]);
    invalidateReadCache('templates:');
}
export async function mysqlUpdateTemplate(id: string, data: any) {
    const updatedAt = data.updatedAt || new Date().toISOString();
    await getPool().query('UPDATE Templates SET name = ?, content = ?, updatedAt = ? WHERE id = ?', [data.name, data.content, updatedAt, id]);
    invalidateReadCache('templates:');
}
export async function mysqlDeleteTemplate(id: string) {
    await getPool().query('DELETE FROM Templates WHERE id = ?', [id]);
    invalidateReadCache('templates:');
}

export async function mysqlBulkAddCustomers(customers: any[], userEmail: string = "system") {
    const results = [];
    const timestamp = new Date().toISOString();
    for (const customer of customers) {
        const cleanCode = customer.customerCode?.toString().trim();
        const customerId = cleanCode || Math.random().toString(36).substring(7);
        const data = {
            ...customer,
            customerCode: cleanCode,
            id: customerId,
            createdBy: userEmail,
            updatedAt: timestamp,
            statusHistory: [
                {
                    label: "Müştəri qeydə alındı",
                    action: "CREATE",
                    timestamp,
                    user: userEmail
                }
            ]
        };
        await mysqlAddCustomer(data);
        results.push(data);
    }
    await mysqlAddAuditLog({
        id: Math.random().toString(36).substring(7),
        action: "BULK_ADD",
        details: `Bulk əlavə: ${customers.length} müştəri sistemi daxil edildi`,
        userEmail,
        category: "CUSTOMER",
        metadata: { count: customers.length },
        createdAt: timestamp
    });
    invalidateReadCache('customers:');
    return results;
}

export async function mysqlMoveCustomer(oldId: string, newCode: string, userEmail: string) {
    const customer = await mysqlGetCustomer(oldId);
    if (!customer) throw new Error("Müştəri tapılmadı");
    
    const cleanNewCode = newCode.trim();
    const existing = await mysqlGetCustomer(cleanNewCode);
    if (existing) throw new Error("Bu kodlu müştəri artıq mövcuddur");
    
    const timestamp = new Date().toISOString();
    const pool = getPool();

    // Use a transaction to safely move the customer and all related records
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        
        // 1. Temporarily disable FK checks to allow ID change
        await conn.query('SET FOREIGN_KEY_CHECKS=0');
        
        // 2. Update the customer's ID and code
        await conn.query(
            'UPDATE Customers SET id = ?, customerCode = ?, updatedAt = ?, updatedBy = ? WHERE id = ?',
            [cleanNewCode, cleanNewCode, timestamp, userEmail, oldId]
        );
        
        // 3. Update all invoice FK references to the new ID
        await conn.query(
            'UPDATE CustomerInvoices SET customerId = ? WHERE customerId = ?',
            [cleanNewCode, oldId]
        );
        
        // 4. Re-enable FK checks
        await conn.query('SET FOREIGN_KEY_CHECKS=1');
        
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        await conn.query('SET FOREIGN_KEY_CHECKS=1');
        throw e;
    } finally {
        conn.release();
    }
    
    invalidateReadCache('customers:');
    return true;
}

export async function mysqlUpdateCustomer(id: string, data: any, userEmail: string = "system") {
    const oldData = await mysqlGetCustomer(id);
    let statusHistory = [...(oldData?.statusHistory || [])];
    const timestamp = new Date().toISOString();

    if (!oldData && statusHistory.length === 0) {
        statusHistory.push({
            label: "Müştəri qeydə alındı",
            action: "CREATE",
            timestamp,
            user: userEmail
        });
    }

    let mergedInvoices = [...(oldData?.details?.invoices || [])];
    const incomingInvoices = data.details?.invoices;

    if (incomingInvoices && Array.isArray(incomingInvoices)) {
        if (data._forceReplaceInvoices) {
            mergedInvoices = incomingInvoices;
        } else {
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

    const changes: string[] = [];
    const auditMeta: any = { targetId: id, targetName: data.fullName || oldData?.fullName };

    const coreFields = ['fullName', 'customerCode', 'debtAmount', 'assignedTo', 'archiveAssignedTo', 'process_status', 'isArchived', 'store', 'courtName'];
    coreFields.forEach(f => {
        if (data[f] !== undefined && data[f] !== oldData?.[f]) {
            changes.push(`${f}: ${oldData?.[f] || 'N/A'} -> ${data[f] || 'N/A'}`);
            auditMeta[`old_${f}`] = oldData?.[f] || null;
            auditMeta[`new_${f}`] = data[f] || null;
        }
    });

    const detailsToTrack = ['fin', 'phone', 'address', 'actualAddress', 'totalPrice', 'paidAmount', 'totalUnpaid', 'fee', 'penalty', 'warningDate'];
    detailsToTrack.forEach(f => {
        if (data.details?.[f] !== undefined && data.details?.[f] !== oldData?.details?.[f]) {
            changes.push(`details.${f}: ${oldData?.details?.[f] || 'N/A'} -> ${data.details?.[f] || 'N/A'}`);
            auditMeta[`old_details_${f}`] = oldData?.details?.[f] || null;
            auditMeta[`new_details_${f}`] = data.details?.[f] || null;
        }
    });

    const oldInvoices = oldData?.details?.invoices || [];
    const invoiceChanges: string[] = [];

    oldInvoices.forEach((oi: any) => {
        if (incomingInvoices && !mergedInvoices.some((ni: any) => ni.id === oi.id)) {
            invoiceChanges.push(`SİLİNDİ: Faktura №${oi.invoiceNumber || 'N/A'} (ID: ${oi.id})`);
        }
    });

    if (incomingInvoices) {
        incomingInvoices.forEach((ni: any) => {
            if (!oldInvoices.some((oi: any) => oi.id === ni.id)) {
                invoiceChanges.push(`ƏLAVƏ: Faktura №${ni.invoiceNumber || 'N/A'} (ID: ${ni.id})`);
            }
        });

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

    auditMeta.snapshot = cleanedData;
    auditMeta.changesCount = changes.length;
    auditMeta.changesList = changes;

    if (changes.length > 0) {
        await mysqlAddAuditLog({
            id: Math.random().toString(36).substring(7),
            action: "UPDATE",
            details: "Məlumatlar güncəlləndi: " + changes.join(' | '),
            userEmail,
            category: "CUSTOMER",
            metadata: auditMeta,
            createdAt: timestamp
        });
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

    cleanedData.updatedAt = timestamp;
    
    // Now perform the actual DB update
    if (oldData) {
        await mysqlUpdateCustomerRaw(id, cleanedData);
    } else {
        await mysqlAddCustomer(cleanedData);
    }

    if (action !== "UPDATE") {
        await mysqlAddAuditLog({
            id: Math.random().toString(36).substring(7),
            action,
            details: detail,
            userEmail,
            category,
            metadata: {
                ...auditMeta,
                oldStatus: oldData?.process_status,
                newStatus: cleanedData.process_status
            },
            createdAt: timestamp
        });
    }

    return await mysqlGetCustomer(id);
}
