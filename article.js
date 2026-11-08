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
  const usedIds = {};
  const hid = (txt) => {
    let base = String(txt).replace(/[`*\[\]()!<>]/g, "").trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "section";
    let id = base, n = 2;
    while (usedIds[id]) id = base + "-" + n++;
    usedIds[id] = 1;
    return id;
  };
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
      const id = hid(m[2]);
      out.push(`<h${l} id="${id}">${mdInline(m[2])}<a class="anc" href="#${id}" aria-label="رابط القسم">#</a></h${l}>`);
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

function estMinutes(text) {
  const words = String(text || "").trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 180));
}

function buildToc(proseEl) {
  const hs = [...proseEl.querySelectorAll("h2[id], h3[id]")];
  if (hs.length < 3) return "";
  return `<details class="toc" open>
      <summary><i class="fas fa-list-ul"></i> محتويات المقال</summary>
      <ol>${hs
        .map((h) => `<li><a href="#${h.id}" class="${h.tagName === "H3" ? "sub" : ""}" data-id="${h.id}">${escapeHtml(h.textContent.replace(/#$/, ""))}</a></li>`)
        .join("")}</ol>
    </details>`;
}

function showArticle(a) {
  const url = location.origin + location.pathname + "?slug=" + encodeURIComponent(a.slug);
  const desc = (a.excerpt || "").slice(0, 160);
  const mins = parseInt(a.read_minutes, 10) || estMinutes(a.content);

  document.title = a.title + " | محمد أحمد حلمي";
  const crumb = document.getElementById("crumb-title");
  if (crumb) crumb.textContent = a.title;
  setMeta('meta[name="description"]', "content", desc);
  setMeta('link[rel="canonical"]', "href", url);
  setMeta('meta[property="og:title"]', "content", a.title);
  setMeta('meta[property="og:description"]', "content", desc);
  setMeta('meta[property="og:url"]', "content", url);
  if (a.cover_url && /^https?:/i.test(a.cover_url)) setMeta('meta[property="og:image"]', "content", a.cover_url);

  if (!document.getElementById("ld-article")) {
    const ld = document.createElement("script");
    ld.id = "ld-article";
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
  }

  const enc = encodeURIComponent;
  root.innerHTML = `
    <article>
      <header class="art-head">
        <span class="art-chip">${escapeHtml(a.category || "عام")}</span>
        <h1 class="article-title">${escapeHtml(a.title)}</h1>
        ${a.excerpt ? `<p class="art-lead">${escapeHtml(a.excerpt)}</p>` : ""}
        <div class="byline">
          <img src="profile.webp" alt="" width="42" height="42" />
          <div><b>محمد أحمد حلمي</b>
            <small>${fmtDate(a.created_at)} · <i class="far fa-clock"></i> ${mins} د قراءة</small></div>
        </div>
      </header>
      ${a.cover_url ? `<img class="article-hero" src="${escapeHtml(safeUrl(a.cover_url))}" alt="" fetchpriority="high" decoding="async" />` : ""}
      <div class="art-layout">
        <div class="prose" id="prose">${renderMarkdown(a.content)}</div>
      </div>
      <div class="post-end">
        <div class="share-row">
          <span class="lbl">شارك المقال:</span>
          <a class="share-btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${enc(a.title + " " + url)}"><i class="fab fa-whatsapp"></i> واتساب</a>
          <a class="share-btn fb" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${enc(url)}"><i class="fab fa-facebook-f"></i> فيسبوك</a>
          <a class="share-btn x" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${enc(a.title)}&url=${enc(url)}"><i class="fab fa-x-twitter"></i> إكس</a>
          <a class="share-btn in" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}"><i class="fab fa-linkedin-in"></i> لينكدإن</a>
          <button class="share-btn" id="copy-link" type="button"><i class="far fa-copy"></i> نسخ الرابط</button>
        </div>
        <div class="author-box">
          <img src="profile.webp" alt="محمد أحمد حلمي" width="64" height="64" loading="lazy" />
          <div>
            <b>محمد أحمد حلمي</b>
            <p>مطوّر واجهات أمامية مهتم بالأمن السيبراني، أكتب عن بناء مواقع عربية سريعة وآمنة.</p>
            <a class="mini" href="index.html#contact">تواصل معي <i class="fas fa-arrow-left"></i></a>
          </div>
        </div>
      </div>
    </article>`;

  const prose = document.getElementById("prose");

  /* فهرس المحتويات */
  const tocHtml = buildToc(prose);
  if (tocHtml) {
    prose.parentElement.insertAdjacentHTML("afterbegin", tocHtml);
    const toc = prose.parentElement.querySelector(".toc");
    if (window.matchMedia("(max-width: 1099px)").matches) toc.removeAttribute("open");
    const links = [...toc.querySelectorAll("a")];
    const map = new Map(links.map((l) => [l.dataset.id, l]));
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (es) => es.forEach((e) => {
          if (!e.isIntersecting) return;
          links.forEach((l) => l.classList.remove("on"));
          const l = map.get(e.target.id);
          if (l) l.classList.add("on");
        }),
        { rootMargin: "-90px 0px -70% 0px" },
      );
      prose.querySelectorAll("h2[id], h3[id]").forEach((h) => io.observe(h));
    }
  }

  /* زر نسخ للأكواد */
  prose.querySelectorAll("pre").forEach((pre) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "copy-code";
    b.textContent = "نسخ";
    b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(pre.innerText.replace(/نسخ$/, "").trim()); b.textContent = "تم ✓"; }
      catch (_) { b.textContent = "تعذر"; }
      setTimeout(() => (b.textContent = "نسخ"), 1500);
    });
    pre.appendChild(b);
  });

  document.getElementById("copy-link").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    try {
      await navigator.clipboard.writeText(url);
      b.innerHTML = '<i class="fas fa-check"></i> تم النسخ';
    } catch (_) {
      b.textContent = url;
    }
  });

  /* شريط تقدّم القراءة */
  const bar = document.getElementById("read-progress");
  if (bar && !bar.dataset.on) {
    bar.dataset.on = "1";
    let tick = false;
    const upd = () => {
      tick = false;
      const pe = document.getElementById("prose");
      if (!pe) return;
      const r = pe.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.6;
      const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
      bar.style.transform = `scaleX(${p})`;
    };
    window.addEventListener("scroll", () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  }
}

/* السابق/التالي + مقالات ذات صلة — بنفس استعلام صفحة القائمة (من الكاش لو الزائر جاي منها) */
const LIST_QUERY =
  "select=id,slug,title,excerpt,category,cover_url,read_minutes,created_at&published=eq.true&order=created_at.desc";

function relCard(a) {
  return `
    <a href="article.html?slug=${encodeURIComponent(a.slug)}" class="art-card card-hover">
      <div class="art-cover${a.cover_url ? "" : " ph"}"><span class="art-tag">${escapeHtml(a.category || "عام")}</span>${
        a.cover_url ? `<img src="${escapeHtml(safeUrl(a.cover_url))}" alt="" loading="lazy" decoding="async" />` : `<i class="fas fa-pen-nib"></i>`
      }</div>
      <div class="art-body">
        <div class="art-meta"><span><i class="far fa-clock"></i>${parseInt(a.read_minutes, 10) || 1} د قراءة</span></div>
        <h3 class="art-title">${escapeHtml(a.title)}</h3>
        <span class="art-more">اقرأ المقال <i class="fas fa-arrow-left"></i></span>
      </div>
    </a>`;
}

function showMore(list) {
  list = list || [];
  const i = list.findIndex((x) => x.slug === slug);
  const newer = i > 0 ? list[i - 1] : null;
  const older = i >= 0 && i < list.length - 1 ? list[i + 1] : null;

  const pnWrap = document.getElementById("pn-wrap");
  if (newer || older) {
    pnWrap.classList.remove("hidden");
    document.getElementById("pn-grid").innerHTML =
      (older ? `<a class="pn prev" href="article.html?slug=${encodeURIComponent(older.slug)}"><small><i class="fas fa-arrow-right"></i> المقال السابق</small><b>${escapeHtml(older.title)}</b></a>` : "<span></span>") +
      (newer ? `<a class="pn next" href="article.html?slug=${encodeURIComponent(newer.slug)}"><small>المقال التالي <i class="fas fa-arrow-left"></i></small><b>${escapeHtml(newer.title)}</b></a>` : "<span></span>");
  } else pnWrap.classList.add("hidden");

  const cur = list[i];
  const others = list.filter((x) => x.slug !== slug);
  others.sort((a, b) => ((b.category === (cur && cur.category)) | 0) - ((a.category === (cur && cur.category)) | 0));
  const pick = others.slice(0, 3);
  const wrap = document.getElementById("more-wrap");
  if (!pick.length) { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  document.getElementById("more-grid").innerHTML = pick.map(relCard).join("");
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
