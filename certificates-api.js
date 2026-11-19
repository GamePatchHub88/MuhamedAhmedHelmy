/* =========================================================
   certificates-api.js — واجهة "شهاداتي" (Node.js + Express + MongoDB)
   ---------------------------------------------------------
   Collection: certificates  (داخل قاعدة MONGODB_DB — الافتراضي "portfolio")
   - GET    /api/certificates            عام: قائمة الشهادات (بدون الصور الثقيلة)
   - GET    /api/certificates/:id/image  عام: الصورة نفسها (كاش طويل)
   - POST   /api/certificates            أدمن: إضافة (صورة مضغوطة Base64)
   - PUT    /api/certificates/:id        أدمن: تعديل (الصورة اختيارية)
   - DELETE /api/certificates/:id        أدمن: حذف
   المتغيرات (Vercel → Environment Variables):
     MONGODB_URI   رابط الاتصال (إجباري)
     MONGODB_DB    اسم القاعدة (اختياري)
     SUPABASE_URL / SUPABASE_ANON_KEY   للتحقق من توكن الأدمن (اختياري — لها قيم افتراضية)
     ADMIN_EMAILS  إيميلات مسموح لها بالتعديل، مفصولة بفاصلة (اختياري)
========================================================= */
const express = require("express");
const { MongoClient, ObjectId, Binary } = require("mongodb");

const MAX_IMAGE_BYTES = 400 * 1024; // أقصى حجم للصورة بعد الضغط: 400KB
const MAX_DIM = 1000; // أقصى بُعد (px) — يُطبّق أيضًا على السيرفر لو sharp متاح

let sharp = null;
try { sharp = require("sharp"); } catch (_) { /* اختياري */ }

/* ---------- اتصال MongoDB (يُعاد استخدامه بين طلبات Vercel) ---------- */
let clientPromise = global.__certsMongo;
async function getCol() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!clientPromise) {
    clientPromise = global.__certsMongo = new MongoClient(uri, { maxPoolSize: 5 })
      .connect()
      .catch((e) => { clientPromise = global.__certsMongo = null; throw e; });
  }
  const client = await clientPromise;
  const col = client.db(process.env.MONGODB_DB || "portfolio").collection("certificates");
  if (!global.__certsIndexed) {
    global.__certsIndexed = true;
    col.createIndex({ order_index: 1, created_at: -1 }).catch(() => {});
  }
  return col;
}

/* ---------- التحقق من الأدمن (توكن Supabase) ---------- */
const SB_URL = process.env.SUPABASE_URL || "https://wgcfajrwfmunwoqmneww.supabase.co";
const SB_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnY2ZhanJ3Zm11bndvcW1uZXd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNDg3ODQsImV4cCI6MjA5ODkyNDc4NH0.sR7YNvM3YKGQkavCN617r9B30oEwf06dCuuRz83ojlE";
const ADMINS = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const authCache = new Map();

async function requireAdmin(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "unauthorized" });
    const hit = authCache.get(token);
    let email = hit && hit.exp > Date.now() ? hit.email : null;
    if (!email) {
      const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } });
      if (!r.ok) return res.status(401).json({ error: "unauthorized" });
      email = String((await r.json()).email || "").toLowerCase();
      if (authCache.size > 50) authCache.clear();
      authCache.set(token, { email, exp: Date.now() + 60000 });
    }
    if (ADMINS.length && !ADMINS.includes(email)) return res.status(403).json({ error: "forbidden" });
    next();
  } catch (e) {
    res.status(401).json({ error: "unauthorized" });
  }
}

/* ---------- معالجة الصورة ---------- */
function sniff(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length > 12 && buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.length > 12 && buf.slice(1, 4).toString() === "PNG") return "image/png";
  return null;
}

async function parseImage(dataUrl) {
  const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) throw new Error("صيغة الصورة غير مدعومة (JPG / PNG / WEBP)");
  let buf = Buffer.from(m[1], "base64");
  let mime = sniff(buf);
  if (!mime) throw new Error("الملف ليس صورة صالحة");
  const alreadySmall = buf.length <= MAX_IMAGE_BYTES && (mime === "image/webp" || mime === "image/jpeg");
  if (sharp && !alreadySmall) {
    // ضغط إضافي على السيرفر كطبقة أمان (لو الرفع تم بدون ضغط من المتصفح)
    try {
      buf = await sharp(buf).rotate().resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
      mime = "image/webp";
    } catch (_) { throw new Error("تعذر قراءة الصورة"); }
  }
  if (buf.length > MAX_IMAGE_BYTES) throw new Error("حجم الصورة كبير بعد الضغط (الحد 400KB)");
  return { buf, mime };
}

const clean = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const toId = (s) => (ObjectId.isValid(s) ? new ObjectId(s) : null);
const pub = (d) => ({
  id: String(d._id),
  title: d.title,
  issuer: d.issuer || "",
  issued_at: d.issued_at || "",
  order_index: d.order_index || 0,
  image_url: `/api/certificates/${d._id}/image?v=${d.updated_at ? new Date(d.updated_at).getTime() : 0}`,
  size: d.size || 0,
});

/* ---------- الراوتر ---------- */
const router = express.Router();
const json = express.json({ limit: "2mb" });
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error("certificates:", e.message);
    const detail = req.method !== "GET" ? String(e.message || e).slice(0, 200) : "";
    res.status(e.status || 500).json({ error: e.status ? e.message : "server error" + (detail ? ": " + detail : "") });
  });

router.get("/", wrap(async (req, res) => {
  const col = await getCol();
  // العام: الشهادات التي لها صورة فقط — الأدمن (?all=1) يرى الكل لحذف أي سجل فارغ
  const q = req.query.all === "1" ? {} : { size: { $gt: 0 } };
  const docs = await col.find(q, { projection: { image: 0 } }).sort({ order_index: 1, created_at: -1 }).toArray();
  res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.json(docs.map(pub));
}));

router.get("/:id/image", wrap(async (req, res) => {
  const _id = toId(req.params.id);
  if (!_id) return res.sendStatus(404);
  const col = await getCol();
  const d = await col.findOne({ _id }, { projection: { image: 1, mime: 1 } });
  if (!d || !d.image) return res.sendStatus(404);
  res.set({ "Content-Type": d.mime || "image/webp", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
  res.send(Buffer.from(d.image.buffer));
}));

router.post("/", requireAdmin, json, wrap(async (req, res) => {
  const b = req.body || {};
  let img;
  try { img = await parseImage(b.image); } catch (e) { return res.status(400).json({ error: e.message }); }
  const col = await getCol();
  const now = new Date();
  const r = await col.insertOne({
    title: "",
    order_index: parseInt(b.order_index, 10) || 0,
    image: new Binary(img.buf), mime: img.mime, size: img.buf.length,
    created_at: now, updated_at: now,
  });
  res.status(201).json({ id: String(r.insertedId), size: img.buf.length });
}));

router.put("/:id", requireAdmin, json, wrap(async (req, res) => {
  const _id = toId(req.params.id);
  if (!_id) return res.status(404).json({ error: "not found" });
  const b = req.body || {};
  const set = { updated_at: new Date() };
  if (b.order_index !== undefined) set.order_index = parseInt(b.order_index, 10) || 0;
  if (b.image) {
    try { const img = await parseImage(b.image); set.image = new Binary(img.buf); set.mime = img.mime; set.size = img.buf.length; }
    catch (e) { return res.status(400).json({ error: e.message }); }
  }
  const col = await getCol();
  const r = await col.updateOne({ _id }, { $set: set });
  if (!r.matchedCount) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
}));

router.delete("/:id", requireAdmin, wrap(async (req, res) => {
  const _id = toId(req.params.id);
  if (!_id) return res.status(404).json({ error: "not found" });
  const col = await getCol();
  await col.deleteOne({ $or: [{ _id }, { _id: req.params.id }] });
  res.json({ ok: true });
}));

module.exports = router;
