
const fs = require('fs');
const mysql = require('mysql2/promise');

async function importSql() {
  const sql = fs.readFileSync('firebase_export.sql', 'utf8');
  
  console.log('Connecting to MySQL...');
  const connection = await mysql.createConnection({
    uri: 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev',
    multipleStatements: true,
  });
  
  console.log('Executing SQL...');
  try {
    await connection.query(sql);
    console.log('SQL import successful.');
  } catch (err) {
    console.error('Error importing SQL:', err);
  } finally {
    await connection.end();
  }
}

importSql();
