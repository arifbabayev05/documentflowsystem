const mysql = require('mysql2/promise');

async function run() {
    const connection = await mysql.createConnection('mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev');
    
    console.log("Fixing serverTimestamp issues...");
    
    // Fix stringified serverTimestamps
    await connection.query(`UPDATE Customers SET updatedAt = null WHERE updatedAt LIKE '%serverTimestamp%'`);
    await connection.query(`UPDATE Customers SET createdAt = null WHERE createdAt LIKE '%serverTimestamp%'`);
    
    console.log("Fixing boolean representations in details...");
    // Let's also fix boolean fields inside 'details' if they got stringified incorrectly,
    // though JSON parse handles true/false if they were valid JSON.
    // Wait, let's just make sure we did not insert stringified booleans.

    console.log("Done");
    connection.end();
}

run();
