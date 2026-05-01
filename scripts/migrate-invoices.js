const mysql = require('mysql2/promise');

async function migrateInvoices() {
    const db = await mysql.createConnection('mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev');
    
    console.log("Creating CustomerInvoices table...");
    await db.query(`
        CREATE TABLE IF NOT EXISTS CustomerInvoices (
            id VARCHAR(255) PRIMARY KEY,
            customerId VARCHAR(255) NOT NULL,
            invoiceNumber VARCHAR(255),
            archiveUrl TEXT,
            archiveName VARCHAR(255),
            archiveBase64 LONGTEXT,
            archiveRequested BOOLEAN DEFAULT FALSE,
            archiveRequestedAt DATETIME,
            isException BOOLEAN DEFAULT FALSE,
            exceptionDate VARCHAR(255),
            exceptionInvoice VARCHAR(255),
            exceptionInvoiceDate VARCHAR(255),
            exceptionReturnedPrice VARCHAR(255),
            store VARCHAR(255),
            FOREIGN KEY (customerId) REFERENCES Customers(id) ON DELETE CASCADE
        );
    `);

    console.log("Creating InvoiceOrders table...");
    await db.query(`
        CREATE TABLE IF NOT EXISTS InvoiceOrders (
            id VARCHAR(255) PRIMARY KEY,
            invoiceId VARCHAR(255) NOT NULL,
            productDescription TEXT,
            paidAmount VARCHAR(255),
            initialPayment VARCHAR(255),
            contractDate VARCHAR(255),
            phoneCount INT DEFAULT 0,
            monthlyPayment VARCHAR(255),
            totalPrice VARCHAR(255),
            paymentPeriod VARCHAR(255),
            checkedImeis JSON,
            hasImieFee BOOLEAN DEFAULT FALSE,
            FOREIGN KEY (invoiceId) REFERENCES CustomerInvoices(id) ON DELETE CASCADE
        );
    `);

    console.log("Fetching all customers...");
    const [customers] = await db.query('SELECT id, details FROM Customers');
    let invoicesInserted = 0;
    let ordersInserted = 0;

    for (const customer of customers) {
        if (!customer.details) continue;
        
        let detailsObj;
        try {
            detailsObj = JSON.parse(customer.details);
        } catch (e) {
            continue;
        }

        if (detailsObj.invoices && Array.isArray(detailsObj.invoices)) {
            for (const inv of detailsObj.invoices) {
                if (!inv.id) inv.id = Math.random().toString(36).substring(2, 9);
                
                await db.query(`
                    INSERT INTO CustomerInvoices (
                        id, customerId, invoiceNumber, archiveUrl, archiveName, archiveBase64,
                        archiveRequested, archiveRequestedAt, isException, exceptionDate,
                        exceptionInvoice, exceptionInvoiceDate, exceptionReturnedPrice, store
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        invoiceNumber=VALUES(invoiceNumber), archiveUrl=VALUES(archiveUrl)
                `, [
                    inv.id,
                    customer.id,
                    inv.invoiceNumber || null,
                    inv.archiveUrl || null,
                    inv.archiveName || null,
                    inv.archiveBase64 || null,
                    inv.archiveRequested === true || inv.archiveRequested === 'true',
                    inv.archiveRequestedAt ? new Date(inv.archiveRequestedAt) : null,
                    inv.isException === true || inv.isException === 'true',
                    inv.exceptionDate || null,
                    inv.exceptionInvoice || null,
                    inv.exceptionInvoiceDate || null,
                    inv.exceptionReturnedPrice || null,
                    inv.store || null
                ]);
                invoicesInserted++;

                if (inv.orders && Array.isArray(inv.orders)) {
                    for (const ord of inv.orders) {
                        if (!ord.id) ord.id = Math.random().toString(36).substring(2, 9);
                        
                        await db.query(`
                            INSERT INTO InvoiceOrders (
                                id, invoiceId, productDescription, paidAmount, initialPayment,
                                contractDate, phoneCount, monthlyPayment, totalPrice, paymentPeriod,
                                checkedImeis, hasImieFee
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON DUPLICATE KEY UPDATE
                                productDescription=VALUES(productDescription)
                        `, [
                            ord.id,
                            inv.id,
                            ord.productDescription || null,
                            ord.paidAmount || null,
                            ord.initialPayment || null,
                            ord.contractDate || null,
                            Number(ord.phoneCount) || 0,
                            ord.monthlyPayment || null,
                            ord.totalPrice || null,
                            ord.paymentPeriod || null,
                            ord.checkedImeis ? JSON.stringify(ord.checkedImeis) : null,
                            ord.hasImieFee === true || ord.hasImieFee === 'true'
                        ]);
                        ordersInserted++;
                    }
                }
            }
            
            // Note: I will remove `invoices` from `details` later once confirmed.
        }
    }

    console.log(`Migration completed. ${invoicesInserted} invoices and ${ordersInserted} orders inserted.`);
    await db.end();
}

migrateInvoices().catch(console.error);
