const mysql = require('mysql2/promise');

const connectionString = 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev';

async function main() {
    const connection = await mysql.createConnection(connectionString);
    const [columns] = await connection.query(`DESCRIBE \`Customers\``);
    console.table(columns);
    await connection.end();
}

main().catch((err) => {
    console.error('DB connection failed:', err.message);
    process.exit(1);
});
