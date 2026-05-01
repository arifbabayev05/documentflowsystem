const mysql = require('mysql2/promise');

async function test() {
    const c = await mysql.createConnection('mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev');
    const [r] = await c.query("SELECT * FROM Customers WHERE id = '1000789287'");
    console.log(JSON.stringify(r, null, 2));
    await c.end();
}

test();
