const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(require('./secrets/serviceAccountKey.json'))
    });
}
const db = admin.firestore();

async function run() {
    const doc = await db.collection('Customers').doc('1000789287').get();
    console.log(JSON.stringify(doc.data(), null, 2));
    process.exit(0);
}
run();
