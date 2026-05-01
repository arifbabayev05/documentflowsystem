import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';
import admin from 'firebase-admin';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

const execFileAsync = promisify(execFile);
const MYSQL_URI = process.env.MYSQL_URI || 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev';
const LIST_LIMIT = 100;

const COMMANDS: Record<string, { label: string; file: string }> = {
    sync: {
        label: 'node scripts\\sync-firebase-mysql-lossless.js',
        file: 'scripts/sync-firebase-mysql-lossless.js'
    },
    migrateStorage: {
        label: 'node scripts\\migrate-firebase-storage-to-api.js',
        file: 'scripts/migrate-firebase-storage-to-api.js'
    },
    readinessAudit: {
        label: 'node scripts\\production-readiness-audit.js',
        file: 'scripts/production-readiness-audit.js'
    }
};

function ensureFirebase() {
    if (!admin.apps.length) {
        if (process.env.FIREBASE_CONFIG || process.env.GCLOUD_PROJECT) {
            admin.initializeApp();
        } else {
            const serviceAccountPath = path.join(process.cwd(), 'scripts', 'serviceAccountKey.json');
            const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount as admin.ServiceAccount)
            });
        }
    }
    return admin.firestore();
}

async function requireSuperAdmin(req: Request) {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!token) throw new Error('UNAUTHORIZED');

    ensureFirebase();
    const decoded = await admin.auth().verifyIdToken(token);
    const email = decoded.email?.toLowerCase().trim();
    if (!email) throw new Error('UNAUTHORIZED');

    const conn = await mysql.createConnection(MYSQL_URI);
    try {
        const [rows] = await conn.query('SELECT role, status FROM Users WHERE id = ? OR email = ? LIMIT 1', [email, email]) as any;
        const user = rows[0];
        if (!user || user.role !== 'SUPERADMIN' || (user.status && user.status !== 'ACTIVE')) {
            throw new Error('FORBIDDEN');
        }
    } finally {
        await conn.end();
    }
}

function toPlain(value: any): any {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
    if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(toPlain);
    if (typeof value === 'object') {
        const result: any = {};
        for (const [key, nested] of Object.entries(value)) {
            const plain = toPlain(nested);
            if (plain !== undefined) result[key] = plain;
        }
        return result;
    }
    return value;
}

function parseJson(value: any, fallback: any = null) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function stableIdPart(value: any, fallback: string) {
    const str = (value || fallback || '').toString().trim();
    return str.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || fallback;
}

function invoiceSqlId(customerId: string, invoice: any, index: number, usedIds: Set<string>) {
    const raw = invoice.id && invoice.id !== 'def' ? invoice.id.toString() : null;
    let id = raw || `${stableIdPart(customerId, 'customer')}_inv_${index}_${stableIdPart(invoice.invoiceNumber, 'no')}`;
    id = id.slice(0, 255);
    if (!usedIds.has(id)) {
        usedIds.add(id);
        return id;
    }

    const fallback = `${stableIdPart(customerId, 'customer')}_inv_${index}_${stableIdPart(invoice.invoiceNumber, 'no')}`;
    let next = fallback.slice(0, 250);
    let suffix = 1;
    while (usedIds.has(next)) {
        next = `${fallback.slice(0, 245)}_${suffix++}`;
    }
    usedIds.add(next);
    return next;
}

function orderSqlId(invoiceId: string, order: any, index: number, usedIds: Set<string>) {
    const raw = order.id && order.id !== 'o_def' ? order.id.toString() : null;
    let id = raw || `${stableIdPart(invoiceId, 'invoice')}_ord_${index}`;
    id = id.slice(0, 255);
    if (!usedIds.has(id)) {
        usedIds.add(id);
        return id;
    }

    const fallback = `${stableIdPart(invoiceId, 'invoice')}_ord_${index}`;
    let next = fallback.slice(0, 250);
    let suffix = 1;
    while (usedIds.has(next)) {
        next = `${fallback.slice(0, 245)}_${suffix++}`;
    }
    usedIds.add(next);
    return next;
}

function remapStorageUrls(value: any, storageUrlMap: Map<string, string>): any {
    if (!storageUrlMap || storageUrlMap.size === 0) return value;
    if (typeof value === 'string') return storageUrlMap.get(value) || value;
    if (Array.isArray(value)) return value.map(item => remapStorageUrls(item, storageUrlMap));
    if (value && typeof value === 'object') {
        const result: any = {};
        for (const [key, nested] of Object.entries(value)) {
            result[key] = remapStorageUrls(nested, storageUrlMap);
        }
        return result;
    }
    return value;
}

function canonical(value: any): any {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (Array.isArray(value)) return value.map(canonical);
    if (typeof value === 'object') {
        const result: any = {};
        for (const key of Object.keys(value).sort()) {
            const next = canonical(value[key]);
            if (next !== undefined) result[key] = next;
        }
        return result;
    }
    return value;
}

function firstDiff(expected: any, actual: any, path = '$'): any {
    const exp = canonical(expected);
    const act = canonical(actual);
    if (JSON.stringify(exp) === JSON.stringify(act)) return null;

    if (exp === null || act === null || typeof exp !== 'object' || typeof act !== 'object') {
        return { path, expected: exp, actual: act };
    }

    if (Array.isArray(exp) || Array.isArray(act)) {
        if (!Array.isArray(exp) || !Array.isArray(act)) return { path, expected: exp, actual: act };
        if (exp.length !== act.length) return { path: `${path}.length`, expected: exp.length, actual: act.length };
        for (let i = 0; i < exp.length; i++) {
            const diff = firstDiff(exp[i], act[i], `${path}[${i}]`);
            if (diff) return diff;
        }
        return { path, expected: exp, actual: act };
    }

    const keys = Array.from(new Set([...Object.keys(exp), ...Object.keys(act)])).sort();
    for (const key of keys) {
        if (!(key in exp)) return { path: `${path}.${key}`, expected: undefined, actual: act[key] };
        if (!(key in act)) return { path: `${path}.${key}`, expected: exp[key], actual: undefined };
        const diff = firstDiff(exp[key], act[key], `${path}.${key}`);
        if (diff) return diff;
    }
    return { path, expected: exp, actual: act };
}

async function fetchAllFirebaseCustomers(firestore: admin.firestore.Firestore) {
    const docs: admin.firestore.QueryDocumentSnapshot[] = [];
    let query: admin.firestore.Query = firestore.collection('Customers')
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(500);

    while (true) {
        const snap = await query.get();
        if (snap.empty) break;
        docs.push(...snap.docs);
        query = firestore.collection('Customers')
            .orderBy(admin.firestore.FieldPath.documentId())
            .startAfter(snap.docs[snap.docs.length - 1])
            .limit(500);
    }

    return docs;
}

function summarizeCustomer(id: string, data: any) {
    return {
        id,
        customerCode: data?.customerCode || data?.details?.customerCode || id,
        fullName: data?.fullName || data?.details?.fullName || '',
        process_status: data?.process_status || '',
        createdAt: data?.createdAt || '',
        updatedAt: data?.updatedAt || ''
    };
}

function isFirebaseUrl(url: any) {
    return typeof url === 'string' && url.includes('firebasestorage.googleapis.com');
}

async function buildReport() {
    const firestore = ensureFirebase();
    const conn = await mysql.createConnection(MYSQL_URI);

    try {
        const [customerRows] = await conn.query('SELECT id, customerCode, fullName, process_status, createdAt, updatedAt, document_data, details FROM Customers') as any;
        const [invoiceRows] = await conn.query('SELECT id, customerId, invoiceNumber, document_data FROM CustomerInvoices') as any;
        const [orderRows] = await conn.query('SELECT id, invoiceId, document_data FROM InvoiceOrders') as any;
        const [storageRows] = await conn.query('SELECT id, oldUrl, newUrl FROM StorageFiles') as any;

        const storageUrlMap = new Map<string, string>();
        const storageIdMap = new Map<string, string>();
        for (const row of storageRows) {
            if (row.oldUrl && row.newUrl) {
                storageUrlMap.set(row.oldUrl, row.newUrl);
                storageIdMap.set(row.oldUrl, row.id);
                storageIdMap.set(row.newUrl, row.id);
            }
        }

        const firebaseDocs = await fetchAllFirebaseCustomers(firestore);
        const firebaseCustomers = new Map<string, any>();
        const mysqlCustomers = new Map<string, any>();
        const mysqlCustomerSummaries = new Map<string, any>();
        for (const row of customerRows) {
            const raw = parseJson(row.document_data, {});
            mysqlCustomers.set(row.id, raw);
            mysqlCustomerSummaries.set(row.id, summarizeCustomer(row.id, { ...raw, ...row }));
        }

        const expectedInvoices = new Map<string, any>();
        const expectedOrders = new Map<string, any>();
        const usedInvoiceIds = new Set<string>();
        const usedOrderIds = new Set<string>();

        let firebaseFilled = 0;
        let firebaseExceptions = 0;

        for (const doc of firebaseDocs) {
            const original = toPlain(doc.data());
            const data = remapStorageUrls(original, storageUrlMap);
            firebaseCustomers.set(doc.id, data);
            if (data.process_status === 'FILLED_BY_ADMIN') firebaseFilled++;

            const invoices = Array.isArray(data.details?.invoices) ? data.details.invoices : [];
            invoices.forEach((invoice: any, invoiceIndex: number) => {
                if (invoice?.isException === true || invoice?.isException === 'true' || invoice?.isException === 1 || invoice?.isException === '1') {
                    firebaseExceptions++;
                }
                const invoiceId = invoiceSqlId(doc.id, invoice, invoiceIndex, usedInvoiceIds);
                const expectedInvoice = { ...invoice, id: invoiceId, firebaseId: invoice.id || null };
                if (expectedInvoice.archiveUrl && !expectedInvoice.archiveStorageId && storageIdMap.has(expectedInvoice.archiveUrl)) {
                    expectedInvoice.archiveStorageId = storageIdMap.get(expectedInvoice.archiveUrl);
                }
                expectedInvoices.set(invoiceId, {
                    id: invoiceId,
                    customerId: doc.id,
                    invoiceNumber: invoice.invoiceNumber || '',
                    data: expectedInvoice
                });

                const orders = Array.isArray(invoice.orders) ? invoice.orders : [];
                orders.forEach((order: any, orderIndex: number) => {
                    const orderId = orderSqlId(invoiceId, order, orderIndex, usedOrderIds);
                    expectedOrders.set(orderId, {
                        id: orderId,
                        invoiceId,
                        customerId: doc.id,
                        productDescription: order.productDescription || '',
                        data: { ...order, id: orderId, firebaseId: order.id || null }
                    });
                });
            });
        }

        const mysqlInvoiceMap = new Map(invoiceRows.map((row: any) => [row.id, row]));
        const mysqlOrderMap = new Map(orderRows.map((row: any) => [row.id, row]));
        const firebaseIds = new Set(firebaseDocs.map(doc => doc.id));
        const mysqlIds = new Set(customerRows.map((row: any) => row.id));

        const firebaseOnlyCustomers = firebaseDocs
            .filter(doc => !mysqlIds.has(doc.id))
            .slice(0, LIST_LIMIT)
            .map(doc => summarizeCustomer(doc.id, toPlain(doc.data())));

        const mysqlOnlyCustomers = customerRows
            .filter((row: any) => !firebaseIds.has(row.id))
            .slice(0, LIST_LIMIT)
            .map((row: any) => mysqlCustomerSummaries.get(row.id));

        const firebaseOnlyInvoices = Array.from(expectedInvoices.values())
            .filter(inv => !mysqlInvoiceMap.has(inv.id))
            .slice(0, LIST_LIMIT)
            .map(({ data, ...rest }) => rest);

        const mysqlOnlyInvoices = invoiceRows
            .filter((row: any) => !expectedInvoices.has(row.id))
            .slice(0, LIST_LIMIT)
            .map((row: any) => ({ id: row.id, customerId: row.customerId, invoiceNumber: row.invoiceNumber || '' }));

        const firebaseOnlyOrders = Array.from(expectedOrders.values())
            .filter(order => !mysqlOrderMap.has(order.id))
            .slice(0, LIST_LIMIT)
            .map(({ data, ...rest }) => rest);

        const mysqlOnlyOrders = orderRows
            .filter((row: any) => !expectedOrders.has(row.id))
            .slice(0, LIST_LIMIT)
            .map((row: any) => ({ id: row.id, invoiceId: row.invoiceId }));

        const customerDiffs: any[] = [];
        for (const doc of firebaseDocs) {
            const actual = mysqlCustomers.get(doc.id);
            if (!actual) continue;
            const expected = { id: doc.id, ...firebaseCustomers.get(doc.id) };
            const diff = firstDiff(expected, actual);
            if (diff) customerDiffs.push({ id: doc.id, diff });
            if (customerDiffs.length >= 25) break;
        }

        let remainingFirebaseStorageUrls = 0;
        for (const row of invoiceRows) {
            const doc = parseJson(row.document_data, {});
            if (isFirebaseUrl(doc.archiveUrl)) remainingFirebaseStorageUrls++;
        }
        for (const row of customerRows) {
            const details = parseJson(row.details, {});
            if (isFirebaseUrl(details.receiptUrl)) remainingFirebaseStorageUrls++;
            if (isFirebaseUrl(details.postageUrl)) remainingFirebaseStorageUrls++;
            if (Array.isArray(details.generatedDocs)) {
                remainingFirebaseStorageUrls += details.generatedDocs.filter((doc: any) => isFirebaseUrl(doc?.url)).length;
            }
        }

        const mysqlFilled = customerRows.filter((row: any) => row.process_status === 'FILLED_BY_ADMIN').length;
        const mysqlExceptions = invoiceRows.filter((row: any) => {
            const doc = parseJson(row.document_data, {});
            return doc.isException === true || doc.isException === 'true' || doc.isException === 1 || doc.isException === '1';
        }).length;

        return {
            generatedAt: new Date().toISOString(),
            counts: {
                firebaseCustomers: firebaseDocs.length,
                mysqlCustomers: customerRows.length,
                firebaseInvoices: expectedInvoices.size,
                mysqlInvoices: invoiceRows.length,
                firebaseOrders: expectedOrders.size,
                mysqlOrders: orderRows.length,
                firebaseFilledByAdmin: firebaseFilled,
                mysqlFilledByAdmin: mysqlFilled,
                firebaseExceptions,
                mysqlExceptions,
                storageFiles: storageRows.length,
                remainingFirebaseStorageUrls
            },
            totals: {
                firebaseOnlyCustomers: firebaseDocs.filter(doc => !mysqlIds.has(doc.id)).length,
                mysqlOnlyCustomers: customerRows.filter((row: any) => !firebaseIds.has(row.id)).length,
                firebaseOnlyInvoices: Array.from(expectedInvoices.keys()).filter(id => !mysqlInvoiceMap.has(id)).length,
                mysqlOnlyInvoices: invoiceRows.filter((row: any) => !expectedInvoices.has(row.id)).length,
                firebaseOnlyOrders: Array.from(expectedOrders.keys()).filter(id => !mysqlOrderMap.has(id)).length,
                mysqlOnlyOrders: orderRows.filter((row: any) => !expectedOrders.has(row.id)).length,
                customerDocumentDiffs: customerDiffs.length
            },
            lists: {
                firebaseOnlyCustomers,
                mysqlOnlyCustomers,
                firebaseOnlyInvoices,
                mysqlOnlyInvoices,
                firebaseOnlyOrders,
                mysqlOnlyOrders,
                customerDiffs
            },
            listLimit: LIST_LIMIT
        };
    } finally {
        await conn.end();
    }
}

export async function GET(req: Request) {
    try {
        await requireSuperAdmin(req);
        const report = await buildReport();
        return NextResponse.json(report);
    } catch (error: any) {
        if (error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        return NextResponse.json({ error: error.message || 'Parity report failed' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        await requireSuperAdmin(req);
        const body = await req.json().catch(() => ({}));
        const command = COMMANDS[body.action];
        if (!command) {
            return NextResponse.json({ error: 'Unknown command action' }, { status: 400 });
        }

        const startedAt = Date.now();
        try {
            const result = await execFileAsync(process.execPath, [command.file], {
                cwd: process.cwd(),
                timeout: 600000,
                maxBuffer: 1024 * 1024 * 30,
                windowsHide: true
            });

            return NextResponse.json({
                ok: true,
                command: command.label,
                durationMs: Date.now() - startedAt,
                stdout: result.stdout,
                stderr: result.stderr
            });
        } catch (error: any) {
            return NextResponse.json({
                ok: false,
                command: command.label,
                durationMs: Date.now() - startedAt,
                stdout: error.stdout || '',
                stderr: error.stderr || '',
                error: error.message || 'Command failed'
            }, { status: 500 });
        }
    } catch (error: any) {
        if (error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        return NextResponse.json({ error: error.message || 'Command request failed' }, { status: 500 });
    }
}
