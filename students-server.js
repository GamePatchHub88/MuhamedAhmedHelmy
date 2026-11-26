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
// إيقاف التسجيل من متغيرات Vercel دون أي اتصال بالقاعدة: RECORDING=off (احذفه أو اجعله on لإعادة التشغيل)
const ENV_OFF = /^(off|0|false)$/i.test(String(process.env.RECORDING || "").trim());
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
app.use(express.json({ limit: "2mb" })); // صور المدير (≤ ~1MB base64) تحتاج أكثر من 1mb

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
// أثناء إيقاف الموقع: ارفض كل طلبات الطلاب فورًا من الكاش (بدون استعلام قاعدة بيانات) لتخفيف الحمل
async function stopGuard(req, res, next) {
  try {
    const l = await getLogic();
    const st = await l.siteStatus();
    // المسموح لهم برمز وصول صالح يمرّون حتى والموقع متوقف
    if (st.enabled && !(await l.accessValid(req.headers["x-access-code"]))) return res.status(503).set("Retry-After", "300").json({ maintenance: true });
  } catch (_) { /* لو تعذّر الفحص لا نمنع الموقع */ }
  next();
}
rpc.use(stopGuard);
// تسجيل البيانات متوقف (من لوحة الإدارة): لا كتابة ولا قراءة في قاعدة الطلاب/الرسائل/التقييمات
async function recGuard(_req, res, next) {
  try {
    if (ENV_OFF) return res.json({ status: "paused" });
    if (!(await (await getLogic()).recordingState()).enabled) return res.json({ status: "paused" });
  } catch (_) { /* لو تعذّر الفحص لا نمنع الموقع */ }
  next();
}
rpc.use(recGuard);
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
rpc.post("/student_image", wrap((l, r) => l.image(r.body.p_device, r.body.p_id)));
rpc.post("/student_mark_read", wrap((l, r) => l.markRead(r.body.p_device)));
rpc.post("/student_send", wrap((l, r) =>
  l.send(r.body.p_device, r.body.p_kind, r.body.p_body, r.body.p_audio, r.body.p_duration)));
rpc.post("/review_submit", wrap((l, r) => l.reviewSubmit(r.body.p_device, r.body.p_name, r.body.p_text, r.body.p_grade)));
app.use("/api/rpc", rpc);

/* ---------- عام (بدون تسجيل): التقييمات المنشورة لموقع الحلول ---------- */
const pub = express.Router();
pub.use(limiter);
// التحقق من رمز الوصول الخاص (حد 20 محاولة في الدقيقة لكل IP ضد التخمين)
const accHits = new Map();
pub.post("/site-access", async (req, res) => {
  try {
    const now = Date.now(), h = accHits.get(req.ip);
    if (!h || now - h.t > 60000) accHits.set(req.ip, { t: now, n: 1 });
    else if (++h.n > 20) return res.status(429).json({ ok: false });
    if (accHits.size > 5000) accHits.clear();
    res.set("Cache-Control", "no-store").json(await (await getLogic()).accessUse((req.body || {}).code));
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});
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
pub.get("/reviews", stopGuard, cacheJson((l) => l.publicReviews()));
// حالة التسجيل (كاش CDN 30 ثانية): enabled=false تعني أن الموقع لا يسجّل شيئًا على القاعدة
pub.get("/recording", async (_req, res) => {
  try {
    const enabled = ENV_OFF ? false : (await (await getLogic()).recordingState()).enabled;
    res.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120").json({ enabled });
  } catch (e) {
    console.error(e);
    res.set("Cache-Control", "no-store").json({ enabled: true });
  }
});
// الشركاء + شريط الإعلان في طلب واحد (كاش CDN)
pub.get("/extras", stopGuard, cacheJson((l) => l.publicExtras()));
// شعار شريك (صورة مخزّنة في القاعدة؛ يُخزَّن طويلًا لأن الرابط يحمل ?v= يتغير عند التعديل)
pub.get("/partner-logo/:id", async (req, res) => {
  try {
    const r = await (await getLogic()).partnerLogo(req.params.id);
    if (!r) return res.status(404).end();
    res.set({
      "Content-Type": r.mime,
      "Cache-Control": "public, max-age=86400, s-maxage=2592000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    res.end(r.buf);
  } catch (e) {
    console.error(e);
    res.status(500).end();
  }
});
// عدّاد نقرات الشريك (sendBeacon)
pub.post("/partner-click/:id", async (req, res) => {
  try { await (await getLogic()).partnerClick(req.params.id); } catch (_) { /* تجاهل */ }
  res.status(204).end();
});
// حالة الموقع (متوقف/يعمل + الرسالة): كاش قصير على CDN لتتحمل ملايين الزيارات دون ضغط على الخادم
pub.get("/site-status", async (_req, res) => {
  try {
    const data = await (await getLogic()).publicSiteStatus();
    res.set("Cache-Control", "public, s-maxage=20, stale-while-revalidate=60");
    res.json(data);
  } catch (e) {
    console.error(e);
    // عند الفشل لا نُخبر الزائر بالإيقاف ولا نُخزّن الرد
    res.set("Cache-Control", "no-store").json({ enabled: false, unknown: true });
  }
});
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
admin.get("/image/:id", wrap(async (l, r) => ({ image: await l.adminImage(r.params.id) })));
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

/* إيقاف الموقع مؤقتًا + الرسالة الثابتة */
admin.get("/solutions/recording", wrap(async (l) => ({ ...(await l.recordingState()), enabled: ENV_OFF ? false : (await l.recordingState()).enabled, env_off: ENV_OFF })));
admin.put("/solutions/recording", wrap(async (l, r) => ({ ...(await l.setRecording(!!(r.body || {}).enabled)), env_off: ENV_OFF })));
admin.get("/solutions/maintenance", wrap((l) => l.adminSiteStatus()));
admin.put("/solutions/maintenance", wrap((l, r) => l.adminSiteStatusSave(r.body || {})));

/* روابط الوصول الخاصة لأشخاص معينين أثناء الإيقاف */
admin.get("/solutions/access", wrap((l) => l.adminAccessList()));
admin.post("/solutions/access", wrap((l, r) => l.adminAccessCreate(r.body || {})));
admin.delete("/solutions/access/:id", wrap(async (l, r) => ({ ok: await l.adminAccessDelete(r.params.id) })));

/* أدوات موقع الحلول: التقييمات */
admin.get("/solutions/reviews", wrap((l) => l.adminReviews()));
admin.post("/solutions/reviews", wrap((l, r) => l.adminReviewSave(r.body || {})));
admin.delete("/solutions/reviews/:id", wrap(async (l, r) => ({ ok: await l.adminReviewDelete(r.params.id) })));
/* الشركاء (التعاونات) + شريط الإعلان */
admin.get("/solutions/partners", wrap((l) => l.adminPartners()));
admin.post("/solutions/partners", wrap((l, r) => l.adminPartnerSave(r.body || {})));
admin.put("/solutions/partners-order", wrap((l, r) => l.adminPartnersReorder((r.body || {}).ids)));
admin.delete("/solutions/partners/:id", wrap(async (l, r) => ({ ok: await l.adminPartnerDelete(r.params.id) })));
admin.get("/solutions/announcement", wrap((l) => l.adminAnnouncement()));
admin.put("/solutions/announcement", wrap((l, r) => l.adminAnnouncementSave(r.body || {})));
/* قياس سرعة الخادم وقاعدة البيانات (تبويب "سرعة الموقع" في لوحة المدير) */
const msSince = (t) => Math.round((Number(process.hrtime.bigint() - t) / 1e6) * 10) / 10;
async function timed(fn) {
  const t = process.hrtime.bigint();
  try { await fn(); return { ms: msSince(t) }; } catch (e) { return { ms: msSince(t), error: String(e && e.message || e).slice(0, 160) }; }
}
admin.get("/speed", async (_req, res) => {
  const t0 = process.hrtime.bigint();
  const mem = process.memoryUsage();
  const out = {
    at: new Date().toISOString(),
    server: {
      cold_start: !cached,
      uptime_s: Math.round(process.uptime()),
      region: process.env.VERCEL_REGION || null,
      platform: process.env.VERCEL ? "vercel" : "local",
      node: process.version,
      rss_mb: Math.round(mem.rss / 1048576),
      heap_mb: Math.round(mem.heapUsed / 1048576),
    },
    mongo: { db: DB_NAME },
    supabase: {},
    collections: [],
  };
  // 1) الاتصال بقاعدة البيانات (يظهر هنا زمن فتح الاتصال لو الدالة كانت "نايمة")
  const conn = await timed(() => getLogic());
  out.mongo.connect_ms = conn.ms;
  if (conn.error) {
    out.mongo.error = explainError(new Error(conn.error));
  } else {
    const db = global.__studentsDb;
    // 2) ping متكرر + قراءة حقيقية من أكبر مجموعتين
    const pings = [];
    for (let i = 0; i < 5; i++) pings.push((await timed(() => db.command({ ping: 1 }))).ms);
    out.mongo.ping_ms = pings;
    out.mongo.read_students = await timed(() =>
      db.collection("qureo_students").find({}, { projection: { _id: 1, created_at: 1 } }).sort({ created_at: -1 }).limit(20).toArray());
    out.mongo.read_messages = await timed(() =>
      db.collection("qureo_messages").find({}, { projection: { _id: 1, created_at: 1 } }).sort({ created_at: -1 }).limit(20).toArray());
    out.mongo.count_media = await timed(async () => {
      out.mongo.media_messages = await db.collection("qureo_messages").countDocuments({ kind: { $in: ["voice", "image"] } });
    });
    // 3) حجم المجموعات (الرسائل الصوتية/الصور المخزّنة داخل المستندات تُبطئ القوائم)
    for (const name of ["qureo_students", "qureo_messages", "qureo_reviews", "qureo_bans", "qureo_convmeta"]) {
      try {
        const st = await db.command({ collStats: name });
        out.collections.push({
          name, count: st.count || 0, size: st.size || 0, avg: st.avgObjSize || 0,
          storage: st.storageSize || 0, indexes: st.nindexes || 0, index_size: st.totalIndexSize || 0,
        });
      } catch (_) {
        try { out.collections.push({ name, count: await db.collection(name).estimatedDocumentCount(), size: null }); } catch (_e) { /* تجاهل */ }
      }
    }
  }
  // 4) زمن الوصول إلى Supabase (تسجيل الدخول + بيانات الموقع الرئيسي)
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 5000);
  out.supabase = await timed(() => fetch(SUPABASE_URL + "/auth/v1/health", { headers: { apikey: SUPABASE_ANON_KEY }, signal: ctl.signal }).then((r) => { if (!r.ok) throw new Error("http " + r.status); }));
  clearTimeout(to);
  out.total_ms = msSince(t0);
  res.set("Cache-Control", "no-store");
  res.json(out);
});

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
