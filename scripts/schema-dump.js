const mysql = require('mysql2/promise');

const connectionString = 'mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev';

async function main() {
    const connection = await mysql.createConnection(connectionString);

    const [tables] = await connection.query('SHOW TABLES');
    
    for (let row of tables) {
        const tableName = row['Tables_in_ai_dev'];
        console.log(`\n--- TABLE: ${tableName} ---`);
        const [columns] = await connection.query(`DESCRIBE \`${tableName}\``);
        console.table(columns);
    }

    await connection.end();
}

main().catch((err) => {
    console.error('DB connection failed:', err.message);
    process.exit(1);
});
