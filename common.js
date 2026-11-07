/* =========================================================
   common.js — دوال مشتركة للصفحات العامة (بدون مكتبة Supabase)
   بيستخدم REST API مباشرة بـ fetch، وده بيوفّر ~120KB من التحميل.
========================================================= */

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* بيمنع javascript: / data: وغيرها — النتيجة لازم تتعمل لها escapeHtml قبل وضعها في attribute */
function safeUrl(u) {
  u = String(u || "").trim();
  return /^(javascript|data|vbscript|file):/i.test(u.replace(/[\s\u0000-\u001f]/g, "")) ? "#" : u;
}

/* ---------- جلب بيانات من Supabase (REST) ---------- */
async function sbFetch(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`${table}: ${res.status}`);
  return res.json();
}

/*
  stale-while-revalidate:
  1) لو في نسخة محفوظة في sessionStorage بنعرضها فورًا
  2) بنجيب النسخة الجديدة، ولو اختلفت بنحدّث العرض
*/
async function sbLoad(table, query, render) {
  const key = "sb:" + table + "?" + query;
  let cached = null;
  try {
    cached = sessionStorage.getItem(key);
    if (cached) render(JSON.parse(cached));
  } catch (_) {}
  const fresh = await sbFetch(table, query);
  const json = JSON.stringify(fresh);
  if (json !== cached) {
    try { sessionStorage.setItem(key, json); } catch (_) {}
    render(fresh);
  }
  return fresh;
}

/* ---------- قائمة الموبايل ---------- */
(function () {
  const btn = document.getElementById("menu-toggle");
  const menu = document.getElementById("mobile-menu");
  if (!btn || !menu) return;
  const close = () => {
    menu.classList.remove("open");
    btn.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  };
  btn.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    btn.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open);
  });
  menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
})();

/* ---------- ظهور الأقسام عند التمرير ---------- */
function initReveal(selector) {
  const els = document.querySelectorAll(selector);
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.12 },
  );
  els.forEach((s) => {
    s.classList.add("reveal");
    io.observe(s);
  });
}
