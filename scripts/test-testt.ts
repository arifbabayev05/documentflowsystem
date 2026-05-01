import { mysqlGetCustomer } from '../lib/mysql';

async function test() {
    const c = await mysqlGetCustomer('testt');
    console.log('invoices:', JSON.stringify(c?.details?.invoices, null, 2));
    process.exit();
}

test();
