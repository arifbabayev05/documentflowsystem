const admin = require('firebase-admin');
const mysql = require('mysql2/promise');

const serviceAccount = require('./serviceAccountKey.json');
const MYSQL_URI = 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const firestore = admin.firestore();

function toPlain(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
    if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(toPlain);
    if (typeof value === 'object') {
        const result = {};
        for (const key of Object.keys(value).sort()) {
            const plain = toPlain(value[key]);
            if (plain !== undefined) result[key] = plain;
        }
        return result;
    }
    return value;
}

function remapStorageUrls(value, storageUrlMap) {
    if (!storageUrlMap || storageUrlMap.size === 0) return value;
    if (typeof value === 'string') return storageUrlMap.get(value) || value;
    if (Array.isArray(value)) return value.map(item => remapStorageUrls(item, storageUrlMap));
    if (value && typeof value === 'object') {
        const result = {};
        for (const [key, nested] of Object.entries(value)) {
            result[key] = remapStorageUrls(nested, storageUrlMap);
        }
        return result;
    }
    return value;
}

async function loadStorageUrlMap(conn) {
    try {
        const [rows] = await conn.query('SELECT oldUrl, newUrl, id FROM StorageFiles');
        const urlMap = new Map();
        const idMap = new Map();
        for (const row of rows) {
            if (row.oldUrl && row.newUrl) {
                urlMap.set(row.oldUrl, row.newUrl);
                idMap.set(row.oldUrl, row.id);
                idMap.set(row.newUrl, row.id);
            }
        }
        return { urlMap, idMap };
    } catch {
        return { urlMap: new Map(), idMap: new Map() };
    }
}

function parseJson(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    return JSON.parse(value);
}

function stableIdPart(value, fallback) {
    const str = (value || fallback || '').toString().trim();
    return str.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || fallback;
}

function invoiceSqlId(customerId, invoice, index, usedIds) {
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

function orderSqlId(invoiceId, order, index, usedIds) {
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

function canonical(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (Array.isArray(value)) return value.map(canonical);
    if (typeof value === 'object') {
        const result = {};
        for (const key of Object.keys(value).sort()) {
            const next = canonical(value[key]);
            if (next !== undefined) result[key] = next;
        }
        return result;
    }
    return value;
}

function firstDiff(expected, actual, path = '$') {
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

async function fetchAllFirebaseCustomers() {
    const docs = [];
    let query = firestore.collection('Customers').orderBy(admin.firestore.FieldPath.documentId()).limit(500);

    while (true) {
        const snap = await query.get();
        if (snap.empty) break;
        docs.push(...snap.docs);
        const lastDoc = snap.docs[snap.docs.length - 1];
        query = firestore.collection('Customers')
            .orderBy(admin.firestore.FieldPath.documentId())
            .startAfter(lastDoc)
            .limit(500);
    }

    return docs;
}

async function main() {
    const conn = await mysql.createConnection(MYSQL_URI);
    try {
        const firebaseDocs = await fetchAllFirebaseCustomers();
        const storageMaps = await loadStorageUrlMap(conn);
        const firebaseIds = new Set(firebaseDocs.map(doc => doc.id));

        const [customerRows] = await conn.query('SELECT id, document_data FROM Customers');
        const mysqlCustomers = new Map(customerRows.map(row => [row.id, row]));

        const [invoiceRows] = await conn.query('SELECT id, customerId, document_data FROM CustomerInvoices');
        const mysqlInvoices = new Map(invoiceRows.map(row => [row.id, row]));

        const [orderRows] = await conn.query('SELECT id, invoiceId, document_data FROM InvoiceOrders');
        const mysqlOrders = new Map(orderRows.map(row => [row.id, row]));

        const missingCustomers = [];
        const customerDiffs = [];
        const invoiceDiffs = [];
        const orderDiffs = [];
        const usedInvoiceIds = new Set();
        const usedOrderIds = new Set();

        let expectedInvoiceCount = 0;
        let expectedOrderCount = 0;
        let filledByAdmin = 0;
        let exceptions = 0;

        for (const doc of firebaseDocs) {
            const fbData = remapStorageUrls(toPlain(doc.data()), storageMaps.urlMap);
            const expectedCustomer = { id: doc.id, ...fbData };
            if (fbData.process_status === 'FILLED_BY_ADMIN') filledByAdmin++;

            const myCustomer = mysqlCustomers.get(doc.id);
            if (!myCustomer) {
                missingCustomers.push(doc.id);
                continue;
            }

            const actualCustomer = parseJson(myCustomer.document_data);
            const customerDiff = firstDiff(expectedCustomer, actualCustomer);
            if (customerDiff) {
                customerDiffs.push({ id: doc.id, diff: customerDiff });
            }

            const invoices = Array.isArray(fbData.details?.invoices) ? fbData.details.invoices : [];
            expectedInvoiceCount += invoices.length;

            invoices.forEach((invoice, invoiceIndex) => {
                const invoiceId = invoiceSqlId(doc.id, invoice, invoiceIndex, usedInvoiceIds);
                const myInvoice = mysqlInvoices.get(invoiceId);
                if (!myInvoice) {
                    invoiceDiffs.push({ customerId: doc.id, invoiceId, diff: { path: '$', expected: 'invoice exists', actual: 'missing' } });
                    return;
                }

                if (invoice.isException === true || invoice.isException === 'true') exceptions++;
                const expectedInvoice = { ...invoice, id: invoiceId, firebaseId: invoice.id || null };
                if (expectedInvoice.archiveUrl && !expectedInvoice.archiveStorageId && storageMaps.idMap.has(expectedInvoice.archiveUrl)) {
                    expectedInvoice.archiveStorageId = storageMaps.idMap.get(expectedInvoice.archiveUrl);
                }
                const actualInvoice = parseJson(myInvoice.document_data);
                const invoiceDiff = firstDiff(expectedInvoice, actualInvoice);
                if (invoiceDiff) {
                    invoiceDiffs.push({ customerId: doc.id, invoiceId, diff: invoiceDiff });
                }

                const orders = Array.isArray(invoice.orders) ? invoice.orders : [];
                expectedOrderCount += orders.length;
                orders.forEach((order, orderIndex) => {
                    const orderId = orderSqlId(invoiceId, order, orderIndex, usedOrderIds);
                    const myOrder = mysqlOrders.get(orderId);
                    if (!myOrder) {
                        orderDiffs.push({ customerId: doc.id, invoiceId, orderId, diff: { path: '$', expected: 'order exists', actual: 'missing' } });
                        return;
                    }

                    const expectedOrder = { ...order, id: orderId, firebaseId: order.id || null };
                    const actualOrder = parseJson(myOrder.document_data);
                    const orderDiff = firstDiff(expectedOrder, actualOrder);
                    if (orderDiff) {
                        orderDiffs.push({ customerId: doc.id, invoiceId, orderId, diff: orderDiff });
                    }
                });
            });
        }

        const mysqlOnlyCustomers = customerRows.map(row => row.id).filter(id => !firebaseIds.has(id));
        const mysqlOnlyInvoices = invoiceRows.map(row => row.id).filter(id => !usedInvoiceIds.has(id));
        const mysqlOnlyOrders = orderRows.map(row => row.id).filter(id => !usedOrderIds.has(id));

        const [[mysqlFilled]] = await conn.query("SELECT COUNT(*) AS c FROM Customers WHERE process_status = 'FILLED_BY_ADMIN'");
        const [[mysqlExceptions]] = await conn.query('SELECT COUNT(*) AS c FROM CustomerInvoices WHERE isException = 1');

        const result = {
            counts: {
                firebaseCustomers: firebaseDocs.length,
                mysqlCustomers: customerRows.length,
                firebaseInvoices: expectedInvoiceCount,
                mysqlInvoices: invoiceRows.length,
                firebaseOrders: expectedOrderCount,
                mysqlOrders: orderRows.length,
                firebaseFilledByAdmin: filledByAdmin,
                mysqlFilledByAdmin: Number(mysqlFilled.c),
                firebaseExceptions: exceptions,
                mysqlExceptions: Number(mysqlExceptions.c)
            },
            missingCustomers: missingCustomers.slice(0, 20),
            mysqlOnlyCustomers: mysqlOnlyCustomers.slice(0, 20),
            mysqlOnlyInvoices: mysqlOnlyInvoices.slice(0, 20),
            mysqlOnlyOrders: mysqlOnlyOrders.slice(0, 20),
            diffCounts: {
                customerDocumentData: customerDiffs.length,
                invoiceDocumentData: invoiceDiffs.length,
                orderDocumentData: orderDiffs.length,
                missingCustomers: missingCustomers.length,
                mysqlOnlyCustomers: mysqlOnlyCustomers.length,
                mysqlOnlyInvoices: mysqlOnlyInvoices.length,
                mysqlOnlyOrders: mysqlOnlyOrders.length
            },
            samples: {
                customerDiffs: customerDiffs.slice(0, 5),
                invoiceDiffs: invoiceDiffs.slice(0, 5),
                orderDiffs: orderDiffs.slice(0, 5)
            }
        };

        console.log(JSON.stringify(result, null, 2));

        const failed = Object.values(result.diffCounts).some(count => count !== 0)
            || Object.entries(result.counts).some(([key, value]) => {
                if (!key.startsWith('firebase')) return false;
                const suffix = key.replace('firebase', '');
                return value !== result.counts[`mysql${suffix}`];
            });

        if (failed) process.exitCode = 1;
    } finally {
        await conn.end();
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
