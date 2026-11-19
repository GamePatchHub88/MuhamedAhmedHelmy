// قاعدة بيانات "شهاداتي" على MongoDB
// التشغيل مرة واحدة:  mongosh "<MONGODB_URI>" mongodb-setup.js
// (أو الصق محتواه في MongoDB Atlas → Browse Collections → mongosh)
// الـ collection بتتعمل تلقائيًا أول مرة ترفع شهادة، لكن الملف ده بيضيف الـ validation والـ index.
const dbName = "portfolio"; // لازم يطابق MONGODB_DB على Vercel
const d = db.getSiblingDB(dbName);

if (!d.getCollectionNames().includes("certificates")) {
  d.createCollection("certificates", {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["image", "mime", "created_at"],
        properties: {
          title: { bsonType: "string", maxLength: 120 },       // اسم الشهادة
          issuer: { bsonType: "string", maxLength: 120 },      // الجهة المانحة
          issued_at: { bsonType: "string", maxLength: 40 },    // التاريخ (نص حر)
          order_index: { bsonType: ["int", "long", "double"], description: "الأصغر يظهر أولًا" },
          image: { bsonType: "binData", description: "الصورة بعد الضغط (≤ 1MB)" },
          mime: { enum: ["image/webp", "image/jpeg", "image/png"] },
          size: { bsonType: ["int", "long", "double"] },       // حجم الصورة بالبايت
          created_at: { bsonType: "date" },
          updated_at: { bsonType: "date" },
        },
      },
    },
  });
}
d.certificates.createIndex({ order_index: 1, created_at: -1 });
print("✅ certificates جاهزة في قاعدة " + dbName);
