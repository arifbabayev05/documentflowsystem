import { mysqlGetCustomer } from '../lib/mysql'; 
async function test() { 
  const c = await mysqlGetCustomer('1000789287'); 
  console.log('typeof c.details', typeof c.details);
  console.log('c.details:', c.details);
  process.exit(0); 
} 
test();
