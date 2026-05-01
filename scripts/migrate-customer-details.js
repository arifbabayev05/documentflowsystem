const mysql = require('mysql2/promise');

const CUSTOMER_COLUMNS = [
    'executorName', 'gender', 'phone', 'fin', 'birthDate', 'passportSeries', 
    'actualAddress', 'address', 'fee', 'contractNumber', 'paidAmount', 
    'contractDate', 'monthlyPayment', 'productDescription', 'isWarningSent', 
    'warningDate', 'initialPayment', 'unpaidAmount', 'totalPrice', 
    'totalUnpaid', 'penalty', 'discountAmount', 'paymentPeriod', 'courtFee', 
    'phoneCount'
];

async function run() {
    const conn = await mysql.createConnection('mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev');
    try {
        console.log('Fetching all customers...');
        const [rows] = await conn.query('SELECT id, details FROM Customers');
        console.log(`Found ${rows.length} customers to migrate.`);

        let updatedCount = 0;
        for (const row of rows) {
            if (!row.details) continue;

            let detailsObj;
            try {
                detailsObj = JSON.parse(row.details);
            } catch (e) {
                console.error(`Failed to parse details for customer ${row.id}`, e.message);
                continue;
            }

            const updates = [];
            const values = [];

            for (const col of CUSTOMER_COLUMNS) {
                if (detailsObj[col] !== undefined) {
                    updates.push(`\`${col}\` = ?`);
                    
                    let val = detailsObj[col];
                    if (typeof val === 'boolean') val = val ? '1' : '0';
                    else if (val === null || val === undefined) val = null;
                    else if (typeof val === 'object') val = JSON.stringify(val);
                    else val = String(val);

                    values.push(val);
                }
            }

            if (updates.length > 0) {
                values.push(row.id);
                const query = `UPDATE Customers SET ${updates.join(', ')} WHERE id = ?`;
                await conn.query(query, values);
                updatedCount++;
            }
        }
        console.log(`Successfully updated ${updatedCount} customers.`);
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await conn.end();
    }
}

run();
