/* منطق أسماء الطلاب والرسائل — نسخة MongoDB من دوال student_* التي كانت في Supabase.
   لا يعرف Express؛ يأخذ db و ObjectId فقط (لسهولة الاختبار). */
"use strict";

const DEVICE_OK = (d) => typeof d === "string" && d.length >= 8 && d.length <= 80;
const ONE_HOUR = 60 * 60 * 1000;

function cleanName(raw) {
  return String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
}
function cleanType(raw) {
  const t = String(raw == null ? "" : raw).trim().slice(0, 100);
  return t || null;
}

function makeLogic({ db, ObjectId }) {
  // أسماء خاصة بموقع الحلول حتى لا تتعارض أبدًا مع مجموعات الموقع الأول (مثل students)
  const students = db.collection("qureo_students");
  const messages = db.collection("qureo_messages");
  const reviews = db.collection("qureo_reviews"); // تقييمات الطلاب
  const photos = db.collection("qureo_photos"); // صور الطلاب الذين أنهوا المنصة

  const toId = (id) => {
    try { return new ObjectId(String(id)); } catch (_) { return null; }
  };

  async function isLocked(device) {
    const req = await messages.findOne(
      { device_id: device, sender: "admin", requires_reply: true },
      { sort: { created_at: -1 } }
    );
    if (!req) return false;
    const replies = await messages.countDocuments({ device_id: device, sender: "student", created_at: { $gt: req.created_at } });
    return replies === 0;
  }

  async function latestStudent(device) {
    return students.findOne({ device_id: device }, { sort: { created_at: -1 } });
  }

  /* ---------- عام (للطلاب) ---------- */
  async function check(device, type) {
    if (!DEVICE_OK(device)) return { status: "none" };
    const r = await latestStudent(device);
    if (!r) return { status: "none" };
    if (r.status === "approved") {
      const set = { last_seen: new Date() };
      const t = cleanType(type);
      if (t) set.device_type = t;
      await students.updateOne({ _id: r._id }, { $set: set });
    }
    return {
      status: r.status,
      name: r.name,
      locked: await isLocked(device),
      unread: await messages.countDocuments({ device_id: device, sender: "admin", read_by_student: false }),
    };
  }

  async function register(device, name, type) {
    if (!DEVICE_OK(device)) return { status: "invalid" };
    const clean = cleanName(name);
    if (clean.length < 2 || clean.length > 40) return { status: "invalid" };

    const r = await latestStudent(device);
    if (r && r.status === "approved") return { status: "approved", name: r.name };

    const rejected = await students.find({ device_id: device, status: "rejected" }).toArray();
    if (rejected.some((x) => String(x.name).toLowerCase() === clean.toLowerCase())) {
      return { status: "same_rejected" };
    }

    const now = new Date();
    await students.insertOne({
      device_id: device, name: clean, status: "approved",
      device_type: cleanType(type), created_at: now, last_seen: now,
    });
    return { status: "approved", name: clean };
  }

  async function inbox(device) {
    if (!DEVICE_OK(device)) return { messages: [], locked: false };
    const rows = await messages
      .find({ device_id: device }, { projection: { audio: 0 } })
      .sort({ created_at: -1 }).limit(60).toArray();
    rows.reverse();
    return {
      locked: await isLocked(device),
      messages: rows.map((m) => ({
        id: String(m._id), sender: m.sender, kind: m.kind, body: m.body || null,
        duration: m.duration || null, requires_reply: !!m.requires_reply, created_at: m.created_at,
      })),
    };
  }

  async function audio(device, id) {
    const oid = toId(id);
    if (!DEVICE_OK(device) || !oid) return null;
    const m = await messages.findOne({ _id: oid, device_id: device, kind: "voice" });
    return m ? m.audio : null;
  }

  async function markRead(device) {
    if (!DEVICE_OK(device)) return null;
    await messages.updateMany({ device_id: device, sender: "admin", read_by_student: false }, { $set: { read_by_student: true } });
    return null;
  }

  function validateContent(kind, body, audioData, duration) {
    if (kind === "text") {
      const txt = String(body == null ? "" : body).trim();
      if (txt.length < 1 || txt.length > 1000) return null;
      return { kind: "text", body: txt };
    }
    if (kind === "voice") {
      const dur = Math.round(Number(duration));
      if (typeof audioData !== "string" || !audioData.startsWith("data:audio/") || audioData.length > 600000) return null;
      if (!Number.isFinite(dur) || dur < 1 || dur > 120) return null;
      return { kind: "voice", audio: audioData, duration: dur };
    }
    return null;
  }

  async function send(device, kind, body, audioData, duration) {
    if (!DEVICE_OK(device) || !(await students.findOne({ device_id: device }))) return { status: "invalid" };
    const recent = await messages.countDocuments({
      device_id: device, sender: "student", created_at: { $gt: new Date(Date.now() - ONE_HOUR) },
    });
    if (recent >= 30) return { status: "rate_limited" };

    const c = validateContent(kind, body, audioData, duration);
    if (!c) return { status: "invalid" };

    await messages.insertOne({
      device_id: device, sender: "student", ...c,
      requires_reply: false, read_by_admin: false, read_by_student: true, created_at: new Date(),
    });
    return { status: "ok", locked: await isLocked(device) };
  }

  /* ---------- المدير ---------- */
  async function adminList() {
    const rows = await students.find({}).sort({ created_at: -1 }).toArray();
    const metas = await messages
      .find({}, { projection: { device_id: 1, sender: 1, requires_reply: 1, read_by_admin: 1, created_at: 1 } })
      .sort({ created_at: -1 }).limit(2000).toArray();

    const info = {}, lastReq = {}, lastStu = {};
    metas.forEach((m) => {
      const i = (info[m.device_id] = info[m.device_id] || { unread: 0, locked: false });
      const t = new Date(m.created_at).getTime();
      if (m.sender === "student") {
        if (!m.read_by_admin) i.unread++;
        if (!lastStu[m.device_id] || t > lastStu[m.device_id]) lastStu[m.device_id] = t;
      } else if (m.requires_reply) {
        if (!lastReq[m.device_id] || t > lastReq[m.device_id]) lastReq[m.device_id] = t;
      }
    });
    Object.keys(lastReq).forEach((d) => { info[d].locked = lastReq[d] > (lastStu[d] || 0); });

    return {
      students: rows.map((s) => ({
        id: String(s._id), device_id: s.device_id, name: s.name, status: s.status,
        created_at: s.created_at, last_seen: s.last_seen, device_type: s.device_type || null,
      })),
      info,
    };
  }

  async function adminSetStatus(id, status) {
    const oid = toId(id);
    if (!oid || !["approved", "rejected"].includes(status)) return false;
    const r = await students.updateOne({ _id: oid }, { $set: { status } });
    return r.matchedCount > 0;
  }

  async function adminDeleteStudent(id) {
    const oid = toId(id);
    if (!oid) return false;
    const r = await students.deleteOne({ _id: oid });
    return r.deletedCount > 0;
  }

  async function adminMessages(device) {
    if (!DEVICE_OK(device)) return { messages: [], locked: false };
    const rows = await messages
      .find({ device_id: device }, { projection: { audio: 0 } })
      .sort({ created_at: 1 }).limit(200).toArray();
    await messages.updateMany({ device_id: device, sender: "student", read_by_admin: false }, { $set: { read_by_admin: true } });
    return {
      locked: await isLocked(device),
      messages: rows.map((m) => ({
        id: String(m._id), sender: m.sender, kind: m.kind, body: m.body || null,
        duration: m.duration || null, requires_reply: !!m.requires_reply, created_at: m.created_at,
      })),
    };
  }

  async function adminAudio(id) {
    const oid = toId(id);
    if (!oid) return null;
    const m = await messages.findOne({ _id: oid, kind: "voice" });
    return m ? m.audio : null;
  }

  async function adminSend({ device_id, kind, body, audio: audioData, duration, requires_reply }) {
    if (!DEVICE_OK(device_id) || !(await students.findOne({ device_id }))) return { status: "invalid" };
    const c = validateContent(kind, body, audioData, duration);
    if (!c) return { status: "invalid" };
    await messages.insertOne({
      device_id, sender: "admin", ...c,
      requires_reply: requires_reply === true, read_by_admin: true, read_by_student: false, created_at: new Date(),
    });
    return { status: "ok" };
  }

  async function adminUnlock(device) {
    if (!DEVICE_OK(device)) return false;
    await messages.updateMany({ device_id: device, sender: "admin", requires_reply: true }, { $set: { requires_reply: false } });
    return true;
  }

  async function adminClear(device) {
    if (!DEVICE_OK(device)) return false;
    await messages.deleteMany({ device_id: device });
    return true;
  }


  /* =========================================================
     تقييمات الطلاب (reviews) — status: pending | published
     - الطالب يرسل تقييمًا من الموقع فيدخل "pending" حتى يوافق عليه المدير
     - المدير يضيف/يعدّل/ينشر/يحذف من لوحة التحكم
  ========================================================= */
  const clip = (raw, max) => String(raw == null ? "" : raw).replace(/\s+/g, " ").trim().slice(0, max);
  const reviewOut = (r) => ({
    id: String(r._id), name: r.name, role: r.role || "طالب", text: r.text,
    order: r.order || 0, status: r.status, created_at: r.created_at,
  });

  async function publicReviews() {
    const rows = await reviews.find({ status: "published" }).sort({ order: 1, created_at: -1 }).limit(60).toArray();
    return { reviews: rows.map((r) => { const o = reviewOut(r); return { id: o.id, name: o.name, role: o.role, text: o.text }; }) };
  }

  async function reviewSubmit(device, name, text, grade) {
    if (!DEVICE_OK(device)) return { status: "invalid" };
    const st = await latestStudent(device);
    if (!st || st.status !== "approved") return { status: "invalid" };
    const n = clip(name, 40), t = clip(text, 400);
    if (n.length < 2 || t.length < 10) return { status: "invalid" };
    const recent = await reviews.countDocuments({ device_id: device, created_at: { $gt: new Date(Date.now() - 24 * ONE_HOUR) } });
    if (recent >= 1) return { status: "rate_limited" };
    if ((await reviews.countDocuments({ device_id: device })) >= 3) return { status: "limit" };
    const g = { 1: "الصف الأول الثانوي", 2: "الصف الثاني الثانوي" }[String(grade)];
    const now = new Date();
    await reviews.insertOne({
      device_id: device, name: n, role: g ? "طالب — " + g : "طالب من موقع الحلول", text: t,
      order: 0, status: "pending", created_at: now, updated_at: now,
    });
    return { status: "ok" };
  }

  async function adminReviews() {
    const rows = await reviews.find({}).sort({ created_at: -1 }).limit(500).toArray();
    return { reviews: rows.map(reviewOut) };
  }

  // إنشاء (بدون id) أو تعديل (مع id)
  async function adminReviewSave({ id, name, role, text, order, status }) {
    const n = clip(name, 40), t = clip(text, 400), r = clip(role, 80) || "طالب من موقع الحلول";
    if (n.length < 2 || t.length < 3) return { status: "invalid" };
    const ord = Math.max(-9999, Math.min(9999, Math.round(Number(order) || 0)));
    const st = status === "pending" ? "pending" : "published";
    const now = new Date();
    if (id) {
      const oid = toId(id);
      if (!oid) return { status: "invalid" };
      const res = await reviews.updateOne({ _id: oid }, { $set: { name: n, role: r, text: t, order: ord, status: st, updated_at: now } });
      return { status: res.matchedCount ? "ok" : "not_found" };
    }
    await reviews.insertOne({ name: n, role: r, text: t, order: ord, status: st, created_at: now, updated_at: now });
    return { status: "ok" };
  }

  async function adminReviewDelete(id) {
    const oid = toId(id);
    if (!oid) return false;
    return (await reviews.deleteOne({ _id: oid })).deletedCount > 0;
  }

  /* =========================================================
     صور الطلاب الذين أنهوا المنصة (photos)
     كل صورة تُخزَّن بنسختين: thumb صغيرة للمعرض + full للتكبير.
     الصور تُخدَّم كملفات (وليس داخل JSON) مع كاش طويل، فلا تثقل الصفحة.
  ========================================================= */
  const MAX_PHOTOS = 60, MAX_THUMB = 150 * 1024, MAX_FULL = 900 * 1024;

  function decodeImage(dataUrl, maxBytes) {
    const m = /^data:image\/(?:webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
    if (!m) return null;
    const buf = Buffer.from(m[1], "base64");
    if (!buf.length || buf.length > maxBytes) return null;
    // نتحقق من نوع الملف الحقيقي (وليس من الادعاء) قبل الحفظ
    let type = null;
    if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") type = "image/webp";
    else if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) type = "image/jpeg";
    else if (buf.slice(1, 4).toString("latin1") === "PNG") type = "image/png";
    return type ? { buf, type } : null;
  }

  const photoOut = (p) => ({
    id: String(p._id), caption: p.caption || "", name: p.name || "", w: p.w || 0, h: p.h || 0,
    order: p.order || 0, v: new Date(p.updated_at || p.created_at).getTime(),
  });

  async function publicPhotos() {
    const rows = await photos.find({}, { projection: { thumb: 0, full: 0 } }).sort({ order: 1, created_at: -1 }).limit(MAX_PHOTOS).toArray();
    return { photos: rows.map(photoOut) };
  }

  async function photoImage(id, kind) {
    const oid = toId(id);
    if (!oid || (kind !== "thumb" && kind !== "full")) return null;
    const p = await photos.findOne({ _id: oid }, { projection: { [kind]: 1, [kind + "_type"]: 1 } });
    if (!p || !p[kind]) return null;
    const raw = p[kind];
    return { buf: Buffer.isBuffer(raw) ? raw : Buffer.from(raw.buffer), type: p[kind + "_type"] || "image/webp" };
  }

  const adminPhotos = publicPhotos;

  // إضافة (بدون id: الصورتان مطلوبتان) أو تعديل (مع id: الصور اختيارية)
  async function adminPhotoSave({ id, caption, name, order, thumb, full, w, h }) {
    const set = {
      caption: clip(caption, 120), name: clip(name, 40),
      order: Math.max(-9999, Math.min(9999, Math.round(Number(order) || 0))), updated_at: new Date(),
    };
    let t = null, f = null;
    if (thumb || full || !id) {
      t = decodeImage(thumb, MAX_THUMB);
      f = decodeImage(full, MAX_FULL);
      if (!t || !f) return { status: "invalid_image" };
      set.thumb = t.buf; set.thumb_type = t.type;
      set.full = f.buf; set.full_type = f.type;
      set.w = Math.max(1, Math.min(4000, Math.round(Number(w) || 0))) || 1;
      set.h = Math.max(1, Math.min(4000, Math.round(Number(h) || 0))) || 1;
    }
    if (id) {
      const oid = toId(id);
      if (!oid) return { status: "invalid" };
      const res = await photos.updateOne({ _id: oid }, { $set: set });
      return { status: res.matchedCount ? "ok" : "not_found" };
    }
    if ((await photos.countDocuments({})) >= MAX_PHOTOS) return { status: "too_many" };
    await photos.insertOne({ ...set, created_at: new Date() });
    return { status: "ok" };
  }

  async function adminPhotoDelete(id) {
    const oid = toId(id);
    if (!oid) return false;
    return (await photos.deleteOne({ _id: oid })).deletedCount > 0;
  }

  /* =========================================================
     لوحة القيادة: إحصائيات مجمّعة داخل MongoDB (بدون سحب البيانات الخام)
     - كل شيء في استدعاء واحد + كاش 15 ثانية حتى لا تُحمَّل القاعدة
     - لا تُقرأ حقول الصوت أبدًا
  ========================================================= */
  const STATS_TZ = process.env.STATS_TZ || "Africa/Cairo";
  const DAY = 24 * ONE_HOUR;
  let statsCache = null;

  // مفاتيح آخر n يوم (YYYY-MM-DD) بحسب المنطقة الزمنية، بحساب تقويمي دقيق (آمن مع التوقيت الصيفي)
  function dayKeys(n, tz) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const [y, m, d] = today.split("-").map(Number);
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1, d - i, 12)).toISOString().slice(0, 10));
    return out;
  }

  async function adminStats() {
    if (statsCache && Date.now() - statsCache.t < 15000) return statsCache.data;
    const tz = STATS_TZ, now = Date.now();
    const ago = (ms) => new Date(now - ms);
    const dayExpr = { $dateToString: { format: "%Y-%m-%d", date: "$created_at", timezone: tz } };
    const hw = { w: { $dayOfWeek: { date: "$created_at", timezone: tz } }, h: { $hour: { date: "$created_at", timezone: tz } } };
    const keys30 = dayKeys(30, tz), keys14 = keys30.slice(-14);
    const since30 = ago(30 * DAY), since14 = ago(14 * DAY);
    const cnt = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
    const typeIs = (re) => ({ $regexMatch: { input: { $ifNull: ["$type", ""] }, regex: re } });

    const [dev, stuFacet, rawTypes, msgFacet, unread, voice, totalMsgs, reqs, revAgg, photoCount, recentStu, recentMsg, recentRev] = await Promise.all([
      // (1) آخر سجل لكل جهاز ثم عدّادات مجمّعة
      students.aggregate([
        { $sort: { created_at: -1 } },
        { $group: { _id: "$device_id", status: { $first: "$status" }, seen: { $first: "$last_seen" }, type: { $first: "$device_type" }, first: { $last: "$created_at" } } },
        { $group: {
          _id: null, devices: { $sum: 1 },
          approved: cnt({ $eq: ["$status", "approved"] }),
          rejected: cnt({ $eq: ["$status", "rejected"] }),
          online: cnt({ $and: [{ $eq: ["$status", "approved"] }, { $gt: ["$seen", ago(90 * 1000)] }] }),
          active24: cnt({ $and: [{ $eq: ["$status", "approved"] }, { $gt: ["$seen", ago(DAY)] }] }),
          active7: cnt({ $and: [{ $eq: ["$status", "approved"] }, { $gt: ["$seen", ago(7 * DAY)] }] }),
          new7: cnt({ $gt: ["$first", ago(7 * DAY)] }),
          prev7: cnt({ $and: [{ $gt: ["$first", ago(14 * DAY)] }, { $lte: ["$first", ago(7 * DAY)] }] }),
          returning: cnt({ $and: [{ $eq: ["$status", "approved"] }, { $gt: [{ $subtract: ["$seen", "$first"] }, DAY] }] }),
          phone: cnt(typeIs("^هاتف")), tablet: cnt(typeIs("^تابلت")),
          desktop: cnt({ $and: [{ $ne: [{ $ifNull: ["$type", ""] }, ""] }, { $not: [typeIs("^(هاتف|تابلت)")] }] }),
          unknown: cnt({ $eq: [{ $ifNull: ["$type", ""] }, ""] }),
        } },
      ]).toArray(),
      // (2) تسجيلات آخر 30 يومًا: يوميًا + خريطة حرارية
      students.aggregate([
        { $match: { created_at: { $gte: since30 } } },
        { $facet: { daily: [{ $group: { _id: dayExpr, n: { $sum: 1 } } }], heat: [{ $group: { _id: hw, n: { $sum: 1 } } }] } },
      ]).toArray(),
      // (3) أكثر أنواع الأجهزة
      students.aggregate([
        { $match: { status: "approved", device_type: { $ne: null } } },
        { $group: { _id: "$device_type", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 6 },
      ]).toArray(),
      // (4) رسائل آخر 30 يومًا: يومي (14) + خريطة حرارية + الأكثر نشاطًا
      messages.aggregate([
        { $match: { created_at: { $gte: since30 } } },
        { $project: { sender: 1, device_id: 1, created_at: 1 } },
        { $facet: {
          daily: [{ $match: { created_at: { $gte: since14 } } }, { $group: { _id: { d: dayExpr, s: "$sender" }, n: { $sum: 1 } } }],
          heat: [{ $match: { sender: "student" } }, { $group: { _id: hw, n: { $sum: 1 } } }],
          top: [{ $match: { sender: "student" } }, { $group: { _id: "$device_id", n: { $sum: 1 }, last: { $max: "$created_at" } } }, { $sort: { n: -1 } }, { $limit: 5 }],
        } },
      ]).toArray(),
      messages.countDocuments({ sender: "student", read_by_admin: false }),
      messages.countDocuments({ kind: "voice" }),
      messages.estimatedDocumentCount(),
      // (5) طلبات "لا يدخل حتى يرد" لحساب المحجوبين
      messages.aggregate([
        { $match: { sender: "admin", requires_reply: true } },
        { $group: { _id: "$device_id", t: { $max: "$created_at" } } }, { $limit: 500 },
      ]).toArray(),
      reviews.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
      photos.estimatedDocumentCount(),
      students.find({}, { projection: { name: 1, device_type: 1, created_at: 1 } }).sort({ created_at: -1 }).limit(8).toArray(),
      messages.find({ sender: "student" }, { projection: { device_id: 1, kind: 1, body: 1, created_at: 1 } }).sort({ created_at: -1 }).limit(8).toArray(),
      reviews.find({}, { projection: { name: 1, status: 1, created_at: 1 } }).sort({ created_at: -1 }).limit(5).toArray(),
    ]);

    // المحجوبون: آخر طلب من المدير أحدث من آخر رد للطالب
    let locked = 0;
    if (reqs.length) {
      const reps = await messages.aggregate([
        { $match: { sender: "student", device_id: { $in: reqs.map((x) => x._id) } } },
        { $group: { _id: "$device_id", t: { $max: "$created_at" } } },
      ]).toArray();
      const rep = new Map(reps.map((x) => [x._id, new Date(x.t).getTime()]));
      locked = reqs.filter((x) => new Date(x.t).getTime() > (rep.get(x._id) || 0)).length;
    }

    const k = dev[0] || {};
    const sf = (stuFacet[0] || { daily: [], heat: [] }), mf = (msgFacet[0] || { daily: [], heat: [], top: [] });
    const dailyMap = new Map(sf.daily.map((x) => [x._id, x.n]));
    const mS = new Map(), mA = new Map();
    mf.daily.forEach((x) => (x._id.s === "student" ? mS : mA).set(x._id.d, x.n));
    const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));
    [...sf.heat, ...mf.heat].forEach((x) => { if (x._id.w >= 1 && x._id.w <= 7 && x._id.h >= 0 && x._id.h < 24) heat[x._id.w - 1][x._id.h] += x.n; });

    // أسماء الأجهزة المذكورة في الأكثر نشاطًا وآخر الرسائل
    const devIds = [...new Set([...mf.top.map((x) => x._id), ...recentMsg.map((x) => x.device_id)])];
    const nameRows = devIds.length
      ? await students.find({ device_id: { $in: devIds } }, { projection: { device_id: 1, name: 1 } }).sort({ created_at: 1 }).toArray()
      : [];
    const names = {};
    nameRows.forEach((x) => { names[x.device_id] = x.name; }); // الأحدث يكتب فوق الأقدم

    const rv = { pending: 0, published: 0 };
    revAgg.forEach((x) => { if (x._id === "pending" || x._id === "published") rv[x._id] = x.n; });

    const feed = [
      ...recentStu.map((s) => ({ t: s.created_at, type: "signup", who: s.name, text: s.device_type || "" })),
      ...recentMsg.map((m) => ({ t: m.created_at, type: "msg", who: names[m.device_id] || "طالب", text: m.kind === "voice" ? "🎙 رسالة صوتية" : String(m.body || "").slice(0, 90) })),
      ...recentRev.map((r) => ({ t: r.created_at, type: "review", who: r.name, text: r.status === "pending" ? "تقييم جديد بانتظار المراجعة" : "تقييم منشور" })),
    ].sort((a, b) => new Date(b.t) - new Date(a.t)).slice(0, 14);

    const data = {
      generated: now, tz,
      kpi: {
        devices: k.devices || 0, approved: k.approved || 0, rejected: k.rejected || 0, online: k.online || 0,
        active24: k.active24 || 0, active7: k.active7 || 0, new7: k.new7 || 0, prev7: k.prev7 || 0,
        returning: k.returning || 0, unread, locked, messages: totalMsgs, voice,
      },
      days: keys30,
      signups: keys30.map((d) => dailyMap.get(d) || 0),
      msgDays: keys14,
      msgStudent: keys14.map((d) => mS.get(d) || 0),
      msgAdmin: keys14.map((d) => mA.get(d) || 0),
      devices: { phone: k.phone || 0, tablet: k.tablet || 0, desktop: k.desktop || 0, unknown: k.unknown || 0, raw: rawTypes.map((x) => ({ type: x._id, n: x.n })) },
      heat,
      reviews: { ...rv, total: rv.pending + rv.published },
      photos: photoCount,
      top: mf.top.map((x) => ({ name: names[x._id] || "طالب", n: x.n, last: x.last })),
      feed,
    };
    statsCache = { t: Date.now(), data };
    return data;
  }

  /* ---------- عمليات جماعية على الأسماء ---------- */
  async function adminBulk(ids, action) {
    const list = (Array.isArray(ids) ? ids : []).slice(0, 200).map(toId).filter(Boolean);
    if (!list.length) return { status: "invalid" };
    statsCache = null;
    if (action === "delete") return { status: "ok", n: (await students.deleteMany({ _id: { $in: list } })).deletedCount };
    if (action === "approve" || action === "reject") {
      const r = await students.updateMany({ _id: { $in: list } }, { $set: { status: action === "approve" ? "approved" : "rejected" } });
      return { status: "ok", n: r.modifiedCount };
    }
    return { status: "invalid" };
  }

  /* ---------- إعلان جماعي نصي (بدون منع الدخول، حتى لا يُحجب الجميع بالخطأ) ---------- */
  async function adminBroadcast({ body, audience }) {
    const txt = String(body == null ? "" : body).trim();
    if (txt.length < 1 || txt.length > 1000) return { status: "invalid" };
    const pipe = [
      { $sort: { created_at: -1 } },
      { $group: { _id: "$device_id", status: { $first: "$status" }, seen: { $first: "$last_seen" } } },
      { $match: { status: "approved" } },
    ];
    if (audience === "online") pipe.push({ $match: { seen: { $gt: new Date(Date.now() - 90 * 1000) } } });
    else if (audience === "active24") pipe.push({ $match: { seen: { $gt: new Date(Date.now() - DAY) } } });
    pipe.push({ $limit: 500 });
    const devs = await students.aggregate(pipe).toArray();
    if (!devs.length) return { status: "ok", n: 0 };
    const now = new Date();
    await messages.insertMany(
      devs.map((x) => ({ device_id: x._id, sender: "admin", kind: "text", body: txt, requires_reply: false, read_by_admin: true, read_by_student: false, created_at: now })),
      { ordered: false }
    );
    statsCache = null;
    return { status: "ok", n: devs.length };
  }

  async function adminReviewsPublishAll() {
    statsCache = null;
    const r = await reviews.updateMany({ status: "pending" }, { $set: { status: "published", updated_at: new Date() } });
    return { status: "ok", n: r.modifiedCount };
  }

  async function ensureIndexes() {
    await students.createIndex({ device_id: 1, created_at: -1 });
    await messages.createIndex({ device_id: 1, created_at: 1 });
    await reviews.createIndex({ status: 1, order: 1, created_at: -1 });
    await reviews.createIndex({ device_id: 1, created_at: -1 });
    await photos.createIndex({ order: 1, created_at: -1 });
    // فهارس لوحة القيادة (تجعل الإحصائيات سريعة وخفيفة)
    await students.createIndex({ created_at: -1 });
    await messages.createIndex({ created_at: -1, sender: 1 });
    await messages.createIndex({ sender: 1, read_by_admin: 1 });
    await messages.createIndex({ sender: 1, requires_reply: 1, created_at: -1 });
    await messages.createIndex({ kind: 1 });
  }

  return {
    check, register, inbox, audio, markRead, send,
    adminList, adminSetStatus, adminDeleteStudent, adminMessages, adminAudio, adminSend, adminUnlock, adminClear,
    publicReviews, reviewSubmit, adminReviews, adminReviewSave, adminReviewDelete,
    publicPhotos, photoImage, adminPhotos, adminPhotoSave, adminPhotoDelete,
    adminStats, adminBulk, adminBroadcast, adminReviewsPublishAll,
    ensureIndexes,
  };
}

// رسالة عربية مفهومة لأي خطأ (بدون كشف أسرار)
function explainError(e) {
  const m = String((e && e.message) || e || "");
  if (/MONGODB_URI/.test(m)) return "MONGODB_URI غير مضبوط في متغيرات Vercel";
  if (e && (e.code === 18 || e.code === 8000 || /bad auth|authentication failed/i.test(m))) {
    return "فشل تسجيل الدخول إلى MongoDB: تحقق من اسم المستخدم وكلمة المرور في MONGODB_URI";
  }
  if (e && (e.code === 13 || /not authorized|unauthorized/i.test(m))) {
    return "المستخدم لا يملك صلاحية على قاعدة qureo_solutions: امنحه Read and write to any database من Atlas";
  }
  if (e && (e.name === "MongoServerSelectionError" || e.name === "MongoNetworkError" || /ENOTFOUND|ECONNREFUSED|timed out|ReplicaSetNoPrimary/i.test(m))) {
    return "تعذر الاتصال بـ MongoDB: تحقق من Network Access في Atlas (اسمح 0.0.0.0/0) ومن صحة الرابط";
  }
  return "خطأ في الخادم: " + m.slice(0, 120);
}

module.exports = { makeLogic, explainError };
