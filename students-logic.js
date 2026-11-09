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

/* =========================================================
   تحليل الجهاز: User-Agent من المتصفح + بيانات إضافية يرسلها موقع الطالب (اختيارية)
   الناتج: { type: "هاتف · Samsung SM-S918B · Android · Chrome", info: {...} }
   type يبدأ دائمًا بـ: هاتف | تابلت | كمبيوتر (تعتمد عليه إحصائيات لوحة القيادة).
========================================================= */
const BRANDS = [
  [/^(iPhone|iPad|iPod|Mac)/i, "Apple"], [/^(SM-|GT-|SC-|Samsung)/i, "Samsung"],
  [/(Redmi|POCO|Xiaomi|^Mi\s|^M\d{4}[A-Z]\d|^2\d{6,}[A-Z]{0,2}$)/i, "Xiaomi"],
  [/^(CPH|PH[A-Z]\d|OPPO)/i, "OPPO"], [/^(RMX|realme)/i, "realme"], [/^(V\d{4}|vivo)/i, "vivo"],
  [/(HUAWEI|HONOR|^[A-Z]{3}-[LAN]\d{2}|^[A-Z]{3}-AL\d{2})/i, "Huawei/Honor"], [/Pixel/i, "Google"],
  [/(TECNO|^T[A-Z]\d{3,4}|^CK\d|^CL\d)/i, "TECNO"], [/(Infinix|^X\d{3,4}[A-Z]?$)/i, "Infinix"],
  [/itel/i, "itel"], [/^(moto|XT\d{4})/i, "Motorola"], [/Nokia/i, "Nokia"], [/(OnePlus|^(IN|KB|LE|HD|GM)\d{4})/i, "OnePlus"],
  [/Lenovo/i, "Lenovo"], [/^(Lenovo|TB-)/i, "Lenovo"],
];
function brandOf(model, os) {
  const m = String(model || "");
  if (os === "iOS" || os === "iPadOS" || os === "macOS") return "Apple";
  for (const [re, name] of BRANDS) if (m && re.test(m)) return name;
  return "";
}

function parseUA(uaRaw) {
  const ua = String(uaRaw || "").slice(0, 500);
  if (!ua) return null;
  let kind = "كمبيوتر", os = "", os_ver = "", model = "";
  if (/iPad/.test(ua)) { kind = "تابلت"; os = "iPadOS"; model = "iPad"; }
  else if (/iPhone|iPod/.test(ua)) { kind = "هاتف"; os = "iOS"; model = "iPhone"; }
  else if (/Android/.test(ua)) {
    kind = /Mobile/i.test(ua) ? "هاتف" : "تابلت";
    os = "Android";
    const m = /Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?\s*[;)]/.exec(ua);
    const name = m ? m[1].trim() : "";
    // Chrome الحديث يخفي الموديل ويكتب "K" فقط، فنتجاهل القيم العامة
    if (name.length > 2 && !/^(wv|mobile|linux|u|generic android.*)$/i.test(name)) model = name;
  }
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux|X11/.test(ua)) os = "Linux";

  if (os === "Android") os_ver = (/Android ([\d.]+)/.exec(ua) || [])[1] || "";
  else if (os === "iOS" || os === "iPadOS") os_ver = ((/OS (\d+)[_.](\d+)/.exec(ua) || []).slice(1, 3)).join(".");
  else if (os === "Windows") os_ver = (/Windows NT ([\d.]+)/.exec(ua) || [])[1] || "";
  else if (os === "macOS") os_ver = ((/Mac OS X ([\d_.]+)/.exec(ua) || [])[1] || "").replace(/_/g, ".");

  let browser = "", bv = "";
  const ver = (re) => (re.exec(ua) || [])[1] || "";
  if (/FBAN|FBAV/.test(ua)) browser = "فيسبوك (متصفح داخلي)";
  else if (/Instagram/.test(ua)) browser = "إنستغرام (متصفح داخلي)";
  else if (/EdgA?\/|Edg\//.test(ua)) { browser = "Edge"; bv = ver(/Edg[A]?\/(\d+)/); }
  else if (/OPR\/|Opera/.test(ua)) { browser = "Opera"; bv = ver(/OPR\/(\d+)/); }
  else if (/SamsungBrowser/.test(ua)) { browser = "Samsung Internet"; bv = ver(/SamsungBrowser\/(\d+)/); }
  else if (/Firefox\/|FxiOS/.test(ua)) { browser = "Firefox"; bv = ver(/(?:Firefox|FxiOS)\/(\d+)/); }
  else if (/CriOS|Chrome\//.test(ua)) { browser = "Chrome"; bv = ver(/(?:Chrome|CriOS)\/(\d+)/); }
  else if (/Safari\//.test(ua)) { browser = "Safari"; bv = ver(/Version\/(\d+)/); }

  return { kind, os, os_ver, model, browser, browser_ver: bv, brand: brandOf(model, os) };
}

// تنقية البيانات التي يرسلها موقع الطالب (لا نثق بها: نقصّ الطول ونتحقق من الأنواع)
function cleanInfo(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const str = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
  const num = (v, a, b) => { v = Number(v); return Number.isFinite(v) && v >= a && v <= b ? Math.round(v * 100) / 100 : null; };
  const hash = (v) => (/^[a-f0-9]{16,64}$/.test(String(v)) ? String(v) : null);
  return {
    model: str(raw.model, 60), pv: str(raw.pv, 30), bv: str(raw.bv, 30), arch: str(raw.arch, 12),
    w: num(raw.w, 100, 10000), h: num(raw.h, 100, 10000), dpr: num(raw.dpr, 0.5, 10),
    cores: num(raw.cores, 1, 256), mem: num(raw.mem, 0.25, 1024), touch: num(raw.touch, 0, 50),
    gpu: str(raw.gpu, 90), tz: str(raw.tz, 50), lang: str(raw.lang, 20), net: str(raw.net, 12),
    fp: hash(raw.fp), hw: hash(raw.hw),
  };
}

function cleanIp(raw) {
  const v = String(raw == null ? "" : raw).trim().slice(0, 45);
  return /^[0-9a-fA-F:.]+$/.test(v) ? v : null;
}

function deviceLabel(info) {
  const modelLabel = info.model && info.brand && info.brand !== "Apple" && !info.model.toLowerCase().startsWith(info.brand.toLowerCase())
    ? info.brand + " " + info.model : info.model;
  return [info.kind, modelLabel, info.os, info.browser].filter(Boolean).join(" · ").slice(0, 100);
}

function analyzeDevice(clientTypeRaw, ua, rawInfo) {
  const u = parseUA(ua), c = cleanInfo(rawInfo), ct = cleanType(clientTypeRaw);
  if (!u && !c) return { type: ct, info: null };
  const info = Object.assign({ kind: "كمبيوتر", os: "", os_ver: "", model: "", browser: "", browser_ver: "" }, u || {});
  if (c) {
    if (c.model && c.model.length > 2) info.model = c.model;                 // الموديل الحقيقي من Client Hints
    if (c.bv) info.browser_ver = c.bv;
    if (c.pv) {
      const major = parseInt(c.pv, 10);
      if (info.os === "Windows") info.os_ver = major >= 13 ? "11" : "10";    // UA يقول 10 حتى على ويندوز 11
      else if (info.os === "Android") info.os_ver = String(major || info.os_ver);
      else if (info.os === "macOS" || info.os === "ChromeOS") info.os_ver = c.pv;
    } else if (info.os === "Windows") info.os_ver = "10/11";
    ["w", "h", "dpr", "cores", "mem", "touch", "gpu", "tz", "lang", "net", "arch", "fp", "hw"].forEach((k) => { if (c[k] != null && c[k] !== "") info[k] = c[k]; });
    // iPad بوضع سطح المكتب يتنكر كـ Mac لكنه يملك شاشة لمس
    if (info.os === "macOS" && c.touch > 1) { info.kind = "تابلت"; info.os = "iPadOS"; info.model = "iPad"; }
  }
  if (/^(هاتف|تابلت)/.test(ct || "") && info.kind === "كمبيوتر" && !(c && c.touch === 0)) info.kind = ct.startsWith("هاتف") ? "هاتف" : "تابلت";
  info.brand = brandOf(info.model, info.os);
  if (info.os === "Windows" && /^\d+\.\d+$/.test(info.os_ver)) info.os_ver = "10/11";
  return { type: deviceLabel(info), info };
}
function parseDevice(ua) { return analyzeDevice(null, ua, null).type; }
function pickDeviceType(clientRaw, ua, rawInfo) { return analyzeDevice(clientRaw, ua, rawInfo).type; }

function makeLogic({ db, ObjectId }) {
  // أسماء خاصة بموقع الحلول حتى لا تتعارض أبدًا مع مجموعات الموقع الأول (مثل students)
  const students = db.collection("qureo_students");
  const messages = db.collection("qureo_messages");
  const reviews = db.collection("qureo_reviews"); // تقييمات الطلاب
  const bans = db.collection("qureo_bans"); // أجهزة محظورة بالكامل (تظهر لها المحادثة مع الإدارة فقط)

  const toId = (id) => {
    try { return new ObjectId(String(id)); } catch (_) { return null; }
  };

  // هل الجهاز محظور؟ إما بمعرّفه، أو ببصمته القوية (تتجاوز مسح بيانات المتصفح وتغيير المعرّف).
  // عند المطابقة بالبصمة ينتقل الحظر تلقائيًا إلى المعرّف الجديد أيضًا.
  async function isBanned(device, fpHint) {
    // وثيقة موجودة بـ released=true تعني أن المدير رفع الحظر التلقائي عن هذا الجهاز عمدًا (مثلًا طالب بريء يتشابه جهازه)
    const direct = await bans.findOne({ device_id: device }, { projection: { released: 1 } });
    if (direct) return !direct.released;
    let fp = fpHint || null, hw = null;
    if (!fp) {
      const st = await latestStudent(device);
      const di = st && st.device_info;
      fp = di && di.fp; hw = di && di.hw;
    }
    if (!fp) return false;
    const hit = await bans.findOne({ fp, released: { $ne: true } }, { projection: { device_id: 1 } });
    if (!hit) return false;
    if (!fpHint) {
      statsCache = null;
      await bans.updateOne(
        { device_id: device },
        { $setOnInsert: { device_id: device, banned_at: new Date(), fp, hw: hw || null, auto_from: hit.device_id } },
        { upsert: true }
      ).catch(() => {});
    }
    return true;
  }

  // الحظر الكامل يُحسب كقفل دائم: الموقع الحالي للطالب يعرض له المحادثة مع الإدارة فقط ولا يرفعه الرد
  async function isLocked(device) {
    if (await isBanned(device)) return true;
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
  async function check(device, type, ua, info, ip) {
    if (!DEVICE_OK(device)) return { status: "none" };
    const r = await latestStudent(device);
    if (!r) {
      const fp = (cleanInfo(info) || {}).fp;
      return (await isBanned(device, fp)) ? { status: "none", banned: true, locked: true } : { status: "none" };
    }
    if (r.status === "approved") {
      const set = { last_seen: new Date() };
      const d = analyzeDevice(type, ua, info);
      if (d.type) set.device_type = d.type;
      if (d.info) {
        // صفحة قديمة محفوظة عند الطالب لا ترسل p_info: لا نمسح البيانات الكاملة التي وصلتنا منه سابقًا
        const prev = r.device_info || {};
        set.device_info = cleanInfo(info) ? d.info : Object.assign({}, d.info, {
          model: d.info.model || prev.model || "", os_ver: prev.os_ver || d.info.os_ver, browser_ver: prev.browser_ver || d.info.browser_ver,
          w: prev.w, h: prev.h, dpr: prev.dpr, cores: prev.cores, mem: prev.mem, touch: prev.touch,
          gpu: prev.gpu, tz: prev.tz, lang: prev.lang, net: prev.net, arch: prev.arch, fp: prev.fp, hw: prev.hw,
        });
        if (!cleanInfo(info)) { set.device_info.brand = brandOf(set.device_info.model, set.device_info.os); set.device_type = deviceLabel(set.device_info); }
      }
      if (cleanIp(ip)) set.last_ip = cleanIp(ip);
      await students.updateOne({ _id: r._id }, { $set: set });
    }
    return {
      status: r.status,
      name: r.name,
      banned: await isBanned(device),
      locked: await isLocked(device),
      unread: await messages.countDocuments({ device_id: device, sender: "admin", read_by_student: false }),
    };
  }

  async function register(device, name, type, ua, info, ip) {
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
    const d = analyzeDevice(type, ua, info);
    await students.insertOne({
      device_id: device, name: clean, status: "approved",
      device_type: d.type, device_info: d.info, first_ip: cleanIp(ip), last_ip: cleanIp(ip), created_at: now, last_seen: now,
    });
    await isBanned(device); // ينقل الحظر فورًا لو كانت البصمة مطابقة لجهاز محظور
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
      banned: await isBanned(device),
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

    const banDocs = (await bans.find({}).limit(2000).toArray()).filter((b) => !b.released);
    const banned = banDocs.map((b) => b.device_id);
    const autoBanned = banDocs.filter((b) => b.auto_from).map((b) => b.device_id);
    const bannedSet = new Set(banned), hwBanned = new Set(banDocs.map((b) => b.hw).filter(Boolean));
    banned.forEach((d) => { (info[d] = info[d] || { unread: 0, locked: false }).locked = true; });

    // أجهزة غير محظورة تشبه جهازًا محظورًا (نفس العتاد، متصفح مختلف): تنبيه للمدير فقط وليس حظرًا تلقائيًا
    const similar = [], seenDev = new Set();
    rows.forEach((s) => {
      if (seenDev.has(s.device_id)) return;
      seenDev.add(s.device_id);
      const hw = s.device_info && s.device_info.hw;
      if (hw && hwBanned.has(hw) && !bannedSet.has(s.device_id)) similar.push(s.device_id);
    });

    return {
      students: rows.map((s) => ({
        id: String(s._id), device_id: s.device_id, name: s.name, status: s.status,
        created_at: s.created_at, last_seen: s.last_seen, device_type: s.device_type || null,
        device_info: s.device_info ? { ...s.device_info, fp: undefined, hw: undefined } : null,
        last_ip: s.last_ip || null, first_ip: s.first_ip || null,
      })),
      info,
      banned,
      autoBanned,
      similar,
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
      banned: await isBanned(device),
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

  // حظر/رفع حظر جهاز بالكامل: يُربط بمعرّف الجهاز وببصمته، فيبقى حتى لو حُذف الاسم أو مُسحت بيانات المتصفح
  async function adminSetBan(device, banned) {
    if (!DEVICE_OK(device)) return false;
    statsCache = null;
    const st = await latestStudent(device);
    const di = (st && st.device_info) || {};
    const cur = await bans.findOne({ device_id: device });
    if (banned) {
      await bans.updateOne(
        { device_id: device },
        { $set: { fp: di.fp || null, hw: di.hw || null, name: st ? st.name : null, released: false }, $unset: { auto_from: "" }, $setOnInsert: { device_id: device, banned_at: new Date() } },
        { upsert: true }
      );
    } else if (cur && cur.auto_from) {
      // حظر تلقائي بالبصمة: نرفعه عن هذا الجهاز فقط ونتذكر ذلك حتى لا يعود تلقائيًا، ويبقى الأصل محظورًا
      await bans.updateOne({ device_id: device }, { $set: { released: true } });
    } else {
      // رفع حظر الجهاز الأصلي يرفع معه كل ما انتقل منه تلقائيًا
      await bans.deleteMany({ $or: [{ device_id: device }, { auto_from: device }] });
    }
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

    const [dev, stuFacet, rawTypes, msgFacet, unread, voice, totalMsgs, reqs, revAgg, bannedCount, recentStu, recentMsg, recentRev] = await Promise.all([
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
      bans.countDocuments({ released: { $ne: true } }),
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
        returning: k.returning || 0, unread, locked, banned: bannedCount || 0, messages: totalMsgs, voice,
      },
      days: keys30,
      signups: keys30.map((d) => dailyMap.get(d) || 0),
      msgDays: keys14,
      msgStudent: keys14.map((d) => mS.get(d) || 0),
      msgAdmin: keys14.map((d) => mA.get(d) || 0),
      devices: { phone: k.phone || 0, tablet: k.tablet || 0, desktop: k.desktop || 0, unknown: k.unknown || 0, raw: rawTypes.map((x) => ({ type: x._id, n: x.n })) },
      heat,
      reviews: { ...rv, total: rv.pending + rv.published },
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
    // ميزة صور الطلاب أُزيلت نهائيًا: نحذف مجموعتها القديمة من القاعدة إن وُجدت
    await db.collection("qureo_photos").drop().catch(() => {});
    await students.createIndex({ device_id: 1, created_at: -1 });
    await messages.createIndex({ device_id: 1, created_at: 1 });
    await reviews.createIndex({ status: 1, order: 1, created_at: -1 });
    await reviews.createIndex({ device_id: 1, created_at: -1 });
    await bans.createIndex({ device_id: 1 }, { unique: true });
    await bans.createIndex({ fp: 1 }, { sparse: true });
    await students.createIndex({ device_id: 1, "device_info.fp": 1 }, { sparse: true });
    // فهارس لوحة القيادة (تجعل الإحصائيات سريعة وخفيفة)
    await students.createIndex({ created_at: -1 });
    await messages.createIndex({ created_at: -1, sender: 1 });
    await messages.createIndex({ sender: 1, read_by_admin: 1 });
    await messages.createIndex({ sender: 1, requires_reply: 1, created_at: -1 });
    await messages.createIndex({ kind: 1 });
  }

  return {
    check, register, inbox, audio, markRead, send,
    adminList, adminSetStatus, adminDeleteStudent, adminMessages, adminAudio, adminSend, adminUnlock, adminSetBan, adminClear,
    publicReviews, reviewSubmit, adminReviews, adminReviewSave, adminReviewDelete,
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

module.exports = { makeLogic, explainError, parseDevice, pickDeviceType, analyzeDevice };
