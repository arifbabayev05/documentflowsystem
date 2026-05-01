const admin = require("firebase-admin");
const fs = require("fs");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Bu kolleksiyalar çıxarılmayacaq
const IGNORED_COLLECTIONS = ["AuditLogs"];

// MySQL üçün string escape funksiyası (Xüsusi simvolların xəta verməməsi üçün)
function escapeSQL(val) {
  if (val === undefined || val === null) return "NULL";

  if (typeof val === "object") {
    // Əgər Firestore Timestamp-dirsə
    if (val._seconds !== undefined && val._nanoseconds !== undefined) {
      return "'" + new Date(val._seconds * 1000).toISOString().slice(0, 19).replace('T', ' ') + "'";
    }
    // Obyekt və ya array-dirsə JSON string-ə çeviririk
    val = JSON.stringify(val);
  } else if (typeof val === "boolean") {
    return val ? "1" : "0";
  } else {
    val = String(val);
  }

  // MySQL üçün xüsusi simvolların escape edilməsi
  val = val.replace(/[\0\n\r\b\t\\\'\"\x1a]/g, function (s) {
    switch (s) {
      case "\0": return "\\0";
      case "\n": return "\\n";
      case "\r": return "\\r";
      case "\b": return "\\b";
      case "\t": return "\\t";
      case "\x1a": return "\\Z";
      case "'": return "\\'"; 
      case "\"": return "\\\"";
      case "\\": return "\\\\";
      default: return "\\" + s;
    }
  });

  return "'" + val + "'";
}

async function exportToSQL() {
  console.log("Firebase məlumatlarının oxunmasına başlanılır...");
  const collections = await db.listCollections();
  
  const outputFile = "firebase_export.sql";
  // Hər dəfə sıfırdan başlasın deyə köhnə faylı silirik
  if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
  const writeStream = fs.createWriteStream(outputFile, { flags: "w" });

  for (let collection of collections) {
    const colName = collection.id;

    if (IGNORED_COLLECTIONS.includes(colName)) {
      console.log(`⏭️  ${colName} ignor edildi (IGNORED_COLLECTIONS).`);
      continue;
    }

    console.log(`\n📦 Kolleksiya proses edilir: ${colName}...`);
    
    // --- MƏRHƏLƏ 1: Sütunları (Keys) Tapmaq ---
    console.log(`  🔍 Mərhələ 1: Sənədlərin strukturu (sütunlar) analiz edilir...`);
    const allKeys = new Set();
    let hasMore = true;
    let lastDocId = null;
    const batchSize = 10000;

    while (hasMore) {
      let query = collection.orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize);
      if (lastDocId) query = query.startAfter(lastDocId);
      
      const snapshot = await query.get();
      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      snapshot.forEach(doc => {
        const data = doc.data();
        Object.keys(data).forEach(key => allKeys.add(key));
        lastDocId = doc.id;
      });
    }

    const columns = Array.from(allKeys).filter(col => col !== 'id');
    console.log(`  ✔️ Tapılan sütunlar (${columns.length} ədəd): ${columns.join(", ")}`);

    // --- CƏDVƏLİN YARADILMASI ---
    writeStream.write(`-- --------------------------------------------------------\n`);
    writeStream.write(`-- Table structure for \`${colName}\`\n`);
    writeStream.write(`-- --------------------------------------------------------\n`);
    writeStream.write(`DROP TABLE IF EXISTS \`${colName}\`;\n`);
    writeStream.write(`CREATE TABLE \`${colName}\` (\n`);
    
    const colDefinitions = [`  \`id\` VARCHAR(255) PRIMARY KEY`, ...columns.map(col => `  \`${col}\` LONGTEXT`)];
    writeStream.write(colDefinitions.join(",\n") + "\n");
    writeStream.write(`);\n\n`);

    // --- MƏRHƏLƏ 2: Məlumatların SQL formatında oxunması və yazılması ---
    console.log(`  📝 Mərhələ 2: Məlumatlar SQL formatında yazılır...`);
    hasMore = true;
    lastDocId = null;
    let docCount = 0;

    while (hasMore) {
      let query = collection.orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize);
      if (lastDocId) query = query.startAfter(lastDocId);
      
      const snapshot = await query.get();
      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      let queriesChunk = "";

      snapshot.forEach(doc => {
        const data = doc.data();
        
        // Sütun ardıcıllığı ilə dəyərləri düzürük
        const values = columns.map(col => {
          return escapeSQL(data[col]);
        });

        // id sütununu əlavə edirik
        const escapedId = escapeSQL(doc.id);
        const colNamesStr = ['`id`', ...columns.map(c => `\`${c}\``)].join(', ');
        const valuesStr = [escapedId, ...values].join(', ');

        queriesChunk += `INSERT IGNORE INTO \`${colName}\` (${colNamesStr}) VALUES (${valuesStr});\n`;
        
        lastDocId = doc.id;
        docCount++;
      });

      writeStream.write(queriesChunk);
      console.log(`  - ${docCount} sənəd ixrac edildi...`);
    }
    
    console.log(`✅ ${colName} tamamlandı! Toplam oxunan sənəd: ${docCount}\n`);
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
