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

function renderProjects(data) {
  const grid = document.getElementById("projects-grid");
  const empty = document.getElementById("projects-empty");
  if (!data || data.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  grid.innerHTML = data
    .map(
      (p) => `
      <div class="group rounded-2xl overflow-hidden bg-panel border border-line card-hover">
        <div class="h-44 bg-panel2 flex items-center justify-center relative overflow-hidden">
          ${ribbonHtml(p)}
          ${
            p.image_url
              ? `<img src="${escapeHtml(safeUrl(p.image_url))}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />`
              : `<div class="absolute inset-0 grid-texture opacity-40"></div>
                 <i class="${escapeHtml(p.icon || "fas fa-globe")} text-5xl text-cyan/70 relative z-10"></i>`
          }
        </div>
        <div class="p-6">
          <span class="mono badge text-amber">${escapeHtml(p.badge || "WEB APP")}</span>
          <h3 class="text-xl font-bold mt-2 mb-2 text-white">${escapeHtml(p.title)}</h3>
          <p class="text-sm text-muted leading-relaxed${p.link_url ? " mb-3" : ""}">${escapeHtml(p.description)}</p>
          ${
            p.link_url
              ? `<a href="${escapeHtml(safeUrl(p.link_url))}" target="_blank" rel="noopener" class="mono text-xs text-cyan hover:underline flex items-center gap-1.5">
                   زيارة الموقع <i class="fas fa-arrow-up-left"></i>
                 </a>`
              : ""
          }
        </div>
      </div>`,
    )
    .join("");
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
