import { mysqlAddCustomer, mysqlGetCustomer } from '../lib/mysql';

async function run() {
    try {
        await mysqlAddCustomer({ 
            id: 'test_123', 
            customerCode: 'test_123', 
            fullName: 'Test Name', 
            createdAt: new Date().toISOString(), 
            details: { phone: '+123456789', fin: 'TESTFIN', passportSeries: 'AA123' } 
        }); 
        console.log('Added customer.'); 
        const c = await mysqlGetCustomer('test_123'); 
        console.log('Fetched phone:', c.phone);
        console.log('Fetched fin:', c.fin);
        console.log('Fetched fullname:', c.fullName);
    } catch(e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
