// test-db.js
const mysql = require('mysql2/promise');

const connectionString = process.env.MYSQL_URI || process.env.DATABASE_URL;

async function main() {
    if (!connectionString) {
        throw new Error('MYSQL_URI or DATABASE_URL environment variable is required');
    }

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
