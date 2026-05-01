import { mysqlUpdateCustomer } from '../lib/mysql';

async function test() {
    const res = await mysqlUpdateCustomer('testt', {
        id: 'testt',
        details: {
            contractNumber: '123',
            invoices: [
                {
                    id: 'def',
                    invoiceNumber: '123',
                    orders: [
                        { id: 'o_def', productDescription: '123', totalPrice: '100' }
                    ]
                }
            ]
        }
    });

    console.log('Result:', JSON.stringify(res?.details?.invoices, null, 2));
    process.exit();
}

test();
