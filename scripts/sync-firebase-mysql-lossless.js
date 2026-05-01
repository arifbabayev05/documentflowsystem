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
    'phoneCount'
];

const ROOT_DETAIL_COLUMNS = new Set(CUSTOMER_COLUMNS.filter(c => c !== 'details'));
const BOOL_FIELDS = new Set(['isArchived', 'fullData', '_forceReplaceInvoices', '_isArchivePart', 'isWarningSent']);

function toPlain(value) {
    if (value === undefined) return null;
    if (value === null) return null;
    if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
    if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(toPlain);
    if (typeof value === 'object') {
        const result = {};
        for (const [key, nested] of Object.entries(value)) {
            result[key] = toPlain(nested);
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

function sqlValue(value, columnName) {
    const plain = toPlain(value);
    if (plain === undefined || plain === null) return null;
    if (BOOL_FIELDS.has(columnName)) {
        return plain === true || plain === 1 || plain === '1' || plain === 'true' ? '1' : '0';
    }
    if (typeof plain === 'boolean') return plain ? '1' : '0';
    if (typeof plain === 'object') return JSON.stringify(plain);
    return plain;
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

async function getColumns(conn, table) {
    const [rows] = await conn.query(`DESCRIBE \`${table}\``);
    return rows.map(row => row.Field);
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

async function addColumnIfMissing(conn, table, column, definition) {
    const columns = await getColumns(conn, table);
    if (!columns.includes(column)) {
        await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    }
}

async function ensureSchema(conn) {
    await addColumnIfMissing(conn, 'Customers', 'document_data', 'JSON NULL');
    await addColumnIfMissing(conn, 'CustomerInvoices', 'archiveStorageId', 'VARCHAR(255) NULL');
    await addColumnIfMissing(conn, 'CustomerInvoices', 'exceptionProduct', 'TEXT NULL');
    await addColumnIfMissing(conn, 'CustomerInvoices', 'exceptionProductQty', 'VARCHAR(255) NULL');
    await addColumnIfMissing(conn, 'CustomerInvoices', 'exceptionProducts', 'JSON NULL');
    await addColumnIfMissing(conn, 'CustomerInvoices', 'document_data', 'JSON NULL');
    await addColumnIfMissing(conn, 'InvoiceOrders', 'document_data', 'JSON NULL');

    const tablesWithRawBackup = ['Courts', 'Stores', 'Templates', 'Users', 'GlobalSettings', 'Settings', 'SystemErrors', 'AuditLogs'];
    for (const table of tablesWithRawBackup) {
        try {
            await addColumnIfMissing(conn, table, 'document_data', 'JSON NULL');
        } catch (error) {
            if (error && error.code !== 'ER_NO_SUCH_TABLE') throw error;
        }
    }
}

async function bulkUpsert(conn, table, rows, columns) {
    if (rows.length === 0) return;
    const colSql = columns.map(col => `\`${col}\``).join(', ');
    const updateSql = columns
        .filter(col => col !== 'id')
        .map(col => `\`${col}\` = VALUES(\`${col}\`)`)
        .join(', ') || '`id` = VALUES(`id`)';

    for (let i = 0; i < rows.length; i += 250) {
        const chunk = rows.slice(i, i + 250);
        await conn.query(
            `INSERT INTO \`${table}\` (${colSql}) VALUES ? ON DUPLICATE KEY UPDATE ${updateSql}`,
            [chunk]
        );
    }
}

async function syncGenericCollection(conn, collectionName, tableName, options = {}) {
    const columns = await getColumns(conn, tableName);
    const usableColumns = columns.filter(col => col === 'id' || col === 'document_data' || col !== 'id');
    const existingIds = new Set();
    const seenIds = new Set();

    if (options.missingOnly) {
        const [existingRows] = await conn.query(`SELECT id FROM \`${tableName}\``);
        existingRows.forEach(row => existingIds.add(row.id));
        console.log(`${collectionName} -> ${tableName}: ${existingIds.size} existing rows, inserting missing docs only`);
    }

    let query = firestore.collection(collectionName).orderBy(admin.firestore.FieldPath.documentId()).limit(500);
    let total = 0;
    let insertedOrUpdated = 0;
    let lastDoc = null;

    while (true) {
        const snap = await query.get();
        if (snap.empty) break;

        const rows = [];
        for (const doc of snap.docs) {
            const data = doc.data();
            const plainDoc = { id: doc.id, ...toPlain(data) };
            seenIds.add(doc.id);
            if (options.missingOnly && existingIds.has(doc.id)) continue;

            rows.push(usableColumns.map(col => {
                if (col === 'id') return doc.id;
                if (col === 'document_data') return JSON.stringify(plainDoc);
                return sqlValue(data[col], col);
            }));
        }

        await bulkUpsert(conn, tableName, rows, usableColumns);
        total += snap.size;
        insertedOrUpdated += rows.length;
        lastDoc = snap.docs[snap.docs.length - 1];
        query = firestore.collection(collectionName)
            .orderBy(admin.firestore.FieldPath.documentId())
            .startAfter(lastDoc)
            .limit(500);
    }

    if (process.env.DELETE_MYSQL_EXTRAS === '1') {
        const [tableRows] = await conn.query(`SELECT id FROM \`${tableName}\``);
        const extras = tableRows.map(row => row.id).filter(id => !seenIds.has(id));
        for (let i = 0; i < extras.length; i += 250) {
            await conn.query(`DELETE FROM \`${tableName}\` WHERE id IN (?)`, [extras.slice(i, i + 250)]);
        }
        if (extras.length > 0) console.log(`${tableName}: deleted ${extras.length} MySQL-only rows`);
    }

    console.log(`${collectionName} -> ${tableName}: ${total} docs scanned, ${insertedOrUpdated} rows written`);
    return total;
}

function normalizeCustomer(doc, storageMaps = { urlMap: new Map(), idMap: new Map() }) {
    const fbData = doc.data();
    const plainFbData = remapStorageUrls(toPlain(fbData), storageMaps.urlMap);
    const result = { id: doc.id, document_data: JSON.stringify({ id: doc.id, ...plainFbData }) };

    for (const col of CUSTOMER_COLUMNS) {
        if (col === 'id' || col === 'details' || col === 'statusHistory') continue;
        if (fbData[col] !== undefined) result[col] = sqlValue(remapStorageUrls(fbData[col], storageMaps.urlMap), col);
    }

    const details = plainFbData.details && typeof plainFbData.details === 'object' ? plainFbData.details : {};
    for (const col of CUSTOMER_COLUMNS) {
        if (col === 'id' || col === 'details' || col === 'statusHistory') continue;
        if ((result[col] === undefined || result[col] === null) && details[col] !== undefined) {
            result[col] = sqlValue(details[col], col);
        }
    }

    const cleanDetails = {};
    for (const [key, value] of Object.entries(details)) {
        if (key === 'invoices' || key === 'statusHistory' || ROOT_DETAIL_COLUMNS.has(key)) continue;
        cleanDetails[key] = toPlain(value);
    }
    result.details = JSON.stringify(cleanDetails);

    const statusHistory = fbData.statusHistory || details.statusHistory || [];
    result.statusHistory = JSON.stringify(toPlain(Array.isArray(statusHistory) ? statusHistory : []));
    result.createdAt = result.createdAt || new Date().toISOString();
    result.updatedAt = result.updatedAt || new Date().toISOString();

    return {
        customer: result,
        invoices: Array.isArray(details.invoices) ? details.invoices : []
    };
}

async function fetchAllCustomers() {
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

async function syncCustomers(conn, customerDocs) {
    const storageMaps = await loadStorageUrlMap(conn);
    const columns = await getColumns(conn, 'Customers');
    const rows = customerDocs.map(doc => {
        const { customer } = normalizeCustomer(doc, storageMaps);
        return columns.map(col => {
            if (col === 'id') return customer.id;
            if (col === 'document_data') return customer.document_data;
            return customer[col] === undefined ? null : customer[col];
        });
    });

    await bulkUpsert(conn, 'Customers', rows, columns);
    console.log(`Customers: ${rows.length} docs synced`);
}

async function syncInvoices(conn, customerDocs) {
    const storageMaps = await loadStorageUrlMap(conn);
    const invoiceColumns = await getColumns(conn, 'CustomerInvoices');
    const orderColumns = await getColumns(conn, 'InvoiceOrders');
    const invoiceRows = [];
    const orderRows = [];
    const usedInvoiceIds = new Set();
    const usedOrderIds = new Set();

    for (const doc of customerDocs) {
        const { invoices } = normalizeCustomer(doc, storageMaps);
        invoices.forEach((invoice, invoiceIndex) => {
            const invPlain = toPlain(invoice);
            if (invPlain.archiveUrl && !invPlain.archiveStorageId && storageMaps.idMap.has(invPlain.archiveUrl)) {
                invPlain.archiveStorageId = storageMaps.idMap.get(invPlain.archiveUrl);
            }
            const invId = invoiceSqlId(doc.id, invPlain, invoiceIndex, usedInvoiceIds);
            const orders = Array.isArray(invPlain.orders) ? invPlain.orders : [];

            invoiceRows.push(invoiceColumns.map(col => {
                if (col === 'id') return invId;
                if (col === 'customerId') return doc.id;
                if (col === 'document_data') return JSON.stringify({ ...invPlain, id: invId, firebaseId: invPlain.id || null });
                if (col === 'archiveStorageId') return storageMaps.idMap.get(invoice.archiveUrl) || invPlain.archiveStorageId || null;
                if (col === 'exceptionProducts') return invPlain.exceptionProducts ? JSON.stringify(invPlain.exceptionProducts) : null;
                if (col === 'archiveRequested' || col === 'isException') {
                    return invPlain[col] === true || invPlain[col] === 1 || invPlain[col] === '1' || invPlain[col] === 'true' ? 1 : 0;
                }
                return sqlValue(invPlain[col], col);
            }));

            orders.forEach((order, orderIndex) => {
                const ordPlain = toPlain(order);
                const ordId = orderSqlId(invId, ordPlain, orderIndex, usedOrderIds);
                orderRows.push(orderColumns.map(col => {
                    if (col === 'id') return ordId;
                    if (col === 'invoiceId') return invId;
                    if (col === 'document_data') return JSON.stringify({ ...ordPlain, id: ordId, firebaseId: ordPlain.id || null });
                    if (col === 'checkedImeis') return ordPlain.checkedImeis ? JSON.stringify(ordPlain.checkedImeis) : null;
                    if (col === 'hasImieFee') return ordPlain.hasImieFee === true || ordPlain.hasImieFee === 1 || ordPlain.hasImieFee === '1' || ordPlain.hasImieFee === 'true' ? 1 : 0;
                    return sqlValue(ordPlain[col], col);
                }));
            });
        });
    }

    await conn.beginTransaction();
    try {
        await conn.query('DELETE FROM InvoiceOrders');
        await conn.query('DELETE FROM CustomerInvoices');
        await bulkUpsert(conn, 'CustomerInvoices', invoiceRows, invoiceColumns);
        await bulkUpsert(conn, 'InvoiceOrders', orderRows, orderColumns);
        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    }

    console.log(`CustomerInvoices: ${invoiceRows.length} rows rebuilt`);
    console.log(`InvoiceOrders: ${orderRows.length} rows rebuilt`);
}

async function optionallyDeleteExtras(conn, firebaseCustomerIds) {
    if (process.env.DELETE_MYSQL_EXTRAS !== '1') return [];

    const [rows] = await conn.query('SELECT id FROM Customers');
    const extras = rows.map(row => row.id).filter(id => !firebaseCustomerIds.has(id));
    if (extras.length === 0) return [];

    for (let i = 0; i < extras.length; i += 250) {
        await conn.query('DELETE FROM Customers WHERE id IN (?)', [extras.slice(i, i + 250)]);
    }
    return extras;
}

async function verify(conn, customerDocs) {
    const firebaseCustomerIds = new Set(customerDocs.map(doc => doc.id));
    let fbFilled = 0;
    let fbInvoices = 0;
    let fbOrders = 0;
    let fbExceptions = 0;
    const fbInvoiceCounts = new Map();

    for (const doc of customerDocs) {
        const data = doc.data();
        if (data.process_status === 'FILLED_BY_ADMIN') fbFilled++;
        const invoices = Array.isArray(data.details?.invoices) ? data.details.invoices : [];
        fbInvoices += invoices.length;
        fbInvoiceCounts.set(doc.id, invoices.length);
        for (const invoice of invoices) {
            if (invoice.isException === true || invoice.isException === 'true') fbExceptions++;
            fbOrders += Array.isArray(invoice.orders) ? invoice.orders.length : 0;
        }
    }

    const [[myCustomers]] = await conn.query('SELECT COUNT(*) AS c FROM Customers');
    const [[myFilled]] = await conn.query("SELECT COUNT(*) AS c FROM Customers WHERE process_status = 'FILLED_BY_ADMIN'");
    const [[myInvoices]] = await conn.query('SELECT COUNT(*) AS c FROM CustomerInvoices');
    const [[myOrders]] = await conn.query('SELECT COUNT(*) AS c FROM InvoiceOrders');
    const [[myExceptions]] = await conn.query('SELECT COUNT(*) AS c FROM CustomerInvoices WHERE isException = 1');

    const [myInvoiceCounts] = await conn.query('SELECT customerId, COUNT(*) AS c FROM CustomerInvoices GROUP BY customerId');
    const myInvoiceCountMap = new Map(myInvoiceCounts.map(row => [row.customerId, Number(row.c)]));
    const mismatches = [];
    for (const [customerId, count] of fbInvoiceCounts.entries()) {
        const mysqlCount = myInvoiceCountMap.get(customerId) || 0;
        if (mysqlCount !== count) mismatches.push({ customerId, firebase: count, mysql: mysqlCount });
    }

    const [mysqlCustomerRows] = await conn.query('SELECT id FROM Customers');
    const mysqlOnly = mysqlCustomerRows.map(row => row.id).filter(id => !firebaseCustomerIds.has(id));

    const [sample543788] = await conn.query(
        'SELECT id, invoiceNumber, isException, exceptionProduct, exceptionProductQty, exceptionProducts, exceptionReturnedPrice FROM CustomerInvoices WHERE customerId = ? ORDER BY invoiceNumber',
        ['543788']
    );

    return {
        firebase: {
            customers: customerDocs.length,
            FILLED_BY_ADMIN: fbFilled,
            invoices: fbInvoices,
            orders: fbOrders,
            exceptions: fbExceptions
        },
        mysql: {
            customers: Number(myCustomers.c),
            FILLED_BY_ADMIN: Number(myFilled.c),
            invoices: Number(myInvoices.c),
            orders: Number(myOrders.c),
            exceptions: Number(myExceptions.c)
        },
        mysqlOnlyCustomers: mysqlOnly,
        invoiceMismatches: mismatches.slice(0, 20),
        invoiceMismatchCount: mismatches.length,
        sample543788
    };
}

async function deepVerifyCustomerDocuments(conn, customerDocs) {
    const storageMaps = await loadStorageUrlMap(conn);
    const [customerRows] = await conn.query('SELECT id, document_data FROM Customers');
    const mysqlCustomers = new Map(customerRows.map(row => [row.id, row]));

    const [invoiceRows] = await conn.query('SELECT id, customerId, document_data FROM CustomerInvoices');
    const mysqlInvoices = new Map(invoiceRows.map(row => [row.id, row]));

    const [orderRows] = await conn.query('SELECT id, invoiceId, document_data FROM InvoiceOrders');
    const mysqlOrders = new Map(orderRows.map(row => [row.id, row]));

    const customerDiffs = [];
    const invoiceDiffs = [];
    const orderDiffs = [];
    const missingCustomers = [];
    const usedInvoiceIds = new Set();
    const usedOrderIds = new Set();

    for (const doc of customerDocs) {
        const fbData = remapStorageUrls(toPlain(doc.data()), storageMaps.urlMap);
        const expectedCustomer = { id: doc.id, ...fbData };
        const mysqlCustomer = mysqlCustomers.get(doc.id);
        if (!mysqlCustomer) {
            missingCustomers.push(doc.id);
            continue;
        }

        const customerDiff = firstDiff(expectedCustomer, mysqlCustomer.document_data);
        if (customerDiff) {
            customerDiffs.push({ id: doc.id, diff: customerDiff });
        }

        const invoices = Array.isArray(fbData.details?.invoices) ? fbData.details.invoices : [];
        invoices.forEach((invoice, invoiceIndex) => {
            const invoiceId = invoiceSqlId(doc.id, invoice, invoiceIndex, usedInvoiceIds);
            const mysqlInvoice = mysqlInvoices.get(invoiceId);
            if (!mysqlInvoice) {
                invoiceDiffs.push({ customerId: doc.id, invoiceId, diff: { path: '$', expected: 'invoice exists', actual: 'missing' } });
                return;
            }

            const expectedInvoice = { ...invoice, id: invoiceId, firebaseId: invoice.id || null };
            if (expectedInvoice.archiveUrl && !expectedInvoice.archiveStorageId && storageMaps.idMap.has(expectedInvoice.archiveUrl)) {
                expectedInvoice.archiveStorageId = storageMaps.idMap.get(expectedInvoice.archiveUrl);
            }
            const invoiceDiff = firstDiff(expectedInvoice, mysqlInvoice.document_data);
            if (invoiceDiff) {
                invoiceDiffs.push({ customerId: doc.id, invoiceId, diff: invoiceDiff });
            }

            const orders = Array.isArray(invoice.orders) ? invoice.orders : [];
            orders.forEach((order, orderIndex) => {
                const orderId = orderSqlId(invoiceId, order, orderIndex, usedOrderIds);
                const mysqlOrder = mysqlOrders.get(orderId);
                if (!mysqlOrder) {
                    orderDiffs.push({ customerId: doc.id, invoiceId, orderId, diff: { path: '$', expected: 'order exists', actual: 'missing' } });
                    return;
                }

                const orderDiff = firstDiff({ ...order, id: orderId, firebaseId: order.id || null }, mysqlOrder.document_data);
                if (orderDiff) {
                    orderDiffs.push({ customerId: doc.id, invoiceId, orderId, diff: orderDiff });
                }
            });
        });
    }

    const firebaseCustomerIds = new Set(customerDocs.map(doc => doc.id));
    const mysqlOnlyCustomers = customerRows.map(row => row.id).filter(id => !firebaseCustomerIds.has(id));
    const mysqlOnlyInvoices = invoiceRows.map(row => row.id).filter(id => !usedInvoiceIds.has(id));
    const mysqlOnlyOrders = orderRows.map(row => row.id).filter(id => !usedOrderIds.has(id));

    return {
        customerDocumentDiffs: customerDiffs.length,
        invoiceDocumentDiffs: invoiceDiffs.length,
        orderDocumentDiffs: orderDiffs.length,
        missingCustomers: missingCustomers.length,
        mysqlOnlyCustomers: mysqlOnlyCustomers.length,
        mysqlOnlyInvoices: mysqlOnlyInvoices.length,
        mysqlOnlyOrders: mysqlOnlyOrders.length,
        samples: {
            customerDiffs: customerDiffs.slice(0, 3),
            invoiceDiffs: invoiceDiffs.slice(0, 3),
            orderDiffs: orderDiffs.slice(0, 3),
            missingCustomers: missingCustomers.slice(0, 10),
            mysqlOnlyCustomers: mysqlOnlyCustomers.slice(0, 10),
            mysqlOnlyInvoices: mysqlOnlyInvoices.slice(0, 10),
            mysqlOnlyOrders: mysqlOnlyOrders.slice(0, 10)
        }
    };
}

async function main() {
    const conn = await mysql.createConnection(MYSQL_URI);
    try {
        console.log('Ensuring MySQL schema can preserve Firebase-only fields...');
        await ensureSchema(conn);

        const genericTables = [
            ['Courts', 'Courts'],
            ['Stores', 'Stores'],
            ['Templates', 'Templates'],
            ['Users', 'Users'],
            ['GlobalSettings', 'GlobalSettings'],
            ['Settings', 'Settings'],
            ['SystemErrors', 'SystemErrors']
        ];

        if (process.env.SYNC_AUDIT_LOGS === '1') {
            genericTables.push(['AuditLogs', 'AuditLogs']);
        } else {
            console.log('AuditLogs skipped by default. Run with SYNC_AUDIT_LOGS=1 to backfill the full audit history.');
        }

        for (const [collectionName, tableName] of genericTables) {
            await syncGenericCollection(conn, collectionName, tableName, {
                missingOnly: collectionName === 'AuditLogs' && process.env.AUDIT_MISSING_ONLY === '1'
            });
        }

        const customerDocs = await fetchAllCustomers();
        await syncCustomers(conn, customerDocs);
        const firebaseCustomerIds = new Set(customerDocs.map(doc => doc.id));
        const deletedExtras = await optionallyDeleteExtras(conn, firebaseCustomerIds);
        if (deletedExtras.length > 0) {
            console.log(`Deleted MySQL-only customers: ${deletedExtras.join(', ')}`);
        }

        await syncInvoices(conn, customerDocs);

        const result = await verify(conn, customerDocs);
        console.log('\nVerification:');
        console.log(JSON.stringify(result, null, 2));

        const deepResult = await deepVerifyCustomerDocuments(conn, customerDocs);
        console.log('\nDeep customer document verification:');
        console.log(JSON.stringify(deepResult, null, 2));

        const hasDeepMismatch = Object.entries(deepResult)
            .filter(([key]) => key !== 'samples')
            .some(([, value]) => value !== 0);
        if (hasDeepMismatch) {
            process.exitCode = 1;
        }
    } finally {
        await conn.end();
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
