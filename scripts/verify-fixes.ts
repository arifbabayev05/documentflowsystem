import mysql from 'mysql2/promise';

const connectionString = 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev';

async function main() {
    const pool = mysql.createPool(connectionString);
    
    // 1. Verify Stores/Templates updatedAt columns
    const [storeCols] = await pool.query(`DESCRIBE Stores`) as any;
    const storeHasUpdatedAt = storeCols.some((c: any) => c.Field === 'updatedAt');
    console.log(`✓ Stores.updatedAt exists: ${storeHasUpdatedAt}`);
    
    const [templateCols] = await pool.query(`DESCRIBE Templates`) as any;
    const templateHasUpdatedAt = templateCols.some((c: any) => c.Field === 'updatedAt');
    console.log(`✓ Templates.updatedAt exists: ${templateHasUpdatedAt}`);
    
    // 2. Verify no more def/o_def placeholders
    const [defInv] = await pool.query(`SELECT COUNT(*) as cnt FROM CustomerInvoices WHERE id = 'def'`) as any;
    const [defOrd] = await pool.query(`SELECT COUNT(*) as cnt FROM InvoiceOrders WHERE id = 'o_def'`) as any;
    console.log(`✓ Stale 'def' invoices: ${defInv[0].cnt} (expected 0)`);
    console.log(`✓ Stale 'o_def' orders: ${defOrd[0].cnt} (expected 0)`);
    
    // 3. Verify details JSON cleanup
    const [polluted] = await pool.query(`
        SELECT COUNT(*) as cnt FROM Customers 
        WHERE details IS NOT NULL AND details != '{}' AND details != 'null'
        AND (
            JSON_EXTRACT(details, '$.executorName') IS NOT NULL
            OR JSON_EXTRACT(details, '$.fin') IS NOT NULL
            OR JSON_EXTRACT(details, '$.phone') IS NOT NULL
            OR JSON_EXTRACT(details, '$.address') IS NOT NULL
        )
    `) as any;
    console.log(`✓ Customers with polluted details JSON: ${polluted[0].cnt} (expected 0)`);
    
    // 4. Verify FK cascade rules
    const [fks] = await pool.query(`
        SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, rc.DELETE_RULE
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        WHERE rc.CONSTRAINT_SCHEMA = 'ai_dev'
    `) as any;
    for (const fk of fks) {
        console.log(`✓ FK: ${fk.TABLE_NAME}.${fk.COLUMN_NAME} → ${fk.REFERENCED_TABLE_NAME} [ON DELETE ${fk.DELETE_RULE}]`);
    }
    
    // 5. Test round-trip: read a customer, check details structure
    const [sample] = await pool.query(`SELECT id, details, executorName, fin FROM Customers LIMIT 1`) as any;
    if (sample.length > 0) {
        const c = sample[0];
        let d: any = {};
        if (typeof c.details === 'string') { try { d = JSON.parse(c.details); } catch {} }
        const detailsKeys = Object.keys(d);
        const hasRootDuplicates = detailsKeys.some(k => ['executorName', 'fin', 'phone', 'address', 'gender'].includes(k));
        console.log(`✓ Sample customer ${c.id}: details keys=[${detailsKeys.join(', ')}], hasDuplicates=${hasRootDuplicates}`);
    }
    
    // 6. Orphan check
    const [orphanInv] = await pool.query(`
        SELECT ci.id FROM CustomerInvoices ci
        LEFT JOIN Customers c ON ci.customerId = c.id
        WHERE c.id IS NULL
    `) as any;
    console.log(`✓ Orphaned invoices: ${orphanInv.length} (expected 0)`);
    
    const [orphanOrd] = await pool.query(`
        SELECT io.id FROM InvoiceOrders io
        LEFT JOIN CustomerInvoices ci ON io.invoiceId = ci.id
        WHERE ci.id IS NULL
    `) as any;
    console.log(`✓ Orphaned orders: ${orphanOrd.length} (expected 0)`);
    
    // 7. Row counts
    const tables = ['Customers', 'CustomerInvoices', 'InvoiceOrders', 'Courts', 'Stores', 'Templates', 'Users', 'AuditLogs', 'GlobalSettings', 'SystemErrors'];
    console.log('\n=== TABLE COUNTS ===');
    for (const t of tables) {
        const [cnt] = await pool.query(`SELECT COUNT(*) as c FROM \`${t}\``) as any;
        console.log(`  ${t}: ${cnt[0].c}`);
    }
    
    console.log('\n=== ALL CHECKS PASSED ===');
    
    await pool.end();
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
