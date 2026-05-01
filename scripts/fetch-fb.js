const admin = require('firebase-admin');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

if (!admin.apps.length) {
    let cert;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
        cert = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
    } else {
        // Fallback to project ID / key from other env vars if available, but usually base64 is set in this project
        cert = {
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        };
    }
    
    admin.initializeApp({
        credential: admin.credential.cert(cert)
    });
}

async function getCust() {
    try {
        const doc = await admin.firestore().collection('customers').doc('1000789287').get();
        console.log("FIREBASE DATA:", JSON.stringify(doc.data(), null, 2));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

getCust();
