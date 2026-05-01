const mysql = require('mysql2/promise');
async function test() {
    const c = await mysql.createConnection('mysql://ai_dev_user:%40%21123%23%40%21D3v0ps@10.113.1.8:3306/ai_dev');
    try {
        const data = {
            companyName: 'ABC',
            representative: 'XYZ',
            representativeFin: '123',
            address: 'ADDR',
            phone: 'PH',
            fax: '',
            dbMode: 'firebase'
        };
        const keys = Object.keys(data).filter(k => k !== 'id');
        const updates = keys.map(k => `\`${k}\` = ?`).join(', ');
        const values = keys.map(k => data[k]);
        values.push('current');
        console.log(`UPDATE GlobalSettings SET ${updates} WHERE id = ?`);
        await c.query(`UPDATE GlobalSettings SET ${updates} WHERE id = ?`, values);
        console.log('Success');
    } catch (e) {
        console.error(e);
    }
    c.end();
}
test();
