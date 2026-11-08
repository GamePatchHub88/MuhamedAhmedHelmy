/* articles.js — صفحة قائمة المقالات */

const LIST_QUERY =
  "select=id,slug,title,excerpt,category,cover_url,read_minutes,created_at&published=eq.true&order=created_at.desc";

let ALL = [];
let activeCat = "";
const grid = document.getElementById("art-grid");
const featEl = document.getElementById("art-feature");
const catsEl = document.getElementById("art-cats");
const searchEl = document.getElementById("art-search");
const countEl = document.getElementById("art-count");
const countN = document.getElementById("art-count-n");

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  } catch (_) {
    return "";
  }
}

function isNew(iso) {
  const t = new Date(iso).getTime();
  return t && Date.now() - t < 14 * 864e5;
}

function coverHtml(a, eager) {
  const cat = escapeHtml(a.category || "عام");
  const badge = isNew(a.created_at) ? `<span class="art-badge-new">جديد</span>` : "";
  const img = a.cover_url
    ? `<img src="${escapeHtml(safeUrl(a.cover_url))}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" />`
    : `<i class="fas fa-pen-nib"></i>`;
  return `<div class="art-cover${a.cover_url ? "" : " ph"}"><span class="art-tag">${cat}</span>${badge}${img}</div>`;
}

function metaHtml(a) {
  return `<div class="art-meta">
    <span><i class="far fa-calendar"></i>${fmtDate(a.created_at)}</span><span class="dot"></span>
    <span><i class="far fa-clock"></i>${parseInt(a.read_minutes, 10) || 1} د قراءة</span>
  </div>`;
}

function articleCard(a) {
  const href = "article.html?slug=" + encodeURIComponent(a.slug);
  return `
    <a href="${href}" class="art-card card-hover">
      ${coverHtml(a)}
      <div class="art-body">
        ${metaHtml(a)}
        <h2 class="art-title">${escapeHtml(a.title)}</h2>
        <p class="art-excerpt">${escapeHtml(a.excerpt)}</p>
        <span class="art-more">اقرأ المقال <i class="fas fa-arrow-left"></i></span>
      </div>
    </a>`;
}

function featureCard(a) {
  const href = "article.html?slug=" + encodeURIComponent(a.slug);
  return `
    <a href="${href}" class="art-feature">
      ${coverHtml(a, true)}
      <div class="art-body">
        <span class="mono badge text-amber">// LATEST</span>
        ${metaHtml(a)}
        <h2 class="art-title">${escapeHtml(a.title)}</h2>
        <p class="art-excerpt">${escapeHtml(a.excerpt)}</p>
        <span class="art-more">اقرأ المقال <i class="fas fa-arrow-left"></i></span>
      </div>
    </a>`;
}

function renderCats() {
  const counts = {};
  ALL.forEach((a) => { const c = a.category || "عام"; counts[c] = (counts[c] || 0) + 1; });
  const cats = Object.keys(counts);
  if (cats.length < 2) {
    catsEl.innerHTML = "";
    return;
  }
  catsEl.innerHTML = ["", ...cats]
    .map(
      (c) =>
        `<button type="button" class="cat-chip${c === activeCat ? " active" : ""}" data-cat="${escapeHtml(c)}">${c ? escapeHtml(c) : "الكل"}<span class="n">${c ? counts[c] : ALL.length}</span></button>`,
    )
    .join("");
}

function renderList() {
  const q = searchEl.value.trim().toLowerCase();
  const list = ALL.filter(
    (a) =>
      (!activeCat || (a.category || "عام") === activeCat) &&
      (!q || (a.title + " " + a.excerpt).toLowerCase().includes(q)),
  );

  if (ALL.length) {
    countEl.hidden = false;
    countN.textContent = q || activeCat ? `${list.length} من ${ALL.length} مقال` : `${ALL.length} مقال منشور`;
  }

  if (list.length === 0) {
    featEl.innerHTML = "";
    grid.innerHTML = `<div class="art-state">${
      ALL.length === 0 ? "لا توجد مقالات منشورة بعد، ترقّب قريبًا ✍️" : "لا توجد نتائج مطابقة لبحثك."
    }</div>`;
    return;
  }
  /* أحدث مقال يظهر كبطاقة مميزة لما مفيش بحث/فلتر */
  const showFeature = !q && !activeCat && list.length > 2;
  featEl.innerHTML = showFeature ? featureCard(list[0]) : "";
  grid.innerHTML = (showFeature ? list.slice(1) : list).map(articleCard).join("");
}

catsEl.addEventListener("click", (e) => {
  const b = e.target.closest(".cat-chip");
  if (!b) return;
  activeCat = b.dataset.cat;
  renderCats();
  renderList();
});

let searchTimer;
searchEl.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderList, 120);
});

sbLoad("articles", LIST_QUERY, (data) => {
  ALL = Array.isArray(data) ? data : [];
  if (activeCat && !ALL.some((a) => (a.category || "عام") === activeCat)) activeCat = "";
  renderCats();
  renderList();
}).catch((err) => {
  console.error("تعذر تحميل المقالات:", err);
  if (ALL.length === 0)
    grid.innerHTML = `<div class="art-state">تعذر تحميل المقالات حاليًا، حاول لاحقًا.</div>`;
});
