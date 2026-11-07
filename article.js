/* article.js — صفحة المقال الواحد + عارض Markdown آمن */

/* ---------- Markdown بسيط وآمن (بيعمل escape لكل HTML) ---------- */
function mdInline(s) {
  const codes = [];
  s = escapeHtml(s).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return "\u0002" + (codes.length - 1) + "\u0002";
  });
  s = s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, u) => `<img src="${safeUrl(u)}" alt="${alt}" loading="lazy" decoding="async" />`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, u) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener noreferrer">${txt}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return s.replace(/\u0002(\d+)\u0002/g, (_, i) => `<code>${codes[i]}</code>`);
}

function renderMarkdown(src) {
  const blocks = [];
  src = String(src || "")
    .replace(/\r\n?/g, "\n")
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code) => {
      blocks.push(`<pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
      return `\n\u0001${blocks.length - 1}\u0001\n`;
    });

  const out = [];
  let para = [], quote = [], list = null;
  const br = (s) => mdInline(s).replace(/\n/g, "<br>");
  const flushP = () => { if (para.length) { out.push(`<p>${br(para.join("\n"))}</p>`); para = []; } };
  const flushQ = () => { if (quote.length) { out.push(`<blockquote>${br(quote.join("\n"))}</blockquote>`); quote = []; } };
  const flushL = () => {
    if (list) { out.push(`<${list.t}>${list.items.map((i) => `<li>${mdInline(i)}</li>`).join("")}</${list.t}>`); list = null; }
  };
  const flushAll = () => { flushP(); flushQ(); flushL(); };

  for (const raw of src.split("\n")) {
    const line = raw.trim();
    let m;
    if (!line) { flushAll(); continue; }
    if ((m = line.match(/^\u0001(\d+)\u0001$/))) { flushAll(); out.push(blocks[m[1]]); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line)) { flushAll(); out.push("<hr>"); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.+)$/))) {
      flushAll();
      const l = m[1].length === 3 ? 3 : 2;
      out.push(`<h${l}>${mdInline(m[2])}</h${l}>`);
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) { flushP(); flushL(); quote.push(m[1]); continue; }
    if ((m = line.match(/^[-*]\s+(.+)$/))) {
      flushP(); flushQ();
      if (!list || list.t !== "ul") { flushL(); list = { t: "ul", items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^\d+[.)]\s+(.+)$/))) {
      flushP(); flushQ();
      if (!list || list.t !== "ol") { flushL(); list = { t: "ol", items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if (/^!\[[^\]]*\]\([^)\s]+\)$/.test(line)) { flushAll(); out.push(mdInline(line)); continue; }
    flushL(); flushQ();
    para.push(line);
  }
  flushAll();
  return out.join("\n");
}

/* ---------- الصفحة ---------- */
const root = document.getElementById("article-root");
const slug = new URLSearchParams(location.search).get("slug");

function setMeta(sel, attr, val) {
  const el = document.querySelector(sel);
  if (el) el.setAttribute(attr, val);
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  } catch (_) {
    return "";
  }
}

function notFound(msg) {
  root.innerHTML = `<div class="art-state">${escapeHtml(msg)}<br><br><a class="share-btn" href="articles.html">العودة للمقالات</a></div>`;
  setMeta('meta[name="robots"]', "content", "noindex");
}

function showArticle(a) {
  const url = location.origin + location.pathname + "?slug=" + encodeURIComponent(a.slug);
  const desc = (a.excerpt || "").slice(0, 160);

  document.title = a.title + " | محمد أحمد حلمي";
  setMeta('meta[name="description"]', "content", desc);
  setMeta('link[rel="canonical"]', "href", url);
  setMeta('meta[property="og:title"]', "content", a.title);
  setMeta('meta[property="og:description"]', "content", desc);
  setMeta('meta[property="og:url"]', "content", url);
  if (a.cover_url && /^https?:/i.test(a.cover_url)) setMeta('meta[property="og:image"]', "content", a.cover_url);

  const ld = document.createElement("script");
  ld.type = "application/ld+json";
  ld.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: desc,
    datePublished: a.created_at,
    dateModified: a.updated_at || a.created_at,
    author: { "@type": "Person", name: "محمد أحمد حلمي" },
    mainEntityOfPage: url,
  });
  document.head.appendChild(ld);

  root.innerHTML = `
    <article>
      <div class="art-meta">
        <span class="art-cat">${escapeHtml(a.category || "عام")}</span>
        <span>${fmtDate(a.created_at)}</span>
        <span><i class="far fa-clock"></i> ${parseInt(a.read_minutes, 10) || 1} د قراءة</span>
      </div>
      <h1 class="article-title">${escapeHtml(a.title)}</h1>
      ${a.cover_url ? `<img class="article-hero" src="${escapeHtml(safeUrl(a.cover_url))}" alt="" fetchpriority="high" decoding="async" />` : ""}
      <div class="prose">${renderMarkdown(a.content)}</div>
      <div class="share-row">
        <button class="share-btn" id="copy-link" type="button"><i class="far fa-copy"></i> نسخ الرابط</button>
        <a class="share-btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(a.title + " " + url)}"><i class="fab fa-whatsapp"></i> مشاركة واتساب</a>
      </div>
    </article>`;

  document.getElementById("copy-link").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    try {
      await navigator.clipboard.writeText(url);
      b.innerHTML = '<i class="fas fa-check"></i> تم النسخ';
    } catch (_) {
      b.textContent = url;
    }
  });
}

/* مقالات أخرى — بنفس استعلام صفحة القائمة، فبتيجي من الكاش لو الزائر جاي منها */
const LIST_QUERY =
  "select=id,slug,title,excerpt,category,cover_url,read_minutes,created_at&published=eq.true&order=created_at.desc";

function showMore(list) {
  const others = (list || []).filter((x) => x.slug !== slug).slice(0, 3);
  const wrap = document.getElementById("more-wrap");
  if (!others.length) { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  document.getElementById("more-grid").innerHTML = others
    .map(
      (a) => `
      <a href="article.html?slug=${encodeURIComponent(a.slug)}" class="art-card card-hover">
        <div class="art-body">
          <span class="art-cat">${escapeHtml(a.category || "عام")}</span>
          <h3 class="art-title">${escapeHtml(a.title)}</h3>
          <span class="art-more">اقرأ المقال <i class="fas fa-arrow-left"></i></span>
        </div>
      </a>`,
    )
    .join("");
}

if (!slug) {
  notFound("لم يتم تحديد المقال.");
} else {
  sbLoad("articles", `select=*&slug=eq.${encodeURIComponent(slug)}&published=eq.true&limit=1`, (rows) => {
    if (rows && rows[0]) showArticle(rows[0]);
  })
    .then((rows) => {
      if (!rows || !rows[0]) notFound("المقال غير موجود أو غير منشور.");
      else sbLoad("articles", LIST_QUERY, showMore).catch(() => {});
    })
    .catch((err) => {
      console.error(err);
      if (!root.querySelector("article")) notFound("تعذر تحميل المقال حاليًا، حاول لاحقًا.");
    });
}
