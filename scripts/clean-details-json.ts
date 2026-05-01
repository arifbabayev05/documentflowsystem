import mysql from 'mysql2/promise';

const connectionString = 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev';

const ROOT_COLUMNS = [
    'id', 'createdBy', 'customerCode', 'fullName', 'updatedAt', 
    '_forceReplaceInvoices', 'assignedAt', 'assignedTo', 'fullData', 
    'store', 'courtName', 'debtAmount', 'printedAt', 'process_status', 
    'archivedAt', 'isArchived', 'createdAt', 
    'archiveAssignedTo', '_isArchivePart', 'archiveAssignedAt', 'updatedBy',
    'executorName', 'gender', 'phone', 'fin', 'birthDate', 'passportSeries', 
    'actualAddress', 'address', 'fee', 'contractNumber', 'paidAmount', 
    'contractDate', 'monthlyPayment', 'productDescription', 'isWarningSent', 
    'warningDate', 'initialPayment', 'unpaidAmount', 'totalPrice', 
    'totalUnpaid', 'penalty', 'discountAmount', 'paymentPeriod', 'courtFee', 
    'phoneCount', 'statusHistory'
];

async function main() {
    const pool = mysql.createPool(connectionString);
    
    // Get all customers with non-empty details
    const [customers] = await pool.query(
        `SELECT id, details FROM Customers WHERE details IS NOT NULL AND details != '{}' AND details != 'null'`
    ) as any;
    
    console.log(`Found ${customers.length} customers with details JSON to clean`);
    
    let cleaned = 0;
    let errors = 0;
    
    for (const c of customers) {
        try {
            let d: any = {};
            if (typeof c.details === 'string') {
                try { d = JSON.parse(c.details); } catch { continue; }
            } else if (c.details) {
                d = c.details;
            }
            
            // Remove root column keys from details JSON — they belong in dedicated columns
            const cleanedDetails: any = {};
            let hadDuplicates = false;
            
            for (const [key, value] of Object.entries(d)) {
                if (ROOT_COLUMNS.includes(key)) {
                    hadDuplicates = true;
                    // Skip — this data is already in a root column
                } else {
                    cleanedDetails[key] = value;
                }
            }
            
            if (hadDuplicates) {
                const newDetailsStr = JSON.stringify(cleanedDetails);
                await pool.query('UPDATE Customers SET details = ? WHERE id = ?', [newDetailsStr, c.id]);
                cleaned++;
            }
        } catch (e) {
            errors++;
            console.error(`Error cleaning ${c.id}:`, e);
        }
    }
    
    console.log(`\nCleaned: ${cleaned} customers`);
    console.log(`Errors: ${errors}`);
    console.log(`Skipped (already clean): ${customers.length - cleaned - errors}`);
    
    // Verify
    const [verify] = await pool.query(
        `SELECT id, details FROM Customers WHERE details IS NOT NULL AND details != '{}' AND details != 'null' LIMIT 5`
    ) as any;
    
    console.log('\n=== VERIFICATION (first 5) ===');
    for (const c of verify) {
        let d: any = {};
        if (typeof c.details === 'string') {
            try { d = JSON.parse(c.details); } catch {}
        }
        console.log(`  ${c.id}: keys=[${Object.keys(d).join(', ')}]`);
    }
    
    await pool.end();
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
