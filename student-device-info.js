/* يُضاف إلى موقع الطلاب (qureo) — يجمع بيانات الجهاز ويحسب "بصمة" ثابتة لا تتغير بمسح بيانات المتصفح.
   الاستخدام: أضف الحقل p_info إلى طلبي student_check و student_register:
       body: JSON.stringify({ p_device, p_type, p_info: await collectDeviceInfo() })
   لا يُرسل أي اسم أو موقع جغرافي؛ فقط مواصفات الجهاز والمتصفح. */
(function (g) {
  "use strict";
  let cache = null;

  async function sha(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
  }

  function gpuInfo() {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      if (!gl) return "";
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "") : "";
    } catch (_) { return ""; }
  }

  function canvasSig() {
    try {
      const c = document.createElement("canvas");
      c.width = 220; c.height = 60;
      const x = c.getContext("2d");
      x.textBaseline = "top"; x.font = "16px Arial";
      x.fillStyle = "#f60"; x.fillRect(10, 8, 90, 30);
      x.fillStyle = "#069"; x.fillText("Qureo حلول ✓ 123", 6, 14);
      x.strokeStyle = "rgba(102,204,0,.7)"; x.arc(150, 30, 18, 0, Math.PI * 2); x.stroke();
      return c.toDataURL();
    } catch (_) { return ""; }
  }

  g.collectDeviceInfo = async function collectDeviceInfo() {
    if (cache) return cache;
    const n = navigator, s = screen;
    const info = {
      w: Math.max(s.width, s.height), h: Math.min(s.width, s.height), dpr: g.devicePixelRatio || 1,
      cores: n.hardwareConcurrency || 0, mem: n.deviceMemory || 0, touch: n.maxTouchPoints || 0,
      gpu: gpuInfo(), lang: n.language || "", net: (n.connection && n.connection.effectiveType) || "",
    };
    try { info.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) { info.tz = ""; }
    // Chrome/Edge/Android: الموديل الحقيقي وإصدار النظام الحقيقي (الـ User-Agent مخفّض ولا يكشفهما)
    try {
      if (n.userAgentData && n.userAgentData.getHighEntropyValues) {
        const h = await n.userAgentData.getHighEntropyValues(["model", "platformVersion", "architecture", "uaFullVersion"]);
        info.model = h.model || ""; info.pv = h.platformVersion || ""; info.arch = h.architecture || ""; info.bv = (h.uaFullVersion || "").split(".")[0];
      }
    } catch (_) {}
    const platform = (n.userAgentData && n.userAgentData.platform) || n.platform || "";
    // hw: عتاد الجهاز فقط (يتشابه بين المتصفحات على نفس الجهاز) — يُستعمل كتنبيه "يشبه جهازًا محظورًا"
    info.hw = await sha(["hw", platform, info.w, info.h, info.dpr, info.cores, info.mem, info.gpu, info.tz, info.touch, info.model || ""].join("|"));
    // fp: بصمة أقوى تضيف رسم الكانفاس والمتصفح؛ تثبت بعد مسح الكوكيز و localStorage والتصفح الخفي
    info.fp = await sha(["fp", info.hw, canvasSig(), n.languages ? n.languages.join(",") : "", n.vendor || ""].join("|"));
    cache = info;
    return info;
  };
})(window);
