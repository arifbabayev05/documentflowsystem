"use server";

import mysql from 'mysql2/promise';

const DEFAULT_MYSQL_URI = 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev';
const connectionString = process.env.MYSQL_URI || process.env.DATABASE_URL || DEFAULT_MYSQL_URI;

let pool: mysql.Pool;

function getPool() {
    if (!pool) {
        pool = mysql.createPool(connectionString);
    }
    return pool;
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
    const [rows] = await getPool().query('SELECT allowedPaths FROM Permissions WHERE id = ?', [role]) as any;
    if (rows.length > 0) {
        return parseJsonFields(rows[0], ['allowedPaths']).allowedPaths || [];
    }
    // Fallbacks identical to firebase
    if (role === "SUPERADMIN") return [/* all from format but firebase logic handles this if we return default */]; 
    return null; // Return null to let the caller handle defaults
}

export async function mysqlUpdateRolePermissions(role: string, paths: string[]) {
    const id = role;
    const allowedPaths = JSON.stringify(paths);
    const updatedAt = new Date().toISOString();
    await getPool().query(
        'INSERT INTO Permissions (id, role, allowedPaths, updatedAt) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE allowedPaths = ?, updatedAt = ?',
        [id, role, allowedPaths, updatedAt, allowedPaths, updatedAt]
    );
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
    return userDoc;
}

export async function mysqlGetAllUsers() {
    const [rows] = await getPool().query('SELECT * FROM Users') as any;
    return rows.map((r: any) => parseJsonFields(r, ['permissions']));
}

export async function mysqlUpdateUserRole(email: string, role: string, permissions: string[] | null) {
    const permsStr = permissions ? JSON.stringify(permissions) : '[]'; // Simplified, caller should provide
    await getPool().query('UPDATE Users SET role = ?, permissions = ? WHERE id = ?', [role, permsStr, email]);
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
    return true;
}

export async function mysqlDeleteUser(email: string) {
    await getPool().query('DELETE FROM Users WHERE id = ?', [email]);
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
async function attachInvoicesToCustomers(customers: any[]) {
    if (customers.length === 0) return customers;
    await ensureInvoiceSchema();
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
    const [rows] = await getPool().query('SELECT * FROM Customers') as any;
    const customers = rows.map(parseCustomer);
    return await attachInvoicesToCustomers(customers);
}

export async function mysqlGetInspectorCustomers(email: string) {
    const [rows] = await getPool().query('SELECT * FROM Customers WHERE createdBy = ?', [email]) as any;
    const customers = rows.map(parseCustomer);
    return await attachInvoicesToCustomers(customers);
}

export async function mysqlDeleteCustomer(id: string) {
    await getPool().query('DELETE FROM Customers WHERE id = ?', [id]);
    return true;
}

export async function mysqlGetCustomer(id: string) {
    const [rows] = await getPool().query('SELECT * FROM Customers WHERE id = ?', [id]) as any;
    if (rows.length > 0) {
        const customers = await attachInvoicesToCustomers([parseCustomer(rows[0])]);
        return customers[0];
    }
    return null;
}

export async function mysqlFindCustomerByCode(code: string) {
    const [rows] = await getPool().query('SELECT * FROM Customers WHERE customerCode = ? LIMIT 1', [code]) as any;
    if (rows.length > 0) {
        const customers = await attachInvoicesToCustomers([parseCustomer(rows[0])]);
        return customers[0];
    }
    return null;
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
    return true;
}

export async function mysqlGetAuditLogs(limitCount: number) {
    const [rows] = await getPool().query(`SELECT * FROM AuditLogs ORDER BY createdAt DESC LIMIT ${Number(limitCount)}`) as any;
    return rows.map((r: any) => parseJsonFields(r, ['metadata']));
}

export async function mysqlDeleteAuditLogsBeforeDate(dateStr: string) {
    const [result] = await getPool().query('DELETE FROM AuditLogs WHERE createdAt <= ?', [dateStr]) as any;
    return result.affectedRows;
}

export async function mysqlLogError(errorData: any) {
    const id = errorData.id || Math.random().toString(36).substring(7);
    await getPool().query(
        'INSERT INTO SystemErrors (id, message, stack, context, userEmail, url, userAgent, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, errorData.message, errorData.stack, errorData.context, errorData.userEmail, errorData.url, errorData.userAgent, errorData.createdAt || new Date().toISOString()]
    );
    return true;
}

export async function mysqlGetSystemErrors(limitCount: number) {
    const [rows] = await getPool().query(`SELECT * FROM SystemErrors ORDER BY createdAt DESC LIMIT ${Number(limitCount)}`) as any;
    return rows;
}

// --- Global Settings ---
export async function mysqlGetGlobalSettings() {
    const [rows] = await getPool().query('SELECT * FROM GlobalSettings WHERE id = "current"') as any;
    if (rows.length > 0) return rows[0];
    return null;
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
    return true;
}

// --- Courts, Stores, Templates ---
export async function mysqlGetCourts() {
    const [rows] = await getPool().query('SELECT * FROM Courts') as any;
    return rows;
}
export async function mysqlAddCourt(data: any) {
    await getPool().query('INSERT INTO Courts (id, name, address, phone, fax, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [data.id, data.name, data.address || null, data.phone || null, data.fax || null, data.createdAt]);
}
export async function mysqlUpdateCourt(id: string, data: any) {
    const updatedAt = data.updatedAt || new Date().toISOString();
    await getPool().query('UPDATE Courts SET name = ?, address = ?, phone = ?, fax = ?, updatedAt = ? WHERE id = ?', [data.name, data.address || null, data.phone || null, data.fax || null, updatedAt, id]);
}
export async function mysqlDeleteCourt(id: string) {
    await getPool().query('DELETE FROM Courts WHERE id = ?', [id]);
}

export async function mysqlGetStores() {
    const [rows] = await getPool().query('SELECT * FROM Stores') as any;
    return rows;
}
export async function mysqlAddStore(data: any) {
    await getPool().query('INSERT INTO Stores (id, name, createdAt) VALUES (?, ?, ?)', [data.id, data.name, data.createdAt]);
}
export async function mysqlUpdateStore(id: string, name: string, updatedAt?: string) {
    const ts = updatedAt || new Date().toISOString();
    await getPool().query('UPDATE Stores SET name = ?, updatedAt = ? WHERE id = ?', [name, ts, id]);
}
export async function mysqlDeleteStore(id: string) {
    await getPool().query('DELETE FROM Stores WHERE id = ?', [id]);
}

export async function mysqlGetTemplates() {
    const [rows] = await getPool().query('SELECT * FROM Templates') as any;
    return rows;
}
export async function mysqlAddTemplate(data: any) {
    await getPool().query('INSERT INTO Templates (id, name, content, createdAt) VALUES (?, ?, ?, ?)', [data.id, data.name, data.content, data.createdAt]);
}
export async function mysqlUpdateTemplate(id: string, data: any) {
    const updatedAt = data.updatedAt || new Date().toISOString();
    await getPool().query('UPDATE Templates SET name = ?, content = ?, updatedAt = ? WHERE id = ?', [data.name, data.content, updatedAt, id]);
}
export async function mysqlDeleteTemplate(id: string) {
    await getPool().query('DELETE FROM Templates WHERE id = ?', [id]);
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
