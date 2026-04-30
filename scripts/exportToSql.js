const admin = require("firebase-admin");
const fs = require("fs");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function exportToSQL() {
  console.log("Firebase məlumatlarının oxunmasına başlanılır...");
  const collections = await db.listCollections();
  
  // Çıxış faylı
  const outputFile = "firebase_export.sql";
  const writeStream = fs.createWriteStream(outputFile, { flags: "w" });

  for (let collection of collections) {
    console.log(`Kolleksiya proses edilir: ${collection.id}...`);
    
    // MySQL cədvəlinin yaradılması. Məlumat itkisinin qarşısını almaq üçün NoSQL datanı JSON formatında saxlayırıq.
    writeStream.write(`-- --------------------------------------------------------\n`);
    writeStream.write(`-- Table structure for \`${collection.id}\`\n`);
    writeStream.write(`-- --------------------------------------------------------\n`);
    writeStream.write(`CREATE TABLE IF NOT EXISTS \`${collection.id}\` (\n`);
    writeStream.write(`  \`id\` VARCHAR(255) PRIMARY KEY,\n`);
    writeStream.write(`  \`document_data\` JSON\n`);
    writeStream.write(`);\n\n`);

    // Dataları hissə-hissə oxumaq üçün stream (Memory Leak olmasın deyə)
    let docCount = 0;
    const stream = collection.stream();

    for await (const doc of stream) {
      const data = doc.data();
      
      // Timestamp tiplərini bərpa etmək üçün
      const cleanData = JSON.stringify(data, (key, value) => {
        if (value && typeof value === 'object' && value._seconds !== undefined && value._nanoseconds !== undefined) {
          return new Date(value._seconds * 1000).toISOString();
        }
        return value;
      });

      // Birtırnaqları (escape) edirik ki, query səhv verməsin
      const escapedData = cleanData.replace(/'/g, "''");
      const docId = doc.id.replace(/'/g, "''");

      writeStream.write(`INSERT IGNORE INTO \`${collection.id}\` (\`id\`, \`document_data\`) VALUES ('${docId}', '${escapedData}');\n`);
      
      docCount++;
      if (docCount % 1000 === 0) {
        console.log(`  - ${docCount} sənəd ixrac edildi...`);
      }
    }
    
    console.log(`✅ ${collection.id} tamamlandı! Toplam: ${docCount} sənəd.\n`);
    writeStream.write(`\n`);
  }

  writeStream.end();
  writeStream.on('finish', () => {
    console.log(`🎉 Bütün məlumatlar uğurla ${outputFile} faylına yazıldı!`);
    process.exit(0);
  });
}

exportToSQL().catch(err => {
  console.error("Xəta baş verdi:", err);
  process.exit(1);
});
