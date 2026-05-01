const mysql = require('mysql2/promise'); 
async function run() { 
  const conn = await mysql.createConnection('mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev'); 
  await conn.query("DELETE FROM Customers WHERE id='test_123'"); 
  await conn.end(); 
} 
run();
