import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = {
    apiKey: "AIzaSyACk7G1pClIIVXgMwzGI8othZVexL58hHU",
    authDomain: "legal12-kontakt.firebaseapp.com",
    projectId: "legal12-kontakt",
    storageBucket: "legal12-kontakt.firebasestorage.app",
    messagingSenderId: "895536839180",
    appId: "1:895536839180:web:d5636f343eb79f5d81cc29",
    measurementId: "G-731BZ2G3SLq"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
    try {
        const docRef = doc(db, "Customers", "1000939737");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            fs.writeFileSync("scripts/1000939737_full.json", JSON.stringify(docSnap.data(), null, 2));
            console.log("Document saved to scripts/1000939737_full.json");
        } else {
            console.log("No such document!");
        }
    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
}

main();
