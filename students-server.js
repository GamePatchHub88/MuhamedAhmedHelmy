"use strict";
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const { makeLogic, explainError } = require("./students-logic");

const MONGODB_URI = process.env.MONGODB_URI;
// قاعدة بيانات مستقلة لموقع الحلول داخل نفس الـ cluster (الموقع الأول يبقى على قاعدته hightech كما هي)
const DB_NAME = process.env.MONGODB_DB || "qureo_solutions";
// للتحقق من أن الطلب جاء من المدير (نفس حساب تسجيل دخول لوحة البورتفوليو في Supabase)
const SUPABASE_URL = process.env.SUPABASE_URL || "https://wgcfajrwfmunwoqmneww.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnY2ZhanJ3Zm11bndvcW1uZXd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNDg3ODQsImV4cCI6MjA5ODkyNDc4NH0.sR7YNvM3YKGQkavCN617r9B30oEwf06dCuuRz83ojlE";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ALLOWED = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);

// اتصال واحد يُعاد استخدامه (مهم على Vercel)
let cached = global.__studentsLogic;
async function getLogic() {
  if (cached) return cached;
  if (!MONGODB_URI) throw new Error("MONGODB_URI غير مضبوط");
  const client = new MongoClient(MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(DB_NAME);
  global.__studentsDb = db;
  const logic = makeLogic({ db, ObjectId });
  await logic.ensureIndexes().catch(() => {});
  cached = global.__studentsLogic = logic;
  return logic;
}

const app = express();
app.set("trust proxy", 1);
app.use(
  cors((req, cb) => {
    const o = req.headers.origin;
    const sameOrigin = o && (o === "https://" + req.headers.host || o === "http://" + req.headers.host);
    // الأصل غير المسموح لا يحصل على رؤوس CORS (يحجبه المتصفح) بدل أن يتسبب في خطأ 500
    cb(null, { origin: !o || sameOrigin || !ALLOWED.length || ALLOWED.includes(o) });
  })
);
app.use(express.json({ limit: "1mb" }));

// حد بسيط للطلبات لكل IP (120 طلب في الدقيقة)
const hits = new Map();
function limiter(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const h = hits.get(key);
  if (!h || now - h.t > 60000) hits.set(key, { t: now, n: 1 });
  else if (++h.n > 120) return res.status(429).json({ error: "too many requests" });
  if (hits.size > 5000) hits.clear();
  next();
}

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(await getLogic(), req));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: explainError(e) });
  }
};

app.get(["/api", "/api/"], (_req, res) => res.json({ ok: true, service: "students-api" }));

// فحص سريع للإعدادات والاتصال بالقاعدة: افتح /api/health في المتصفح
app.get("/api/health", async (_req, res) => {
  const out = {
    env: {
      MONGODB_URI: !!MONGODB_URI,
      MONGODB_DB: DB_NAME,
      ADMIN_EMAIL: !!ADMIN_EMAIL,
      ALLOWED_ORIGINS: ALLOWED,
    },
    mongo: "not-tested",
  };
  try {
    await getLogic();
    await global.__studentsDb.command({ ping: 1 });
    out.mongo = "connected";
  } catch (e) {
    console.error(e);
    out.mongo = "error";
    out.message = explainError(e);
  }
  res.status(out.mongo === "connected" ? 200 : 500).json(out);
});

/* ---------- للطلاب: نفس أسماء الدوال القديمة وتنسيق الإجابات ---------- */
const rpc = express.Router();
rpc.use(limiter);
const UA = (r) => r.headers["user-agent"] || "";
// عنوان IP الحقيقي للزائر خلف Vercel (الأولوية لرؤوس المنصة ثم req.ip)
const IP = (r) => {
  const h = r.headers;
  const raw = h["x-vercel-forwarded-for"] || h["x-real-ip"] || String(h["x-forwarded-for"] || "").split(",")[0] || r.ip || "";
  return String(raw).trim().replace(/^::ffff:/, "").slice(0, 45);
};
rpc.post("/student_check", wrap((l, r) => l.check(r.body.p_device, r.body.p_type, UA(r), r.body.p_info, IP(r))));
rpc.post("/student_register", wrap((l, r) => l.register(r.body.p_device, r.body.p_name, r.body.p_type, UA(r), r.body.p_info, IP(r))));
rpc.post("/student_inbox", wrap((l, r) => l.inbox(r.body.p_device)));
rpc.post("/student_audio", wrap((l, r) => l.audio(r.body.p_device, r.body.p_id)));
rpc.post("/student_mark_read", wrap((l, r) => l.markRead(r.body.p_device)));
rpc.post("/student_send", wrap((l, r) =>
  l.send(r.body.p_device, r.body.p_kind, r.body.p_body, r.body.p_audio, r.body.p_duration)));
rpc.post("/review_submit", wrap((l, r) => l.reviewSubmit(r.body.p_device, r.body.p_name, r.body.p_text, r.body.p_grade)));
app.use("/api/rpc", rpc);

/* ---------- عام (بدون تسجيل): التقييمات المنشورة لموقع الحلول ---------- */
const pub = express.Router();
pub.use(limiter);
// كاش قصير على CDN حتى لا تُحمَّل القاعدة مع كل زائر
const cacheJson = (fn) => async (req, res) => {
  try {
    const data = await fn(await getLogic(), req);
    res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: explainError(e) });
  }
};
pub.get("/reviews", cacheJson((l) => l.publicReviews()));
// صور الطلاب أُزيلت نهائيًا؛ يبقى هذا المسار فارغًا فقط حتى لا يظهر خطأ في نسخة موقع الطلاب القديمة
pub.get("/photos", (_req, res) => res.set("Cache-Control", "public, s-maxage=300").json({ photos: [] }));
app.use("/api/public", pub);

/* ---------- للمدير: يتطلب Bearer token من تسجيل دخول Supabase ---------- */
const okCache = new Map();
async function adminAuth(req, res, next) {
  try {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    const token = m && m[1];
    if (!token) return res.status(401).json({ error: "unauthorized" });

    const hit = okCache.get(token);
    if (hit && hit.exp > Date.now()) return next();

    const r = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
    });
    if (!r.ok) return res.status(401).json({ error: "unauthorized" });
    const u = await r.json();
    if (ADMIN_EMAIL && String(u.email || "").toLowerCase() !== ADMIN_EMAIL) {
      return res.status(403).json({ error: "forbidden" });
    }
    if (okCache.size > 200) okCache.clear();
    okCache.set(token, { exp: Date.now() + 60000 });
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "auth error" });
  }
}

const admin = express.Router();
admin.use(adminAuth);
admin.get("/students", wrap((l) => l.adminList()));
admin.patch("/students/:id", wrap(async (l, r) => ({ ok: await l.adminSetStatus(r.params.id, r.body.status) })));
admin.delete("/students/:id", wrap(async (l, r) => ({ ok: await l.adminDeleteStudent(r.params.id) })));
admin.get("/messages/:device", wrap((l, r) => l.adminMessages(r.params.device, { before: r.query.before, limit: r.query.limit })));
admin.get("/audio/:id", wrap(async (l, r) => ({ audio: await l.adminAudio(r.params.id) })));
admin.post("/messages", wrap((l, r) => l.adminSend(r.body || {})));
admin.post("/unlock/:device", wrap(async (l, r) => ({ ok: await l.adminUnlock(r.params.device) })));
admin.post("/ban/:device", wrap(async (l, r) => ({ ok: await l.adminSetBan(r.params.device, true) })));
admin.delete("/ban/:device", wrap(async (l, r) => ({ ok: await l.adminSetBan(r.params.device, false) })));
admin.delete("/messages/:device", wrap(async (l, r) => ({ ok: await l.adminClear(r.params.device) })));

/* صندوق الرسائل: قائمة المحادثات + بحث + مقروء/غير مقروء + تثبيت وملاحظات + حذف رسالة + سجل الحظر */
admin.get("/conversations", wrap((l) => l.adminConversations()));
admin.get("/messages-search", wrap((l, r) => l.adminSearchMessages(r.query.q)));
admin.post("/messages/read-all", wrap((l) => l.adminReadAll()));
admin.post("/messages/:device/unread", wrap(async (l, r) => ({ ok: await l.adminMarkUnread(r.params.device) })));
admin.delete("/message/:id", wrap(async (l, r) => ({ ok: await l.adminDeleteMessage(r.params.id) })));
admin.put("/conv-meta/:device", wrap((l, r) => l.adminConvMeta(r.params.device, r.body || {})));
admin.get("/bans", wrap((l) => l.adminBans()));

/* لوحة القيادة + العمليات الجماعية + الإعلان الجماعي */
admin.get("/solutions/stats", wrap((l) => l.adminStats()));
admin.post("/students/bulk", wrap((l, r) => l.adminBulk((r.body || {}).ids, (r.body || {}).action)));
admin.post("/broadcast", wrap((l, r) => l.adminBroadcast(r.body || {})));
admin.post("/solutions/reviews/publish-all", wrap((l) => l.adminReviewsPublishAll()));

/* أدوات موقع الحلول: التقييمات */
admin.get("/solutions/reviews", wrap((l) => l.adminReviews()));
admin.post("/solutions/reviews", wrap((l, r) => l.adminReviewSave(r.body || {})));
admin.delete("/solutions/reviews/:id", wrap(async (l, r) => ({ ok: await l.adminReviewDelete(r.params.id) })));
app.use("/api/admin", admin);

// أي خطأ غير متوقع يرجع JSON واضح بدل صفحة HTML
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: explainError(err) });
});

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log("students-api listening on " + port));
}
