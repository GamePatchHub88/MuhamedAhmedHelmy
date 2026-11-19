// نقطة دخول Vercel: واجهة الشهادات (MongoDB) + واجهة الطلاب (لو موجودة)
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(["/api/certificates", "/certificates"], require("../certificates-api"));

// واجهة الطلاب الحالية (students-server) — تُحمَّل لو الملف موجود في مشروعك
try {
  const students = require("../students-server");
  app.use(students);
} catch (e) {
  if (e.code !== "MODULE_NOT_FOUND" || !/students-server/.test(e.message)) throw e;
}

module.exports = app;
