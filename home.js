/* home.js — تحميل أقسام الصفحة الرئيسية (المهارات / الأعمال / التقييمات) */

initReveal("section");

function starsHtml(rating) {
  const n = Math.max(0, Math.min(5, parseInt(rating, 10) || 0));
  let html = "";
  for (let i = 0; i < 5; i++) html += `<i class="fas fa-star${i < n ? "" : " text-line"}"></i>`;
  return html;
}

function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0].slice(0, 1) + parts[1].slice(0, 1);
}

function showEmpty(emptyEl, text) {
  emptyEl.textContent = text;
  emptyEl.classList.remove("hidden");
}

/* ---------- Skills ---------- */
function renderSkills(data) {
  const container = document.getElementById("skills-container");
  const empty = document.getElementById("skills-empty");
  if (!data || data.length === 0) {
    container.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  const groups = {};
  data.forEach((s) => {
    const cat = s.category || "عام";
    (groups[cat] = groups[cat] || []).push(s);
  });
  container.innerHTML = Object.keys(groups)
    .map(
      (cat) => `
      <div>
        <h3 class="skill-cat mono text-sm mb-6 flex items-center gap-2">
          <i class="fas fa-layer-group"></i> ${escapeHtml(cat)}
        </h3>
        <div class="grid grid-cols-2 gap-4">
          ${groups[cat]
            .map(
              (s) => `
            <div class="skill-card" style="--sc:${/^#[0-9a-fA-F]{3,8}$/.test(s.icon_color || "") ? s.icon_color : "#5eead4"}">
              <span class="skill-ico"><i class="${escapeHtml(s.icon || "fas fa-code")}"></i></span>
              <span class="skill-name">${escapeHtml(s.name)}</span>
            </div>`,
            )
            .join("")}
        </div>
      </div>`,
    )
    .join("");
}

/* ---------- Projects ---------- */
function ribbonHtml(p) {
  const text = (p.ribbon_text || "").trim();
  if (!text) return "";
  const bg = /^#[0-9a-fA-F]{6}$/.test(p.ribbon_color || "") ? p.ribbon_color : "#ffb454";
  const n = parseInt(bg.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  const fg = lum > 0.6 ? "#070a10" : "#ffffff";
  return `<span class="project-ribbon" style="background:${bg};color:${fg}">${escapeHtml(text)}</span>`;
}

let ALL_PROJECTS = [];
let PROJECT_FILTER = "all";

function projectCardHtml(p, i, featured) {
  const hues = ["#8b7bff", "#5eead4", "#f472b6", "#ffc46b", "#60a5fa", "#34d399"];
  const href = p.link_url ? escapeHtml(safeUrl(p.link_url)) : "";
  const media = p.image_url
    ? `<img src="${escapeHtml(safeUrl(p.image_url))}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async" />`
    : `<i class="${escapeHtml(p.icon || "fas fa-globe")}"></i>`;
  const cover = `<div class="prj-cover${p.image_url ? "" : " ph"}">
      ${ribbonHtml(p)}
      ${media}
      <span class="prj-no mono">${String(i + 1).padStart(2, "0")}</span>
      ${href ? `<span class="prj-open" aria-hidden="true"><i class="fas fa-arrow-up-left"></i></span>` : ""}
    </div>`;
  return `
    <article class="prj-card${featured ? " is-featured" : ""}" style="--sc:${hues[i % hues.length]};--d:${Math.min(i, 8) * 70}ms">
      ${href ? `<a class="prj-cover-link" href="${href}" target="_blank" rel="noopener" aria-label="${escapeHtml(p.title)}" tabindex="-1">${cover}</a>` : cover}
      <div class="prj-body">
        <div class="prj-top">
          <span class="prj-badge mono">${escapeHtml(p.badge || "WEB APP")}</span>
          ${featured ? `<span class="prj-star"><i class="fas fa-star"></i> مشروع مميز</span>` : ""}
        </div>
        <h3>${escapeHtml(p.title)}</h3>
        <p>${escapeHtml(p.description)}</p>
        ${href ? `<a href="${href}" target="_blank" rel="noopener" class="svc-link">زيارة الموقع <i class="fas fa-arrow-up-left"></i></a>` : `<span class="prj-soon mono">قريبًا</span>`}
      </div>
    </article>`;
}

function drawProjects() {
  const grid = document.getElementById("projects-grid");
  const filters = document.getElementById("projects-filters");
  const cats = [];
  ALL_PROJECTS.forEach((p) => {
    const c = (p.badge || "WEB APP").trim();
    if (!cats.includes(c)) cats.push(c);
  });
  if (PROJECT_FILTER !== "all" && !cats.includes(PROJECT_FILTER)) PROJECT_FILTER = "all";
  if (filters) {
    filters.innerHTML =
      cats.length > 1
        ? [["all", "الكل", ALL_PROJECTS.length]]
            .concat(cats.map((c) => [c, c, ALL_PROJECTS.filter((p) => (p.badge || "WEB APP").trim() === c).length]))
            .map(
              ([k, label, n]) =>
                `<button type="button" class="cat-chip${k === PROJECT_FILTER ? " active" : ""}" data-cat="${escapeHtml(k)}">${escapeHtml(label)}<span class="n">${n}</span></button>`,
            )
            .join("")
        : "";
  }
  const list = PROJECT_FILTER === "all" ? ALL_PROJECTS : ALL_PROJECTS.filter((p) => (p.badge || "WEB APP").trim() === PROJECT_FILTER);
  const featuredOn = list.length >= 3;
  grid.innerHTML = list.map((p, i) => projectCardHtml(p, i, featuredOn && i === 0)).join("");
}

function renderProjects(data) {
  const grid = document.getElementById("projects-grid");
  const empty = document.getElementById("projects-empty");
  const filters = document.getElementById("projects-filters");
  if (!data || data.length === 0) {
    grid.innerHTML = "";
    if (filters) filters.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  ALL_PROJECTS = data;
  if (filters && !filters.dataset.bound) {
    filters.dataset.bound = "1";
    filters.addEventListener("click", (e) => {
      const b = e.target.closest(".cat-chip");
      if (!b) return;
      PROJECT_FILTER = b.dataset.cat;
      drawProjects();
    });
  }
  drawProjects();
}

/* ---------- Reviews ---------- */
function renderReviews(data) {
  const grid = document.getElementById("reviews-grid");
  const empty = document.getElementById("reviews-empty");
  const sum = document.getElementById("reviews-summary");
  if (!data || data.length === 0) {
    grid.innerHTML = "";
    sum.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  const avg = data.reduce((a, r) => a + (parseInt(r.rating, 10) || 0), 0) / data.length;
  sum.innerHTML = `<span class="rev-avg">${avg.toFixed(1)}</span><div><div class="rev-stars">${starsHtml(Math.round(avg))}</div><small>من ${data.length} تقييم</small></div>`;
  sum.classList.remove("hidden");
  const hues = ["#5eead4", "#8b7bff", "#f472b6", "#ffc46b", "#60a5fa", "#34d399"];
  grid.innerHTML = data
    .map(
      (r, i) => `
      <article class="rev-card" style="--sc:${hues[i % hues.length]}">
        <i class="fas fa-quote-right rev-q"></i>
        <div class="rev-stars">${starsHtml(r.rating)}</div>
        <p class="rev-text">${escapeHtml(r.review_text)}</p>
        <div class="rev-who">
          <span class="rev-av">${escapeHtml(initials(r.client_name))}</span>
          <div>
            <div class="rev-name">${escapeHtml(r.client_name)}</div>
            <div class="rev-role">${escapeHtml(r.client_role || "عميل")}</div>
          </div>
        </div>
      </article>`,
    )
    .join("");
}

(function () {
  const track = document.getElementById("reviews-grid");
  const go = (dir) => track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: "smooth" });
  /* الصفحة RTL: "التالي" = تحرك لليسار (قيمة سالبة) */
  document.getElementById("rev-next").addEventListener("click", () => go(-1));
  document.getElementById("rev-prev").addEventListener("click", () => go(1));
})();

/* ---------- الأخبار والإعلانات (أعلى الصفحة، فوق صورتي) ---------- */
let newsTimer = null;
const NEWS_ICONS = { "خبر": "fa-newspaper", "إعلان": "fa-bullhorn", "عرض": "fa-tag", "تنبيه": "fa-bell" };

function renderNews(data) {
  const box = document.getElementById("news");
  if (!box) return;
  clearInterval(newsTimer);

  let closed = [];
  try { closed = JSON.parse(localStorage.getItem("news-closed") || "[]"); } catch (_) {}
  const items = (data || []).filter((n) => n && !closed.includes(n.id));
  if (!items.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }

  const multi = items.length > 1;
  const slides = items
    .map((n, i) => {
      const icon = NEWS_ICONS[n.kind] || "fa-bullhorn";
      const external = /^https?:/i.test(n.link_url || "");
      const btn = n.link_url
        ? `<a class="news-btn" href="${escapeHtml(safeUrl(n.link_url))}"${external ? ' target="_blank" rel="noopener"' : ""}>${escapeHtml(n.link_text || "اعرف أكثر")} <i class="fas fa-arrow-up-left"></i></a>`
        : "";
      const img = n.image_url
        ? `<div class="news-img"><img src="${escapeHtml(safeUrl(n.image_url))}" alt="${escapeHtml(n.title)}" decoding="async" /></div>`
        : "";
      return `
        <article class="news-slide${i === 0 ? " is-on" : ""}${n.image_url ? " has-img" : ""}">
          ${img}
          <div class="news-body">
            <span class="news-tag"><i class="fas ${icon}"></i> ${escapeHtml(n.kind || "إعلان")}</span>
            <h2 class="news-title">${escapeHtml(n.title)}</h2>
            ${n.body ? `<p class="news-text">${escapeHtml(n.body)}</p>` : ""}
            ${btn}
          </div>
        </article>`;
    })
    .join("");

  const nav = multi
    ? `<div class="news-nav">
         <button type="button" class="news-arrow" data-d="-1" aria-label="السابق"><i class="fas fa-chevron-right"></i></button>
         <div class="news-dots">${items.map((_, i) => `<button type="button" data-i="${i}" aria-label="الخبر ${i + 1}"${i === 0 ? ' class="on"' : ""}></button>`).join("")}</div>
         <button type="button" class="news-arrow" data-d="1" aria-label="التالي"><i class="fas fa-chevron-left"></i></button>
       </div>`
    : "";

  box.innerHTML = `
    <div class="news-card" role="region" aria-label="آخر الأخبار والإعلانات">
      <div class="news-inner">
        <button type="button" class="news-close" aria-label="إغلاق"><i class="fas fa-xmark"></i></button>
        ${slides}
        ${nav}
      </div>
    </div>`;
  box.hidden = false;

  let idx = 0;
  const slideEls = box.querySelectorAll(".news-slide");
  const dotEls = box.querySelectorAll(".news-dots button");
  const go = (i) => {
    idx = (i + items.length) % items.length;
    slideEls.forEach((s, k) => s.classList.toggle("is-on", k === idx));
    dotEls.forEach((d, k) => d.classList.toggle("on", k === idx));
  };
  box.querySelectorAll(".news-arrow").forEach((b) => b.addEventListener("click", () => { go(idx + parseInt(b.dataset.d, 10)); }));
  dotEls.forEach((d) => d.addEventListener("click", () => go(parseInt(d.dataset.i, 10))));

  const start = () => {
    clearInterval(newsTimer);
    if (multi && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) newsTimer = setInterval(() => go(idx + 1), 7000);
  };
  box.onpointerenter = () => clearInterval(newsTimer);
  box.onpointerleave = start;
  start();

  box.querySelector(".news-close").addEventListener("click", () => {
    try { localStorage.setItem("news-closed", JSON.stringify(closed.concat(items.map((n) => n.id)).slice(-50))); } catch (_) {}
    clearInterval(newsTimer);
    box.hidden = true;
  });
}

sbLoad("news", "select=id,kind,title,body,image_url,link_url,link_text&order=created_at.desc&limit=5", renderNews).catch((err) => console.warn("الأخبار:", err));

const ORDER = "order=order_index.asc,created_at.desc";

// الطلبات الثلاثة بتشتغل بالتوازي
[
  ["skills", `select=id,name,category,icon,icon_color&${ORDER}`, renderSkills, "skills-empty", "المهارات"],
  ["projects", `select=*&${ORDER}`, renderProjects, "projects-empty", "الأعمال"],
  ["reviews", `select=id,client_name,client_role,review_text,rating&${ORDER}`, renderReviews, "reviews-empty", "التقييمات"],
].forEach(([table, q, render, emptyId, label]) => {
  sbLoad(table, q, render).catch((err) => {
    console.error(`تعذر تحميل ${label}:`, err);
    // لو في نسخة معروضة من الكاش منمسحهاش
    const el = document.getElementById(emptyId);
    if (el && el.classList.contains("hidden") === false) showEmpty(el, `تعذر تحميل ${label} حاليًا، حاول لاحقًا.`);
    else if (el && !sessionStorage.getItem("sb:" + table + "?" + q)) showEmpty(el, `تعذر تحميل ${label} حاليًا، حاول لاحقًا.`);
  });
});

/* ---------- نموذج التواصل → رسالة واتساب جاهزة ---------- */
(function () {
  const form = document.getElementById("ct-form");
  if (!form) return;
  const nameEl = document.getElementById("ct-name");
  const msgEl = document.getElementById("ct-msg");
  const topics = document.getElementById("ct-topics");
  const prev = document.getElementById("ct-preview");
  let topic = "موقع تعريفي";

  const build = () => {
    const n = nameEl.value.trim();
    const m = msgEl.value.trim();
    return (
      "مرحبا محمد" + (n ? "، أنا " + n : "") + ".\n" +
      "مهتم بـ: " + topic + "." +
      (m ? "\nفكرتي: " + m : "")
    );
  };
  const paint = () => { if (prev) prev.textContent = build(); };

  topics.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-t]");
    if (!b) return;
    topics.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    topic = b.dataset.t;
    paint();
  });
  nameEl.addEventListener("input", paint);
  msgEl.addEventListener("input", paint);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    window.open("https://wa.me/201110742678?text=" + encodeURIComponent(build()), "_blank", "noopener");
  });
  paint();
})();
