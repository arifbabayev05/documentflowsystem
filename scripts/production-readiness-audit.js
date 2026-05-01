const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const admin = require('firebase-admin');

const MYSQL_URI = 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev';
const STORAGE_BASE_URL = process.env.STORAGE_API_BASE_URL || 'http://10.10.10.127:11133/api/Storage';
const STORAGE_AUTH_TOKEN = process.env.STORAGE_API_TOKEN || 'uUotdJmwm132zjbb202dFKZkkoCf67n6mr6HgLyOvmUVK5oplN ';
const STORAGE_MODULE_NAME = process.env.STORAGE_API_MODULE || 'Common';
const STORAGE_BUCKET_NAME = process.env.STORAGE_API_BUCKET || 'Documents';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3017';

function ok(name, details = {}) {
    return { name, ok: true, ...details };
}

function fail(name, error, details = {}) {
    return { name, ok: false, error: error?.message || String(error), ...details };
}

function isFirebaseUrl(url) {
    return typeof url === 'string' && url.includes('firebasestorage.googleapis.com');
}

function isProxyUrl(url) {
    return typeof url === 'string' && url.startsWith('/api/storage/file/');
}

function parseJson(value, fallback) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

async function count(conn, sql, params = []) {
    const [[row]] = await conn.query(sql, params);
    return Number(row.c);
}

async function auditMysql(conn) {
    const results = [];

    const [[settings]] = await conn.query('SELECT dbMode FROM GlobalSettings WHERE id = "current"');
    results.push(ok('mysql.dbMode', { value: settings?.dbMode }));

    const tables = ['Customers', 'CustomerInvoices', 'InvoiceOrders', 'StorageFiles', 'GlobalSettings', 'Users', 'Courts', 'Stores', 'Templates'];
    const tableCounts = {};
    for (const table of tables) {
        tableCounts[table] = await count(conn, `SELECT COUNT(*) AS c FROM \`${table}\``);
    }
    results.push(ok('mysql.tableCounts', { tableCounts }));

    const customersWithoutRaw = await count(conn, 'SELECT COUNT(*) AS c FROM Customers WHERE document_data IS NULL');
    const invoicesWithoutRaw = await count(conn, 'SELECT COUNT(*) AS c FROM CustomerInvoices WHERE document_data IS NULL');
    const ordersWithoutRaw = await count(conn, 'SELECT COUNT(*) AS c FROM InvoiceOrders WHERE document_data IS NULL');
    results.push(customersWithoutRaw === 0 && invoicesWithoutRaw === 0 && ordersWithoutRaw === 0
        ? ok('mysql.rawBackups', { customersWithoutRaw, invoicesWithoutRaw, ordersWithoutRaw })
        : fail('mysql.rawBackups', 'missing raw document_data', { customersWithoutRaw, invoicesWithoutRaw, ordersWithoutRaw }));

    const orphanInvoices = await count(conn, `
        SELECT COUNT(*) AS c FROM CustomerInvoices ci
        LEFT JOIN Customers c ON c.id = ci.customerId
        WHERE c.id IS NULL
    `);
    const orphanOrders = await count(conn, `
        SELECT COUNT(*) AS c FROM InvoiceOrders io
        LEFT JOIN CustomerInvoices ci ON ci.id = io.invoiceId
        WHERE ci.id IS NULL
    `);
    results.push(orphanInvoices === 0 && orphanOrders === 0
        ? ok('mysql.foreignKeyIntegrity', { orphanInvoices, orphanOrders })
        : fail('mysql.foreignKeyIntegrity', 'orphan records found', { orphanInvoices, orphanOrders }));

    const filled = await count(conn, "SELECT COUNT(*) AS c FROM Customers WHERE process_status = 'FILLED_BY_ADMIN'");
    const exceptions = await count(conn, 'SELECT COUNT(*) AS c FROM CustomerInvoices WHERE isException = 1');
    results.push(ok('mysql.businessCounts', { FILLED_BY_ADMIN: filled, exceptions }));

    const invoiceFirebaseUrls = await count(conn, "SELECT COUNT(*) AS c FROM CustomerInvoices WHERE archiveUrl LIKE '%firebasestorage.googleapis.com%'");
    const invoiceProxyUrls = await count(conn, "SELECT COUNT(*) AS c FROM CustomerInvoices WHERE archiveUrl LIKE '/api/storage/file/%'");
    const [customerRows] = await conn.query('SELECT details FROM Customers');
    let receiptFirebaseUrls = 0;
    let postageFirebaseUrls = 0;
    let generatedDocFirebaseUrls = 0;
    let generatedDocProxyUrls = 0;
    for (const row of customerRows) {
        const details = parseJson(row.details, {});
        if (isFirebaseUrl(details.receiptUrl)) receiptFirebaseUrls++;
        if (isFirebaseUrl(details.postageUrl)) postageFirebaseUrls++;
        if (Array.isArray(details.generatedDocs)) {
            generatedDocFirebaseUrls += details.generatedDocs.filter(doc => isFirebaseUrl(doc?.url)).length;
            generatedDocProxyUrls += details.generatedDocs.filter(doc => isProxyUrl(doc?.url)).length;
        }
    }
    const remainingFirebaseStorageUrls = invoiceFirebaseUrls + receiptFirebaseUrls + postageFirebaseUrls + generatedDocFirebaseUrls;
    results.push(remainingFirebaseStorageUrls === 0
        ? ok('mysql.storageUrlCutover', { remainingFirebaseStorageUrls, invoiceProxyUrls, generatedDocProxyUrls })
        : fail('mysql.storageUrlCutover', 'Firebase Storage URLs remain in MySQL', {
            invoiceFirebaseUrls, receiptFirebaseUrls, postageFirebaseUrls, generatedDocFirebaseUrls
        }));

    return results;
}

async function auditStorageApi(conn) {
    const results = [];
    const testFile = path.join(process.cwd(), 'node_modules', 'mammoth', 'test', 'test-data', 'tiny-picture.png');
    const fileBuffer = fs.readFileSync(testFile);

    let uploadedId = null;
    try {
        const form = new FormData();
        form.append('File', new Blob([fileBuffer], { type: 'image/png' }), 'production-readiness.png');
        const url = new URL(`${STORAGE_BASE_URL}/File`);
        url.searchParams.set('ModuleName', STORAGE_MODULE_NAME);
        url.searchParams.set('BucketName', STORAGE_BUCKET_NAME);
        url.searchParams.set('Directory', 'Legal12ReadinessAudit');
        const upload = await fetch(url, {
            method: 'POST',
            headers: { accept: 'text/plain', Authorization: STORAGE_AUTH_TOKEN },
            body: form
        });
        const body = await upload.text();
        if (!upload.ok) throw new Error(`upload ${upload.status}: ${body}`);
        const info = JSON.parse(body);
        uploadedId = info.id;

        const fileInfo = await fetch(`${STORAGE_BASE_URL}/FileInfo/${uploadedId}`, {
            headers: { accept: '*/*', Authorization: STORAGE_AUTH_TOKEN }
        });
        const fileInfoJson = await fileInfo.json();
        if (!fileInfo.ok || Number(fileInfoJson.fileSize) !== fileBuffer.length) {
            throw new Error(`fileInfo mismatch status=${fileInfo.status} size=${fileInfoJson.fileSize}`);
        }

        const download = await fetch(`${STORAGE_BASE_URL}/File/${uploadedId}`, {
            headers: { accept: '*/*', Authorization: STORAGE_AUTH_TOKEN }
        });
        const downloaded = Buffer.from(await download.arrayBuffer());
        if (!download.ok || downloaded.length !== fileBuffer.length) {
            throw new Error(`download mismatch status=${download.status} bytes=${downloaded.length}`);
        }

        results.push(ok('storageApi.uploadInfoDownload', { uploadedId, bytes: downloaded.length }));
    } catch (error) {
        results.push(fail('storageApi.uploadInfoDownload', error, { uploadedId }));
    } finally {
        if (uploadedId) {
            try {
                const del = await fetch(`${STORAGE_BASE_URL}/File/${uploadedId}`, {
                    method: 'DELETE',
                    headers: { accept: '*/*', Authorization: STORAGE_AUTH_TOKEN }
                });
                results.push(del.ok ? ok('storageApi.delete', { uploadedId, status: del.status }) : fail('storageApi.delete', `status ${del.status}`, { uploadedId }));
            } catch (error) {
                results.push(fail('storageApi.delete', error, { uploadedId }));
            }
        }
    }

    try {
        const [samples] = await conn.query('SELECT id, fileName, fileSize FROM StorageFiles ORDER BY RAND() LIMIT 5');
        const checked = [];
        for (const sample of samples) {
            const response = await fetch(`${STORAGE_BASE_URL}/FileInfo/${sample.id}`, {
                headers: { accept: '*/*', Authorization: STORAGE_AUTH_TOKEN }
            });
            const info = await response.json();
            if (!response.ok || Number(info.fileSize) !== Number(sample.fileSize)) {
                throw new Error(`sample mismatch ${sample.id}: status=${response.status} expected=${sample.fileSize} actual=${info.fileSize}`);
            }
            checked.push({ id: sample.id, expectedSize: Number(sample.fileSize), apiSize: Number(info.fileSize) });
        }
        results.push(ok('storageApi.migratedSamples', { checked }));
    } catch (error) {
        results.push(fail('storageApi.migratedSamples', error));
    }

    return results;
}

async function auditAppProxy() {
    const results = [];
    const testFile = path.join(process.cwd(), 'node_modules', 'mammoth', 'test', 'test-data', 'tiny-picture.png');
    const fileBuffer = fs.readFileSync(testFile);
    let uploadedId = null;

    try {
        const form = new FormData();
        form.append('file', new Blob([fileBuffer], { type: 'image/png' }), 'proxy-readiness.png');
        form.append('fileName', 'proxy-readiness.png');
        form.append('directory', 'Legal12ProxyReadinessAudit');
        const upload = await fetch(`${APP_BASE_URL}/api/storage/upload`, { method: 'POST', body: form });
        const data = await upload.json();
        if (!upload.ok || !data.id) throw new Error(`proxy upload ${upload.status}: ${JSON.stringify(data)}`);
        uploadedId = data.id;

        const info = await fetch(`${APP_BASE_URL}/api/storage/file-info/${uploadedId}`);
        const infoJson = await info.json();
        if (!info.ok || Number(infoJson.fileSize) !== fileBuffer.length) {
            throw new Error(`proxy fileInfo mismatch status=${info.status} size=${infoJson.fileSize}`);
        }

        const download = await fetch(`${APP_BASE_URL}/api/storage/file/${uploadedId}`);
        const downloaded = Buffer.from(await download.arrayBuffer());
        if (!download.ok || downloaded.length !== fileBuffer.length) {
            throw new Error(`proxy download mismatch status=${download.status} bytes=${downloaded.length}`);
        }

        results.push(ok('appProxy.uploadInfoDownload', { uploadedId, url: data.url, bytes: downloaded.length }));
    } catch (error) {
        results.push(fail('appProxy.uploadInfoDownload', error, { uploadedId }));
    } finally {
        if (uploadedId) {
            try {
                const del = await fetch(`${APP_BASE_URL}/api/storage/file/${uploadedId}`, { method: 'DELETE' });
                results.push(del.status === 204 ? ok('appProxy.delete', { uploadedId, status: del.status }) : fail('appProxy.delete', `status ${del.status}`, { uploadedId }));
            } catch (error) {
                results.push(fail('appProxy.delete', error, { uploadedId }));
            }
        }
    }

    return results;
}

async function fetchAllFirebaseCustomerDocs(firestore) {
    const docs = [];
    let query = firestore.collection('Customers').orderBy(admin.firestore.FieldPath.documentId()).limit(500);

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

async function auditCustomerSourceParity(conn, firestore) {
    try {
        const docs = await fetchAllFirebaseCustomerDocs(firestore);
        const firebaseIds = new Set(docs.map(doc => doc.id));
        const firebase = {
            customers: docs.length,
            invoices: 0,
            orders: 0,
            FILLED_BY_ADMIN: 0,
            exceptions: 0
        };

        for (const doc of docs) {
            const data = doc.data() || {};
            if (data.process_status === 'FILLED_BY_ADMIN') firebase.FILLED_BY_ADMIN++;
            const invoices = Array.isArray(data.details?.invoices) ? data.details.invoices : [];
            firebase.invoices += invoices.length;
            for (const invoice of invoices) {
                if (invoice?.isException === true || invoice?.isException === 'true' || invoice?.isException === 1 || invoice?.isException === '1') {
                    firebase.exceptions++;
                }
                firebase.orders += Array.isArray(invoice?.orders) ? invoice.orders.length : 0;
            }
        }

        const mysql = {
            customers: await count(conn, 'SELECT COUNT(*) AS c FROM Customers'),
            invoices: await count(conn, 'SELECT COUNT(*) AS c FROM CustomerInvoices'),
            orders: await count(conn, 'SELECT COUNT(*) AS c FROM InvoiceOrders'),
            FILLED_BY_ADMIN: await count(conn, "SELECT COUNT(*) AS c FROM Customers WHERE process_status = 'FILLED_BY_ADMIN'"),
            exceptions: await count(conn, 'SELECT COUNT(*) AS c FROM CustomerInvoices WHERE isException = 1')
        };

        const [mysqlRows] = await conn.query('SELECT id FROM Customers');
        const mysqlIds = new Set(mysqlRows.map(row => row.id));
        const missingInMysql = docs.map(doc => doc.id).filter(id => !mysqlIds.has(id));
        const mysqlOnly = mysqlRows.map(row => row.id).filter(id => !firebaseIds.has(id));
        const okCounts = Object.keys(firebase).every(key => Number(firebase[key]) === Number(mysql[key]));
        const okIds = missingInMysql.length === 0 && mysqlOnly.length === 0;

        return okCounts && okIds
            ? ok('firebaseMysql.customerSourceParity', { firebase, mysql, missingInMysql, mysqlOnly })
            : fail('firebaseMysql.customerSourceParity', 'Firebase Customers and MySQL Customers are not identical by count/id coverage', {
                firebase,
                mysql,
                missingInMysql: missingInMysql.slice(0, 10),
                mysqlOnly: mysqlOnly.slice(0, 10),
                missingInMysqlCount: missingInMysql.length,
                mysqlOnlyCount: mysqlOnly.length
            });
    } catch (error) {
        return fail('firebaseMysql.customerSourceParity', error);
    }
}

async function auditFirebase(conn) {
    const results = [];
    try {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(require('./serviceAccountKey.json'))
            });
        }
        const firestore = admin.firestore();
        const customers = await firestore.collection('Customers').count().get();
        const globalSettings = await firestore.collection('GlobalSettings').doc('current').get();
        results.push(ok('firebase.firestoreRead', {
            customers: customers.data().count,
            globalSettingsExists: globalSettings.exists,
            dbMode: globalSettings.exists ? globalSettings.data().dbMode || null : null
        }));
        results.push(await auditCustomerSourceParity(conn, firestore));
    } catch (error) {
        results.push(fail('firebase.firestoreRead', error));
    }

    try {
        const [samples] = await conn.query('SELECT oldUrl, fileSize FROM StorageFiles WHERE oldUrl LIKE ? ORDER BY RAND() LIMIT 3', ['%firebasestorage.googleapis.com%']);
        const checked = [];
        for (const sample of samples) {
            const response = await fetch(sample.oldUrl);
            if (!response.ok) throw new Error(`Firebase Storage oldUrl failed ${response.status}`);
            const bytes = Buffer.from(await response.arrayBuffer()).length;
            checked.push({ status: response.status, expectedSize: Number(sample.fileSize), bytes });
        }
        results.push(ok('firebase.storageOldUrlRead', { checked }));
    } catch (error) {
        results.push(fail('firebase.storageOldUrlRead', error));
    }

    return results;
}

async function main() {
    const conn = await mysql.createConnection(MYSQL_URI);
    try {
        const groups = {
            mysql: await auditMysql(conn),
            storageApi: await auditStorageApi(conn),
            appProxy: await auditAppProxy(),
            firebase: await auditFirebase(conn)
        };

        const summary = {};
        for (const [group, checks] of Object.entries(groups)) {
            summary[group] = {
                passed: checks.filter(check => check.ok).length,
                failed: checks.filter(check => !check.ok).length
            };
        }

        const report = {
            generatedAt: new Date().toISOString(),
            appBaseUrl: APP_BASE_URL,
            summary,
            groups
        };

        console.log(JSON.stringify(report, null, 2));

        const failed = Object.values(groups).flat().some(check => !check.ok);
        if (failed) process.exitCode = 1;
    } finally {
        await conn.end();
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
