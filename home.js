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
  if (!data || data.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  grid.innerHTML = data
    .map(
      (r) => `
      <div class="bg-panel border border-line rounded-2xl p-7 card-hover">
        <div class="flex gap-1 text-amber mb-4 text-sm">${starsHtml(r.rating)}</div>
        <p class="text-sm text-fog/90 leading-relaxed mb-5">"${escapeHtml(r.review_text)}"</p>
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-cyan/15 border border-cyan/30 flex items-center justify-center text-cyan text-xs font-bold">
            ${escapeHtml(initials(r.client_name))}
          </div>
          <div>
            <div class="text-sm font-bold text-white">${escapeHtml(r.client_name)}</div>
            <div class="text-xs text-muted">${escapeHtml(r.client_role || "عميل")}</div>
          </div>
        </div>
      </div>`,
    )
    .join("");
}

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
