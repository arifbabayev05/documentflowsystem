import mysql from 'mysql2/promise';

const connectionString = 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev';

async function main() {
    const pool = mysql.createPool(connectionString);
    
    // 1. Check Customers table - ACTUAL columns vs CUSTOMER_COLUMNS array
    const [custCols] = await pool.query(`DESCRIBE Customers`) as any;
    const actualCols = custCols.map((c: any) => c.Field);
    console.log("=== CUSTOMERS TABLE ACTUAL COLUMNS ===");
    console.log(actualCols.join(', '));
    
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
    
    // What's in code but NOT in table
    const missingInTable = CUSTOMER_COLUMNS.filter(c => !actualCols.includes(c));
    console.log("\n=== IN CODE BUT NOT IN TABLE ===");
    console.log(missingInTable.length > 0 ? missingInTable.join(', ') : "(none)");
    
    // What's in table but NOT in code
    const missingInCode = actualCols.filter((c: string) => !CUSTOMER_COLUMNS.includes(c));
    console.log("\n=== IN TABLE BUT NOT IN CODE ===");
    console.log(missingInCode.length > 0 ? missingInCode.join(', ') : "(none)");
    
    // 2. Check CustomerInvoices actual columns
    console.log("\n=== CUSTOMER INVOICES COLUMNS ===");
    const [invCols] = await pool.query(`DESCRIBE CustomerInvoices`) as any;
    console.log(invCols.map((c: any) => `${c.Field} (${c.Type}, ${c.Null}, Default: ${c.Default})`).join('\n'));
    
    // 3. Check InvoiceOrders actual columns
    console.log("\n=== INVOICE ORDERS COLUMNS ===");
    const [ordCols] = await pool.query(`DESCRIBE InvoiceOrders`) as any;
    console.log(ordCols.map((c: any) => `${c.Field} (${c.Type}, ${c.Null}, Default: ${c.Default})`).join('\n'));
    
    // 4. Check FK constraints and cascade behavior
    console.log("\n=== FOREIGN KEY CASCADE CHECK ===");
    const [fkInfo] = await pool.query(`
        SELECT kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME,
               rc.DELETE_RULE, rc.UPDATE_RULE
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        WHERE rc.CONSTRAINT_SCHEMA = 'ai_dev'
    `) as any;
    for (const fk of fkInfo) {
        console.log(`  ${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}(${fk.REFERENCED_COLUMN_NAME}) [ON DELETE: ${fk.DELETE_RULE}, ON UPDATE: ${fk.UPDATE_RULE}]`);
    }
    
    // 5. Check Courts actual columns vs what code inserts
    console.log("\n=== COURTS TABLE ===");
    const [courtCols] = await pool.query(`DESCRIBE Courts`) as any;
    console.log(courtCols.map((c: any) => `${c.Field} (${c.Type})`).join(', '));
    // Code inserts: id, name, address, phone, fax, createdAt
    // Code updates: name, address, phone, fax, updatedAt
    const courtActual = courtCols.map((c: any) => c.Field);
    const courtNeedUpdate = ['updatedAt'];
    const courtMissing = courtNeedUpdate.filter(c => !courtActual.includes(c));
    if (courtMissing.length) console.log(`  Missing columns needed by code: ${courtMissing.join(', ')}`);
    
    // 6. Check Stores actual columns
    console.log("\n=== STORES TABLE ===");
    const [storeCols] = await pool.query(`DESCRIBE Stores`) as any;
    console.log(storeCols.map((c: any) => `${c.Field} (${c.Type})`).join(', '));
    const storeActual = storeCols.map((c: any) => c.Field);
    const storeNeedUpdate = ['updatedAt'];
    const storeMissing = storeNeedUpdate.filter(c => !storeActual.includes(c));
    if (storeMissing.length) console.log(`  Missing columns needed by code: ${storeMissing.join(', ')}`);
    
    // 7. Check Templates actual columns
    console.log("\n=== TEMPLATES TABLE ===");
    const [templateCols] = await pool.query(`DESCRIBE Templates`) as any;
    console.log(templateCols.map((c: any) => `${c.Field} (${c.Type})`).join(', '));
    const templateActual = templateCols.map((c: any) => c.Field);
    const templateNeedUpdate = ['updatedAt'];
    const templateMissing = templateNeedUpdate.filter(c => !templateActual.includes(c));
    if (templateMissing.length) console.log(`  Missing columns needed by code: ${templateMissing.join(', ')}`);
    
    // 8. Check AuditLogs actual columns
    console.log("\n=== AUDIT LOGS TABLE ===");
    const [auditCols] = await pool.query(`DESCRIBE AuditLogs`) as any;
    console.log(auditCols.map((c: any) => `${c.Field} (${c.Type})`).join(', '));
    
    // 9. Details JSON pollution stats
    console.log("\n=== DETAILS JSON ANALYSIS ===");
    const [allCusts] = await pool.query(`SELECT id, details, executorName, gender, phone, fin, birthDate, passportSeries, 
        actualAddress, address, fee, contractNumber, paidAmount, contractDate, monthlyPayment, productDescription,
        isWarningSent, warningDate, initialPayment, unpaidAmount, totalPrice, totalUnpaid, penalty, discountAmount, 
        paymentPeriod, courtFee, phoneCount FROM Customers WHERE details IS NOT NULL AND details != '{}' AND details != 'null' LIMIT 50`) as any;
    
    let detailsDuplicateCount = 0;
    let detailsExtraKeys = new Set<string>();
    let detailsOnlyKeys = new Set<string>();
    
    for (const c of allCusts) {
        let d: any = {};
        if (typeof c.details === 'string') {
            try { d = JSON.parse(c.details); } catch {}
        }
        
        // Check which keys in details are duplicated with root columns
        const rootCols = ['executorName', 'gender', 'phone', 'fin', 'birthDate', 'passportSeries', 
            'actualAddress', 'address', 'fee', 'contractNumber', 'paidAmount', 'contractDate', 'monthlyPayment', 
            'productDescription', 'isWarningSent', 'warningDate', 'initialPayment', 'unpaidAmount', 'totalPrice', 
            'totalUnpaid', 'penalty', 'discountAmount', 'paymentPeriod', 'courtFee', 'phoneCount'];
        
        for (const key of Object.keys(d)) {
            if (rootCols.includes(key)) {
                detailsDuplicateCount++;
            } else {
                detailsExtraKeys.add(key);
            }
        }
        
        // Check keys in details that have data but root column is null/empty
        for (const key of rootCols) {
            if (d[key] && !c[key]) {
                detailsOnlyKeys.add(key);
            }
        }
    }
    
    console.log(`Checked ${allCusts.length} customers`);
    console.log(`Duplicate keys (in both details JSON and root columns): ${detailsDuplicateCount} instances`);
    console.log(`Extra keys in details JSON (not in root columns): [${Array.from(detailsExtraKeys).join(', ')}]`);
    console.log(`Keys with data ONLY in details (root column empty): [${Array.from(detailsOnlyKeys).join(', ')}]`);
    
    // 10. Check for invoices with id='def' still in DB
    console.log("\n=== STALE PLACEHOLDER IDS ===");
    const [defInv] = await pool.query(`SELECT COUNT(*) as cnt FROM CustomerInvoices WHERE id = 'def'`) as any;
    console.log(`Invoices with id='def': ${defInv[0].cnt}`);
    const [defOrd] = await pool.query(`SELECT COUNT(*) as cnt FROM InvoiceOrders WHERE id = 'o_def'`) as any;
    console.log(`Orders with id='o_def': ${defOrd[0].cnt}`);
    
    // 11. Check for customers with invoices that might have the 'def' ID issue
    const [defInvs] = await pool.query(`SELECT ci.id, ci.customerId, ci.invoiceNumber FROM CustomerInvoices ci WHERE ci.id = 'def'`) as any;
    if (defInvs.length > 0) {
        console.log("Customers with 'def' invoice IDs:");
        for (const inv of defInvs) {
            console.log(`  Customer: ${inv.customerId}, Invoice: ${inv.invoiceNumber}`);
        }
    }

    await pool.end();
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
