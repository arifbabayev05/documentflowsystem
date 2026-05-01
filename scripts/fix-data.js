/**
 * fix-data.js — Firebase → MySQL FULL Data Sync Tool
 * 
 * Bu skript hər çalışdırıldığında:
 * 1. Firebase-dəki BÜTÜN kolleksiyaları MySQL ilə tutuşdurur
 * 2. Əksik müştəriləri insert edir
 * 3. BÜTÜN müştərilərin process_status, details və digər sahələrini Firebase-dən oxuyub MySQL-i güncəlləyir
 * 4. BÜTÜN faktura və order-ləri Firebase-dən oxuyub MySQL-ə yenidən yazır (tam re-sync)
 * 5. Digər cədvəlləri (Courts, Stores, Templates, Users, GlobalSettings) eyniləşdirir
 * 6. Təkrar çalışdırıldıqda yalnız əksikləri tamamlayır (idempotent)
 */

const admin = require('firebase-admin');
const mysql = require('mysql2/promise');

// Firebase Admin SDK init
const serviceAccount = require('./serviceAccountKey.json');
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const fbDb = admin.firestore();

// MySQL connection
const MYSQL_URI = 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev';

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

const BOOL_FIELDS = ['isArchived', 'fullData', '_forceReplaceInvoices', '_isArchivePart', 'isWarningSent'];

function fbTimestampToISO(val) {
    if (!val) return null;
    if (val._seconds !== undefined) return new Date(val._seconds * 1000).toISOString();
    if (val.toDate) return val.toDate().toISOString();
    if (typeof val === 'string') return val;
    return null;
}

function cleanVal(val) {
    if (val === undefined || val === null) return null;
    if (val && val._methodName === 'serverTimestamp') return new Date().toISOString();
    if (val && (val._seconds !== undefined || val.toDate)) return fbTimestampToISO(val);
    return val;
}

/**
 * Firebase müştəri datasını MySQL formatına çevirir
 */
function normalizeCustomer(id, fbData) {
    const result = { id };
    
    // Root-level sahələri kopyala
    for (const col of CUSTOMER_COLUMNS) {
        if (col === 'details' || col === 'statusHistory') continue;
        if (fbData[col] !== undefined) {
            result[col] = cleanVal(fbData[col]);
        }
    }
    
    // details-in içindəki root column sahələrini çıxar
    if (fbData.details && typeof fbData.details === 'object') {
        for (const col of CUSTOMER_COLUMNS) {
            if (col === 'details' || col === 'statusHistory') continue;
            if (fbData.details[col] !== undefined && (result[col] === undefined || result[col] === null)) {
                result[col] = cleanVal(fbData.details[col]);
            }
        }
    }
    
    // Clean details JSON — yalnız non-root sahələri saxla
    const cleanDetails = {};
    if (fbData.details && typeof fbData.details === 'object') {
        for (const [key, value] of Object.entries(fbData.details)) {
            if (key === 'invoices') continue;
            if (CUSTOMER_COLUMNS.includes(key)) continue;
            if (key === 'statusHistory') continue;
            cleanDetails[key] = cleanVal(value);
        }
    }
    result.details = JSON.stringify(cleanDetails);
    
    // StatusHistory
    let statusHistory = fbData.statusHistory || [];
    if (fbData.details?.statusHistory && !fbData.statusHistory) {
        statusHistory = fbData.details.statusHistory;
    }
    if (Array.isArray(statusHistory)) {
        statusHistory = statusHistory.map(sh => ({
            ...sh,
            timestamp: cleanVal(sh.timestamp)
        }));
    }
    result.statusHistory = JSON.stringify(statusHistory);
    
    // Boolean sahələri
    for (const bf of BOOL_FIELDS) {
        if (result[bf] !== undefined && result[bf] !== null) {
            result[bf] = (result[bf] === true || result[bf] === '1' || result[bf] === 1 || result[bf] === 'true') ? '1' : '0';
        }
    }
    
    result.createdAt = result.createdAt || new Date().toISOString();
    result.updatedAt = result.updatedAt || new Date().toISOString();
    
    // Fakturalar
    const invoices = fbData.details?.invoices || [];
    
    return { customer: result, invoices };
}

async function main() {
    const pool = await mysql.createPool({
        uri: MYSQL_URI,
        waitForConnections: true,
        connectionLimit: 10
    });
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Firebase → MySQL TAM Data Sync');
    console.log('  ' + new Date().toISOString());
    console.log('═══════════════════════════════════════════════════════\n');

    // ==========================================
    // ADDIM 1: Sadə cədvəlləri sinxronizasiya et
    // ==========================================
    const simpleTables = [
        { fb: 'Courts', mysql: 'Courts' },
        { fb: 'Stores', mysql: 'Stores' },
        { fb: 'Templates', mysql: 'Templates' },
        { fb: 'Users', mysql: 'Users' },
        { fb: 'GlobalSettings', mysql: 'GlobalSettings' },
    ];

    for (const table of simpleTables) {
        console.log(`\n── ${table.fb} ──`);
        const fbSnap = await fbDb.collection(table.fb).get();
        const fbDocs = {};
        fbSnap.forEach(doc => { fbDocs[doc.id] = { id: doc.id, ...doc.data() }; });
        
        const [myRows] = await pool.query(`SELECT * FROM \`${table.mysql}\``);
        const myIds = new Set(myRows.map(r => r.id));
        
        const fbIds = Object.keys(fbDocs);
        const missing = fbIds.filter(id => !myIds.has(id));
        
        console.log(`  Firebase: ${fbIds.length} | MySQL: ${myIds.size} | Əksik: ${missing.length}`);
        
        if (missing.length > 0) {
            const [colInfo] = await pool.query(`DESCRIBE \`${table.mysql}\``);
            const myCols = colInfo.map(c => c.Field);
            
            for (const id of missing) {
                try {
                    const fbDoc = fbDocs[id];
                    const insertCols = ['id'];
                    const insertVals = [id];
                    for (const col of myCols) {
                        if (col === 'id') continue;
                        let val = fbDoc[col];
                        val = cleanVal(val);
                        if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
                        if (typeof val === 'boolean') val = val ? '1' : '0';
                        insertCols.push(`\`${col}\``);
                        insertVals.push(val === undefined ? null : val);
                    }
                    await pool.query(
                        `INSERT INTO \`${table.mysql}\` (${insertCols.join(', ')}) VALUES (${insertVals.map(() => '?').join(', ')})`,
                        insertVals
                    );
                    console.log(`    ✓ ${id}`);
                } catch (e) {
                    console.error(`    ✗ ${id}: ${e.message}`);
                }
            }
        }
    }

    // ==========================================
    // ADDIM 2: BÜTÜN müştəriləri Firebase-dən oxu
    // ==========================================
    console.log('\n\n══ CUSTOMERS — TAM SİNXRONİZASİYA ══');
    
    const fbCustSnap = await fbDb.collection('Customers').get();
    const fbCustomers = {};
    fbCustSnap.forEach(doc => {
        fbCustomers[doc.id] = { id: doc.id, ...doc.data() };
    });
    const fbCustIds = Object.keys(fbCustomers);
    console.log(`  Firebase müştəri sayı: ${fbCustIds.length}`);
    
    // MySQL-dəki mövcud müştəriləri al
    const [myCustRows] = await pool.query('SELECT id FROM Customers');
    const myCustomerIds = new Set(myCustRows.map(r => r.id));
    console.log(`  MySQL müştəri sayı: ${myCustomerIds.size}`);
    
    // ==========================================
    // ADDIM 3: Əksik müştəriləri insert et
    // ==========================================
    const missingCusts = fbCustIds.filter(id => !myCustomerIds.has(id));
    if (missingCusts.length > 0) {
        console.log(`\n  ⚠ ${missingCusts.length} əksik müştəri insert edilir...`);
        let ins = 0;
        for (const id of missingCusts) {
            try {
                const { customer } = normalizeCustomer(id, fbCustomers[id]);
                const cols = CUSTOMER_COLUMNS.filter(c => customer[c] !== undefined);
                const colStr = cols.map(c => `\`${c}\``).join(', ');
                const ph = cols.map(() => '?').join(', ');
                const vals = cols.map(c => customer[c] === undefined ? null : customer[c]);
                await pool.query(`INSERT INTO Customers (${colStr}) VALUES (${ph})`, vals);
                ins++;
            } catch (e) {
                console.error(`    ✗ Insert ${id}: ${e.message}`);
            }
        }
        console.log(`  ✓ ${ins} müştəri insert edildi`);
    }

    // ==========================================
    // ADDIM 4: BÜTÜN müştərilərin sahələrini güncəllə 
    //          (process_status, details, executorName, etc.)
    // ==========================================
    console.log('\n  Bütün müştərilərin sahələri güncəllənir (process_status, etc.)...');
    let updCount = 0;
    let updErr = 0;
    
    // Batch ilə UPDATE — hər bir müştəri üçün
    const BATCH_SIZE = 100;
    for (let i = 0; i < fbCustIds.length; i += BATCH_SIZE) {
        const batch = fbCustIds.slice(i, i + BATCH_SIZE);
        
        for (const id of batch) {
            try {
                const { customer } = normalizeCustomer(id, fbCustomers[id]);
                const updateCols = CUSTOMER_COLUMNS.filter(c => c !== 'id' && customer[c] !== undefined);
                if (updateCols.length === 0) continue;
                
                const setStr = updateCols.map(c => `\`${c}\` = ?`).join(', ');
                const vals = updateCols.map(c => customer[c]);
                vals.push(id);
                
                await pool.query(`UPDATE Customers SET ${setStr} WHERE id = ?`, vals);
                updCount++;
            } catch (e) {
                updErr++;
                if (updErr <= 5) console.error(`    ✗ Update ${id}: ${e.message}`);
            }
        }
        
        if ((i + BATCH_SIZE) % 1000 === 0 || i + BATCH_SIZE >= fbCustIds.length) {
            console.log(`    ... ${Math.min(i + BATCH_SIZE, fbCustIds.length)}/${fbCustIds.length}`);
        }
    }
    console.log(`  ✓ ${updCount} müştəri güncəlləndi, ${updErr} xəta`);

    // ==========================================
    // ADDIM 5: BÜTÜN faturaları Firebase-dən MySQL-ə TAM re-sync
    // ==========================================
    console.log('\n\n══ FAKTURALAR — TAM RE-SYNC ══');
    
    // Əvvəlcə bütün mövcud MySQL invoice-ları say
    const [oldInvCount] = await pool.query('SELECT COUNT(*) as c FROM CustomerInvoices');
    console.log(`  Mövcud MySQL faktura sayı: ${oldInvCount[0].c}`);
    
    let totalFbInvoices = 0;
    let totalInsertedInv = 0;
    let totalInsertedOrd = 0;
    let invErrors = 0;
    
    // FK checks-i söndür — performans üçün
    await pool.query('SET FOREIGN_KEY_CHECKS=0');
    
    // Bütün mövcud invoice və order-ləri sil
    console.log('  Köhnə invoice/order-lar silinir...');
    await pool.query('DELETE FROM InvoiceOrders');
    await pool.query('DELETE FROM CustomerInvoices');
    console.log('  ✓ Köhnə datalar silindi');
    
    console.log('  Firebase fakturalarını MySQL-ə yazılır...');
    
    for (let i = 0; i < fbCustIds.length; i += BATCH_SIZE) {
        const batch = fbCustIds.slice(i, i + BATCH_SIZE);
        
        for (const custId of batch) {
            const fbData = fbCustomers[custId];
            const invoices = fbData?.details?.invoices || [];
            if (invoices.length === 0) continue;
            
            totalFbInvoices += invoices.length;
            
            for (const inv of invoices) {
                try {
                    // def ID-ləri üçün unikal ID yarat
                    const invId = (inv.id && inv.id !== 'def') ? inv.id : ('inv_' + Math.random().toString(36).substring(2, 9));
                    
                    await pool.query(`
                        INSERT INTO CustomerInvoices (
                            id, customerId, invoiceNumber, archiveUrl, archiveName, archiveBase64,
                            archiveRequested, archiveRequestedAt, isException, exceptionDate,
                            exceptionInvoice, exceptionInvoiceDate, exceptionReturnedPrice, store
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        invId, custId,
                        inv.invoiceNumber || null,
                        inv.archiveUrl || null,
                        inv.archiveName || null,
                        inv.archiveBase64 || null,
                        (inv.archiveRequested === true || inv.archiveRequested === 'true') ? 1 : 0,
                        inv.archiveRequestedAt ? cleanVal(inv.archiveRequestedAt) : null,
                        (inv.isException === true || inv.isException === 'true') ? 1 : 0,
                        inv.exceptionDate ? cleanVal(inv.exceptionDate) : null,
                        inv.exceptionInvoice || null,
                        inv.exceptionInvoiceDate ? cleanVal(inv.exceptionInvoiceDate) : null,
                        inv.exceptionReturnedPrice || null,
                        inv.store || null
                    ]);
                    totalInsertedInv++;
                    
                    // Order-ları insert et
                    if (inv.orders && Array.isArray(inv.orders)) {
                        for (const ord of inv.orders) {
                            const ordId = (ord.id && ord.id !== 'o_def') ? ord.id : ('ord_' + Math.random().toString(36).substring(2, 9));
                            await pool.query(`
                                INSERT INTO InvoiceOrders (
                                    id, invoiceId, productDescription, paidAmount, initialPayment,
                                    contractDate, phoneCount, monthlyPayment, totalPrice, paymentPeriod,
                                    checkedImeis, hasImieFee
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `, [
                                ordId, invId,
                                ord.productDescription || null,
                                ord.paidAmount || null,
                                ord.initialPayment || null,
                                ord.contractDate ? cleanVal(ord.contractDate) : null,
                                Number(ord.phoneCount) || 0,
                                ord.monthlyPayment || null,
                                ord.totalPrice || null,
                                ord.paymentPeriod || null,
                                ord.checkedImeis ? JSON.stringify(ord.checkedImeis) : null,
                                (ord.hasImieFee === true || ord.hasImieFee === 'true') ? 1 : 0
                            ]);
                            totalInsertedOrd++;
                        }
                    }
                } catch (e) {
                    invErrors++;
                    if (invErrors <= 10) console.error(`    ✗ ${custId}/${inv.id}: ${e.message}`);
                }
            }
        }
        
        if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= fbCustIds.length) {
            console.log(`    ... ${Math.min(i + BATCH_SIZE, fbCustIds.length)}/${fbCustIds.length} müştəri (${totalInsertedInv} faktura, ${totalInsertedOrd} order)`);
        }
    }
    
    // FK checks-i yenidən aç
    await pool.query('SET FOREIGN_KEY_CHECKS=1');
    
    console.log(`\n  ✓ Faktura sync tamamlandı:`);
    console.log(`    Firebase faktura sayı: ${totalFbInvoices}`);
    console.log(`    MySQL-ə yazılan faktura: ${totalInsertedInv}`);
    console.log(`    MySQL-ə yazılan order: ${totalInsertedOrd}`);
    console.log(`    Xəta: ${invErrors}`);

    // ==========================================
    // ADDIM 6: Yekun doğrulama
    // ==========================================
    console.log('\n\n══ YEKUN DOĞRULAMA ══');
    
    const [fCust] = await pool.query('SELECT COUNT(*) as c FROM Customers');
    const [fInv] = await pool.query('SELECT COUNT(*) as c FROM CustomerInvoices');
    const [fOrd] = await pool.query('SELECT COUNT(*) as c FROM InvoiceOrders');
    const [fCourts] = await pool.query('SELECT COUNT(*) as c FROM Courts');
    const [fStores] = await pool.query('SELECT COUNT(*) as c FROM Stores');
    const [fUsers] = await pool.query('SELECT COUNT(*) as c FROM Users');
    const [fTpl] = await pool.query('SELECT COUNT(*) as c FROM Templates');
    
    console.log(`  Customers:        ${fCust[0].c}  (Firebase: ${fbCustIds.length})`);
    console.log(`  CustomerInvoices:  ${fInv[0].c}  (Firebase: ${totalFbInvoices})`);
    console.log(`  InvoiceOrders:     ${fOrd[0].c}`);
    console.log(`  Courts:            ${fCourts[0].c}`);
    console.log(`  Stores:            ${fStores[0].c}`);
    console.log(`  Users:             ${fUsers[0].c}`);
    console.log(`  Templates:         ${fTpl[0].c}`);
    
    // Orphan check
    const [orphInv] = await pool.query('SELECT COUNT(*) as c FROM CustomerInvoices ci LEFT JOIN Customers c ON ci.customerId = c.id WHERE c.id IS NULL');
    const [orphOrd] = await pool.query('SELECT COUNT(*) as c FROM InvoiceOrders io LEFT JOIN CustomerInvoices ci ON io.invoiceId = ci.id WHERE ci.id IS NULL');
    console.log(`  Orphan fakturalar: ${orphInv[0].c}`);
    console.log(`  Orphan order-lar:  ${orphOrd[0].c}`);
    
    // FILLED_BY_ADMIN doğrulama
    const [myFilled] = await pool.query("SELECT COUNT(*) as c FROM Customers WHERE process_status = 'FILLED_BY_ADMIN'");
    const fbFilled = fbCustSnap.docs.filter(d => d.data().process_status === 'FILLED_BY_ADMIN').length;
    console.log(`  FILLED_BY_ADMIN:   MySQL=${myFilled[0].c} Firebase=${fbFilled}`);
    
    // Pollution check
    const [polluted] = await pool.query(`
        SELECT COUNT(*) as c FROM Customers 
        WHERE details IS NOT NULL AND details != '{}' AND details != 'null'
        AND (JSON_EXTRACT(details, '$.executorName') IS NOT NULL OR JSON_EXTRACT(details, '$.fin') IS NOT NULL)
    `);
    console.log(`  Details pollution: ${polluted[0].c}`);
    
    // Sample invoice verification
    console.log('\n  === Nümunə yoxlama: 543788 ===');
    const [sampleInv] = await pool.query('SELECT id, invoiceNumber, isException, exceptionInvoice FROM CustomerInvoices WHERE customerId = ?', ['543788']);
    console.log(`  MySQL invoices: ${sampleInv.length}`);
    for (const inv of sampleInv) {
        console.log(`    ${inv.id} | ${inv.invoiceNumber} | exception=${inv.isException} | excInv=${inv.exceptionInvoice}`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  TAM SİNXRONİZASİYA TAMAMLANDI!');
    console.log('═══════════════════════════════════════════════════════');
    
    await pool.end();
    process.exit(0);
}

main().catch(e => {
    console.error('FATAL ERROR:', e);
    process.exit(1);
});
