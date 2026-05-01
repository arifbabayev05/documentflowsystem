import mysql from 'mysql2/promise';

const connectionString = 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev';

async function main() {
    const pool = mysql.createPool(connectionString);
    
    // 1. Get all tables
    const [tables] = await pool.query("SHOW TABLES") as any;
    console.log("=== ALL TABLES ===");
    for (const t of tables) {
        const tableName = Object.values(t)[0];
        console.log(`  - ${tableName}`);
    }
    
    console.log("\n=== TABLE STRUCTURES ===");
    
    // 2. Get structure and foreign keys for each table
    const tableNames = tables.map((t: any) => Object.values(t)[0] as string);
    for (const table of tableNames) {
        console.log(`\n--- ${table} ---`);
        const [columns] = await pool.query(`DESCRIBE \`${table}\``) as any;
        for (const col of columns) {
            console.log(`  ${col.Field} | ${col.Type} | ${col.Null} | Key: ${col.Key} | Default: ${col.Default}`);
        }
        
        // Foreign keys
        const [fks] = await pool.query(`
            SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = 'ai_dev' AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
        `, [table]) as any;
        if (fks.length > 0) {
            console.log(`  FOREIGN KEYS:`);
            for (const fk of fks) {
                console.log(`    ${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}(${fk.REFERENCED_COLUMN_NAME}) [${fk.CONSTRAINT_NAME}]`);
            }
        }
    }
    
    // 3. Sample data counts
    console.log("\n=== TABLE ROW COUNTS ===");
    for (const table of tableNames) {
        const [countResult] = await pool.query(`SELECT COUNT(*) as cnt FROM \`${table}\``) as any;
        console.log(`  ${table}: ${countResult[0].cnt} rows`);
    }
    
    // 4. Check a sample customer with invoices
    console.log("\n=== SAMPLE CUSTOMER WITH INVOICES ===");
    const [customers] = await pool.query(`SELECT id, fullName, customerCode, details FROM Customers LIMIT 3`) as any;
    for (const c of customers) {
        console.log(`\nCustomer: ${c.id} | ${c.fullName} | code=${c.customerCode}`);
        let detailsObj: any = {};
        if (typeof c.details === 'string') {
            try { detailsObj = JSON.parse(c.details); } catch {}
        }
        const detailKeys = Object.keys(detailsObj);
        if (detailKeys.length > 0) {
            console.log(`  details JSON keys: ${detailKeys.join(', ')}`);
        } else {
            console.log(`  details: (empty or null)`);
        }
        
        const [invoices] = await pool.query('SELECT * FROM CustomerInvoices WHERE customerId = ?', [c.id]) as any;
        console.log(`  Invoices count: ${invoices.length}`);
        for (const inv of invoices) {
            console.log(`    Invoice: id=${inv.id} | number=${inv.invoiceNumber} | store=${inv.store} | exception=${inv.isException}`);
            const [orders] = await pool.query('SELECT * FROM InvoiceOrders WHERE invoiceId = ?', [inv.id]) as any;
            console.log(`    Orders count: ${orders.length}`);
            for (const ord of orders) {
                console.log(`      Order: id=${ord.id} | product=${ord.productDescription?.substring(0, 50)} | totalPrice=${ord.totalPrice}`);
            }
        }
    }
    
    // 5. Check for orphaned records
    console.log("\n=== ORPHAN CHECK ===");
    const [orphanInv] = await pool.query(`
        SELECT ci.id, ci.customerId FROM CustomerInvoices ci
        LEFT JOIN Customers c ON ci.customerId = c.id
        WHERE c.id IS NULL
    `) as any;
    console.log(`Orphaned invoices (no matching customer): ${orphanInv.length}`);
    
    const [orphanOrd] = await pool.query(`
        SELECT io.id, io.invoiceId FROM InvoiceOrders io
        LEFT JOIN CustomerInvoices ci ON io.invoiceId = ci.id
        WHERE ci.id IS NULL
    `) as any;
    console.log(`Orphaned orders (no matching invoice): ${orphanOrd.length}`);
    
    // 6. Check for data in details JSON that should be in columns
    console.log("\n=== DETAILS JSON POLLUTION CHECK (first 10 customers with non-empty details) ===");
    const [custWithDetails] = await pool.query(`SELECT id, fullName, details FROM Customers WHERE details IS NOT NULL AND details != '{}' AND details != 'null' LIMIT 10`) as any;
    for (const c of custWithDetails) {
        let d: any = {};
        if (typeof c.details === 'string') {
            try { d = JSON.parse(c.details); } catch {}
        } else if (c.details) {
            d = c.details;
        }
        const keys = Object.keys(d);
        if (keys.length > 0) {
            console.log(`  ${c.id} (${c.fullName}): details has keys: [${keys.join(', ')}]`);
        }
    }
    
    // 7. Check GlobalSettings
    console.log("\n=== GLOBAL SETTINGS ===");
    const [gs] = await pool.query('SELECT * FROM GlobalSettings LIMIT 5') as any;
    for (const g of gs) {
        console.log(`  ${g.id}: ${JSON.stringify(g).substring(0, 200)}`);
    }
    
    await pool.end();
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
