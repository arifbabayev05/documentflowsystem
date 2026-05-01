// test-db.js
const mysql = require('mysql2/promise');

const connectionString = 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev';

async function main() {
    const connection = await mysql.createConnection(connectionString);

    const [db] = await connection.query('SELECT DATABASE() AS db');
    console.log('Connected DB:', db);

    const [tables] = await connection.query('SHOW TABLES');
    console.table(tables);

    await connection.end();
}

main().catch((err) => {
    console.error('DB connection failed:', err.message);
    process.exit(1);
});