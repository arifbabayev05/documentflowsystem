const mysql = require('mysql2/promise');

const MYSQL_URI = 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev';
const STORAGE_BASE_URL = process.env.STORAGE_API_BASE_URL || 'http://10.10.10.127:11133/api/Storage';
const STORAGE_AUTH_TOKEN = process.env.STORAGE_API_TOKEN || 'uUotdJmwm132zjbb202dFKZkkoCf67n6mr6HgLyOvmUVK5oplN ';
const STORAGE_MODULE_NAME = process.env.STORAGE_API_MODULE || 'Common';
const STORAGE_BUCKET_NAME = process.env.STORAGE_API_BUCKET || 'Documents';
const CONCURRENCY = Number(process.env.STORAGE_MIGRATION_CONCURRENCY || 8);
const LIMIT = Number(process.env.STORAGE_MIGRATION_LIMIT || 0);

function isFirebaseStorageUrl(url) {
    return typeof url === 'string' && url.includes('firebasestorage.googleapis.com');
}

function storageProxyUrl(id) {
    return `/api/storage/file/${encodeURIComponent(id)}`;
}

function parseJson(value, fallback) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

function firebasePathFromUrl(url) {
    try {
        const parsed = new URL(url);
        const marker = '/o/';
        const idx = parsed.pathname.indexOf(marker);
        if (idx === -1) return null;
        return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
    } catch {
        return null;
    }
}

function fileNameFromUrl(url, fallback = 'file') {
    const path = firebasePathFromUrl(url);
    if (!path) return fallback;
    return path.split('/').pop() || fallback;
}

function directoryFromFirebaseUrl(url, fallback = 'Legal12') {
    const path = firebasePathFromUrl(url);
    if (!path) return fallback;
    const parts = path.split('/');
    parts.pop();
    return ['Legal12', ...parts]
        .map(part => part.trim())
        .filter(Boolean)
        .join('/') || fallback;
}

async function ensureSchema(conn) {
    await conn.query(`
        CREATE TABLE IF NOT EXISTS StorageFiles (
            id VARCHAR(255) PRIMARY KEY,
            oldUrl TEXT,
            newUrl TEXT,
            fileName TEXT,
            directory TEXT,
            mimeType VARCHAR(255),
            fileSize BIGINT,
            ownerType VARCHAR(255),
            ownerId VARCHAR(255),
            fieldPath VARCHAR(255),
            createdAt VARCHAR(255),
            metadata JSON
        )
    `);

    const [invoiceCols] = await conn.query('DESCRIBE CustomerInvoices');
    if (!invoiceCols.some(col => col.Field === 'archiveStorageId')) {
        await conn.query('ALTER TABLE CustomerInvoices ADD COLUMN `archiveStorageId` VARCHAR(255) NULL');
    }
}

async function uploadDownloadedFile(buffer, fileName, mimeType, directory) {
    const form = new FormData();
    const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
    form.append('File', blob, fileName);

    const url = new URL(`${STORAGE_BASE_URL}/File`);
    url.searchParams.set('ModuleName', STORAGE_MODULE_NAME);
    url.searchParams.set('BucketName', STORAGE_BUCKET_NAME);
    url.searchParams.set('Directory', directory || 'Legal12');

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            accept: 'text/plain',
            Authorization: STORAGE_AUTH_TOKEN
        },
        body: form
    });

    const text = await res.text();
    if (!res.ok) {
        throw new Error(`upload failed ${res.status}: ${text}`);
    }

    const info = JSON.parse(text);
    if (!info.id) throw new Error(`upload response missing id: ${text}`);
    return info;
}

async function migrateOne(conn, item) {
    const [existing] = await conn.query('SELECT id, newUrl FROM StorageFiles WHERE oldUrl = ? LIMIT 1', [item.oldUrl]);
    let info;
    if (existing.length > 0) {
        info = { id: existing[0].id, newUrl: existing[0].newUrl, reused: true };
    } else {
        const download = await fetch(item.oldUrl);
        if (!download.ok) {
            throw new Error(`download failed ${download.status}`);
        }
        const buffer = Buffer.from(await download.arrayBuffer());
        const mimeType = download.headers.get('content-type') || item.mimeType || 'application/octet-stream';
        const fileName = item.fileName || fileNameFromUrl(item.oldUrl, 'file');
        const directory = item.directory || directoryFromFirebaseUrl(item.oldUrl);
        const uploaded = await uploadDownloadedFile(buffer, fileName, mimeType, directory);
        info = { ...uploaded, newUrl: storageProxyUrl(uploaded.id) };

        await conn.query(`
            INSERT INTO StorageFiles (
                id, oldUrl, newUrl, fileName, directory, mimeType, fileSize,
                ownerType, ownerId, fieldPath, createdAt, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE oldUrl = VALUES(oldUrl), newUrl = VALUES(newUrl), metadata = VALUES(metadata)
        `, [
            info.id,
            item.oldUrl,
            info.newUrl,
            fileName,
            directory,
            mimeType,
            uploaded.fileSize || buffer.length,
            item.ownerType,
            item.ownerId,
            item.fieldPath,
            new Date().toISOString(),
            JSON.stringify({ uploaded, source: item })
        ]);
    }

    await item.apply(info);
    return info;
}

async function runPool(items, worker) {
    let index = 0;
    let done = 0;
    let failed = 0;
    const failures = [];

    async function next() {
        while (index < items.length) {
            const item = items[index++];
            try {
                await worker(item);
                done++;
            } catch (error) {
                failed++;
                failures.push({ ownerType: item.ownerType, ownerId: item.ownerId, fieldPath: item.fieldPath, oldUrl: item.oldUrl, error: error.message });
            }

            if ((done + failed) % 100 === 0 || done + failed === items.length) {
                console.log(`progress ${done + failed}/${items.length} done=${done} failed=${failed}`);
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, next));
    return { done, failed, failures };
}

async function main() {
    const conn = await mysql.createConnection(MYSQL_URI);
    await ensureSchema(conn);

    const items = [];

    const [invoiceRows] = await conn.query('SELECT id, customerId, archiveUrl, archiveName, document_data FROM CustomerInvoices');
    for (const row of invoiceRows) {
        if (!isFirebaseStorageUrl(row.archiveUrl)) continue;
        const doc = parseJson(row.document_data, {});
        items.push({
            oldUrl: row.archiveUrl,
            fileName: row.archiveName || fileNameFromUrl(row.archiveUrl, `${row.id}.pdf`),
            directory: directoryFromFirebaseUrl(row.archiveUrl, `Legal12/UploadedPDFs/${row.customerId}`),
            ownerType: 'CustomerInvoice',
            ownerId: row.id,
            fieldPath: 'archiveUrl',
            apply: async (info) => {
                doc.archiveUrl = info.newUrl;
                doc.archiveStorageId = info.id;
                doc.archiveFirebaseUrl = row.archiveUrl;
                await conn.query(
                    'UPDATE CustomerInvoices SET archiveUrl = ?, archiveStorageId = ?, document_data = ? WHERE id = ?',
                    [info.newUrl, info.id, JSON.stringify(doc), row.id]
                );
            }
        });
    }

    const [customerRows] = await conn.query('SELECT id, details, document_data FROM Customers');
    for (const row of customerRows) {
        const details = parseJson(row.details, {});
        const documentData = parseJson(row.document_data, { id: row.id, details: {} });
        if (!documentData.details || typeof documentData.details !== 'object') documentData.details = {};

        function pushCustomerFile(field, storageField) {
            const oldUrl = details[field];
            if (!isFirebaseStorageUrl(oldUrl)) return;
            items.push({
                oldUrl,
                fileName: fileNameFromUrl(oldUrl, `${field}.jpg`),
                directory: directoryFromFirebaseUrl(oldUrl, `Legal12/Customers/${row.id}`),
                ownerType: 'Customer',
                ownerId: row.id,
                fieldPath: `details.${field}`,
                apply: async (info) => {
                    details[field] = info.newUrl;
                    details[storageField] = info.id;
                    details[`${field}FirebaseUrl`] = oldUrl;
                    documentData.details[field] = info.newUrl;
                    documentData.details[storageField] = info.id;
                    documentData.details[`${field}FirebaseUrl`] = oldUrl;
                    await conn.query('UPDATE Customers SET details = ?, document_data = ? WHERE id = ?', [JSON.stringify(details), JSON.stringify(documentData), row.id]);
                }
            });
        }

        pushCustomerFile('receiptUrl', 'receiptStorageId');
        pushCustomerFile('postageUrl', 'postageStorageId');

        if (Array.isArray(details.generatedDocs)) {
            details.generatedDocs.forEach((docItem, docIndex) => {
                if (!isFirebaseStorageUrl(docItem?.url)) return;
                const oldUrl = docItem.url;
                items.push({
                    oldUrl,
                    fileName: docItem.name || fileNameFromUrl(oldUrl, `generated-${docIndex}.docx`),
                    directory: directoryFromFirebaseUrl(oldUrl, `Legal12/Customers/${row.id}/GeneratedDocs`),
                    ownerType: 'Customer',
                    ownerId: row.id,
                    fieldPath: `details.generatedDocs[${docIndex}].url`,
                    apply: async (info) => {
                        details.generatedDocs[docIndex] = {
                            ...details.generatedDocs[docIndex],
                            url: info.newUrl,
                            storageId: info.id,
                            firebaseUrl: oldUrl
                        };
                        if (Array.isArray(documentData.details.generatedDocs) && documentData.details.generatedDocs[docIndex]) {
                            documentData.details.generatedDocs[docIndex] = {
                                ...documentData.details.generatedDocs[docIndex],
                                url: info.newUrl,
                                storageId: info.id,
                                firebaseUrl: oldUrl
                            };
                        }
                        await conn.query('UPDATE Customers SET details = ?, document_data = ? WHERE id = ?', [JSON.stringify(details), JSON.stringify(documentData), row.id]);
                    }
                });
            });
        }
    }

    const workItems = LIMIT > 0 ? items.slice(0, LIMIT) : items;
    console.log(`Firebase Storage URLs found: ${items.length}; migrating: ${workItems.length}; concurrency=${CONCURRENCY}`);

    const result = await runPool(workItems, item => migrateOne(conn, item));
    console.log(JSON.stringify(result, null, 2));

    const [[invoiceRemaining]] = await conn.query("SELECT COUNT(*) AS c FROM CustomerInvoices WHERE archiveUrl LIKE '%firebasestorage.googleapis.com%'");
    const [customersAfter] = await conn.query('SELECT details FROM Customers');
    let generatedRemaining = 0;
    let receiptRemaining = 0;
    let postageRemaining = 0;
    for (const row of customersAfter) {
        const details = parseJson(row.details, {});
        if (isFirebaseStorageUrl(details.receiptUrl)) receiptRemaining++;
        if (isFirebaseStorageUrl(details.postageUrl)) postageRemaining++;
        if (Array.isArray(details.generatedDocs)) {
            generatedRemaining += details.generatedDocs.filter(doc => isFirebaseStorageUrl(doc?.url)).length;
        }
    }

    console.log(JSON.stringify({
        remaining: {
            invoiceArchiveFirebaseUrls: Number(invoiceRemaining.c),
            receiptFirebaseUrls: receiptRemaining,
            postageFirebaseUrls: postageRemaining,
            generatedDocFirebaseUrls: generatedRemaining
        }
    }, null, 2));

    await conn.end();
    if (result.failed > 0) process.exitCode = 1;
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
