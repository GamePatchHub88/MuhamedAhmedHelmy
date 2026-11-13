/* =========================================================
   markdown.js — عارض Markdown غني وآمن (مشترك بين صفحة المقال ومعاينة لوحة الإدارة)
   - بيعمل escape لكل HTML الخام، ومفيش أي سكريبت بيتنفّذ من المحتوى.
   - بيدعم كل الصيغة القديمة (## ### ** [] - 1. > ``` ---) + مزايا جديدة:
     *مائل*  ~~مشطوب~~  ==تظليل==  [[Ctrl]]  x^2^  H~2~O  روابط تلقائية
     قوائم متداخلة + قوائم مهام  |  جداول  |  بلوكات كود بألوان ولغة واسم ملف
     صناديق تنبيه (:::tip / > [!NOTE])  |  أجزاء مطوية (:::details)  |  خطوات (:::steps)
     صور بتعليق + معرض صور  |  فيديو يوتيوب  |  أزرار  |  اقتباس بمصدر  |  :::center  :::ltr
========================================================= */
(function (g) {
  "use strict";

  /* ---------- أدوات أساسية ---------- */
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const safeUrl = (u) => {
    u = String(u || "").trim();
    return /^(javascript|data|vbscript|file):/i.test(u.replace(/[\s\u0000-\u001f]/g, "")) ? "#" : u;
  };

  /* اتجاه الفقرة: لو مفيش حرف عربي وفيه إنجليزي → LTR */
  const dirAttr = (text) => {
    const t = String(text || "");
    const ar = (t.match(/[\u0600-\u06FF]/g) || []).length;
    const la = (t.match(/[A-Za-z]/g) || []).length;
    return !ar && la ? ' dir="ltr"' : "";
  };

  /* ---------- تلوين الأكواد (خفيف، بدون مكتبات) ---------- */
  const KW = {
    js: "abstract async await break case catch class const continue debugger default delete do else enum export extends finally for from function get if implements import in instanceof interface let new of private protected public readonly return set static super switch this throw try type typeof var void while with yield as null undefined true false NaN Infinity",
    py: "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield None True False self cls print",
    sh: "if then else elif fi for while until do done case esac function in select time echo cd ls rm mv cp mkdir touch cat grep sed awk sudo npm npx yarn pnpm git pip python python3 node export source curl wget chmod chown docker kubectl",
    sql: "select from where insert into values update set delete create table alter drop add column join left right inner outer full cross on group by order having limit offset as and or not null is in like between exists distinct union all case when then else end primary key foreign references index unique default constraint view database",
    clike:
      "abstract auto bool boolean break byte case catch char class const continue default defer delete do double else enum extends false final finally float for func go if implements import in instanceof int interface let long match mod mut namespace new nil null override package private protected pub public return short static string struct super switch this throw throws true try type typeof union unsigned use using var virtual void volatile while yield fn impl trait self Self",
    php: "abstract and array as break case catch class clone const continue declare default do echo else elseif empty extends final finally fn for foreach function global if implements include include_once instanceof interface isset list namespace new null or print private protected public require require_once return static switch throw trait true false try unset use var while yield",
    json: "true false null",
  };

  const R = {
    cmtC: /\/\/[^\n]*|\/\*[\s\S]*?\*\//,
    cmtHash: /(?:^|[ \t])#[^\n]*/,
    cmtSql: /--[^\n]*|\/\*[\s\S]*?\*\//,
    strQ: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/,
    strBt: /`(?:\\.|[^`\\])*`/,
    strPy3: /"""[\s\S]*?"""|'''[\s\S]*?'''/,
    num: /\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)\b/,
    fn: /\b[A-Za-z_$][\w$]*(?=\()/,
  };

  const mk = (cmt, str, kw, flags) =>
    new RegExp(
      "(" + cmt.source + ")|(" + str + ")|(" + R.num.source + ")|(\\b(?:" + kw.split(" ").join("|") + ")\\b)|(" + R.fn.source + ")",
      flags,
    );

  const SPEC = {
    js: mk(R.cmtC, R.strBt.source + "|" + R.strQ.source, KW.js, "gm"),
    py: mk(R.cmtHash, R.strPy3.source + "|" + R.strQ.source, KW.py, "gm"),
    sh: mk(R.cmtHash, R.strQ.source, KW.sh, "gm"),
    sql: mk(R.cmtSql, R.strQ.source, KW.sql, "gmi"),
    clike: mk(R.cmtC, R.strBt.source + "|" + R.strQ.source, KW.clike, "gm"),
    php: mk(R.cmtC, R.strQ.source, KW.php, "gm"),
    json: mk(/(?!)/, R.strQ.source, KW.json, "gm"),
    css: new RegExp(
      "(\\/\\*[\\s\\S]*?\\*\\/)|(" + R.strQ.source + ")|(#[\\da-fA-F]{3,8}\\b|-?\\d*\\.?\\d+(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|fr|ch)?\\b)|(@[\\w-]+)|([\\w-]+)(?=\\s*:)",
      "g",
    ),
  };

  const ALIAS = {
    js: "js", javascript: "js", jsx: "js", mjs: "js", node: "js", ts: "js", tsx: "js", typescript: "js",
    py: "py", python: "py",
    sh: "sh", bash: "sh", shell: "sh", zsh: "sh", terminal: "sh", cmd: "sh", powershell: "sh", ps1: "sh",
    sql: "sql", mysql: "sql", postgres: "sql",
    php: "php",
    json: "json",
    css: "css", scss: "css", less: "css",
    html: "html", xml: "html", svg: "html", vue: "html",
    java: "clike", c: "clike", cpp: "clike", "c++": "clike", cs: "clike", csharp: "clike", go: "clike", rust: "clike", rs: "clike", kotlin: "clike", swift: "clike", dart: "clike",
    diff: "diff", patch: "diff",
  };

  const LABEL = {
    js: "JavaScript", jsx: "JSX", ts: "TypeScript", tsx: "TSX", typescript: "TypeScript", javascript: "JavaScript",
    py: "Python", python: "Python", html: "HTML", css: "CSS", scss: "SCSS", json: "JSON",
    sh: "Shell", bash: "Bash", shell: "Shell", sql: "SQL", php: "PHP", diff: "Diff",
    java: "Java", cpp: "C++", c: "C", cs: "C#", csharp: "C#", go: "Go", rust: "Rust", vue: "Vue", xml: "XML",
    powershell: "PowerShell", cmd: "CMD", node: "Node.js", kotlin: "Kotlin", swift: "Swift", dart: "Dart",
  };

  const CLS = ["", "c", "s", "n", "k", "f"];

  function hlTag(t) {
    const m = /^(<\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?>)$/.exec(t);
    if (!m) return esc(t);
    const attrs = esc(m[3]).replace(
      /([\w:@.-]+)(=)(&quot;[\s\S]*?&quot;|&#39;[\s\S]*?&#39;)/g,
      '<span class="tk-f">$1</span>$2<span class="tk-s">$3</span>',
    );
    return `<span class="tk-p">${esc(m[1])}</span><span class="tk-k">${m[2]}</span>${attrs}<span class="tk-p">${esc(m[4])}</span>`;
  }

  function hlHtml(code) {
    const re = /(<!--[\s\S]*?-->)|(<\/?[A-Za-z][^>]*>)/g;
    let out = "", last = 0, m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      out += m[1] ? `<span class="tk-c">${esc(m[0])}</span>` : hlTag(m[0]);
      last = m.index + m[0].length;
    }
    return out + esc(code.slice(last));
  }

  function hlDiff(code) {
    return code
      .split("\n")
      .map((l) => {
        const c = /^\+(?!\+\+)/.test(l) ? "dl-add" : /^-(?!--)/.test(l) ? "dl-del" : /^@@/.test(l) ? "dl-hunk" : "";
        return `<span class="dl ${c}">${esc(l) || " "}</span>`;
      })
      .join("");
  }

  function hlGeneric(code, kind) {
    const re = new RegExp(SPEC[kind].source, SPEC[kind].flags);
    let out = "", last = 0, m;
    while ((m = re.exec(code))) {
      if (m[0] === "") { re.lastIndex++; continue; }
      out += esc(code.slice(last, m.index));
      let idx = 1;
      while (idx < 6 && m[idx] === undefined) idx++;
      let cls = CLS[idx];
      if (kind === "json" && cls === "s" && /^\s*:/.test(code.slice(m.index + m[0].length))) cls = "f";
      out += `<span class="tk-${cls}">${esc(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    return out + esc(code.slice(last));
  }

  function highlight(code, lang) {
    const kind = ALIAS[String(lang || "").toLowerCase()];
    if (!kind || code.length > 60000) return esc(code);
    try {
      if (kind === "html") return hlHtml(code);
      if (kind === "diff") return hlDiff(code);
      return hlGeneric(code, kind);
    } catch (_) {
      return esc(code);
    }
  }

  function codeBox(info, code) {
    const parts = String(info || "").trim().split(/\s+/).filter(Boolean);
    const lang = (parts.shift() || "").replace(/^\{|\}$/g, "");
    const file = parts.join(" ").replace(/^title=/i, "").replace(/^["']|["']$/g, "");
    const label = lang ? LABEL[lang.toLowerCase()] || lang : "";
    return (
      `<div class="codebox"><div class="code-head"><span class="code-dots" aria-hidden="true"><i></i><i></i><i></i></span>` +
      `<span class="code-title">${esc(file)}</span>${label ? `<span class="code-lang">${esc(label)}</span>` : ""}</div>` +
      `<pre><code${lang ? ` class="lang-${esc(lang.toLowerCase().replace(/[^\w+#-]/g, ""))}"` : ""}>${highlight(code, lang)}</code></pre></div>`
    );
  }

  /* ---------- التنسيق داخل السطر ---------- */
  function fmt(s) {
    return s
      .replace(/\*\*\*([^*]+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\s](?:[^*\n]*?[^*\s])?)\*(?![*\w])/g, "$1<em>$2</em>")
      .replace(/~~([^~\n]+?)~~/g, "<del>$1</del>")
      .replace(/==([^=\s](?:[^=\n]*?[^=\s])?)==/g, "<mark>$1</mark>")
      .replace(/\^([^\s^]+)\^/g, "<sup>$1</sup>")
      .replace(/~([^\s~]+)~/g, "<sub>$1</sub>");
  }

  function inline(raw) {
    const st = [];
    const keep = (h) => "\u0002" + (st.push(h) - 1) + "\u0003";
    let s = esc(raw);

    s = s.replace(/`([^`\n]+)`/g, (_, c) => keep("<code>" + c + "</code>"));
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)/g, (_, alt, u, cap) =>
      keep(`<img src="${safeUrl(u)}" alt="${alt}"${cap ? ` title="${cap}"` : ""} loading="lazy" decoding="async" />`),
    );
    s = s.replace(/\[\[([^\]\n]+)\]\]/g, (_, k) => keep("<kbd>" + k + "</kbd>"));
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
      const url = safeUrl(u);
      const ext = /^https?:/i.test(url);
      return keep(`<a href="${url}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${fmt(t)}</a>`);
    });
    /* روابط تلقائية للـ URLs العارية */
    s = s.replace(/(^|[\s(>])(https?:\/\/[^\s\u0002]+)/g, (m, pre, url) => {
      let tail = "";
      const t = url.match(/(?:[.,;:!?)\]،؛؟]|&quot;|&#39;|&gt;|&lt;)+$/);
      if (t) { tail = t[0]; url = url.slice(0, -tail.length); }
      if (url.length < 10) return m;
      return pre + keep(`<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`) + tail;
    });

    s = fmt(s);
    let guard = 0;
    while (/\u0002\d+\u0003/.test(s) && guard++ < 6) s = s.replace(/\u0002(\d+)\u0003/g, (_, i) => st[i]);
    return s;
  }

  /* ---------- صناديق التنبيه ---------- */
  const CALL = {
    note: { ic: "fa-note-sticky", t: "ملاحظة", c: "#8b7bff" },
    info: { ic: "fa-circle-info", t: "معلومة", c: "#60a5fa" },
    tip: { ic: "fa-lightbulb", t: "نصيحة", c: "#5eead4" },
    important: { ic: "fa-circle-exclamation", t: "مهم", c: "#f472b6" },
    warning: { ic: "fa-triangle-exclamation", t: "تنبيه", c: "#ffc46b" },
    danger: { ic: "fa-fire", t: "تحذير", c: "#f87171" },
    success: { ic: "fa-circle-check", t: "تم بنجاح", c: "#4ade80" },
  };
  const CALL_ALIAS = { caution: "danger", error: "danger", warn: "warning", check: "success", ok: "success", hint: "tip", idea: "tip" };
  const callType = (k) => {
    k = String(k || "").toLowerCase();
    return CALL[k] ? k : CALL_ALIAS[k] || null;
  };

  function callout(type, title, bodyHtml) {
    const c = CALL[type];
    return (
      `<aside class="callout" data-type="${type}" style="--cc:${c.c}" role="note">` +
      `<div class="callout-head"><i class="fas ${c.ic}" aria-hidden="true"></i><b>${title ? inline(title) : c.t}</b></div>` +
      `<div class="callout-body">${bodyHtml}</div></aside>`
    );
  }

  /* ---------- جداول ---------- */
  const SEP_RE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

  function splitRow(l) {
    l = l.trim();
    if (l.startsWith("|")) l = l.slice(1);
    if (l.endsWith("|") && !l.endsWith("\\|")) l = l.slice(0, -1);
    const cells = [];
    let cur = "";
    for (let k = 0; k < l.length; k++) {
      const ch = l[k];
      if (ch === "\\" && l[k + 1] === "|") { cur += "|"; k++; }
      else if (ch === "|") { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  }

  function tryTable(lines, i) {
    const head = lines[i], sep = lines[i + 1];
    if (sep === undefined || head.indexOf("|") < 0 || sep.indexOf("|") < 0 || !SEP_RE.test(sep)) return null;
    const heads = splitRow(head);
    const al = splitRow(sep).map((c) => (c[0] === ":" && c.slice(-1) === ":" ? "center" : c.slice(-1) === ":" ? "right" : c[0] === ":" ? "left" : ""));
    let j = i + 2;
    const rows = [];
    while (j < lines.length && lines[j].trim() && lines[j].indexOf("|") >= 0 && !/^\u0001/.test(lines[j].trim())) {
      rows.push(splitRow(lines[j]));
      j++;
    }
    const a = (k) => (al[k] ? ` data-al="${al[k]}"` : "");
    const html =
      `<div class="tbl-wrap"><table><thead><tr>${heads.map((h, k) => `<th${a(k)}>${inline(h)}</th>`).join("")}</tr></thead>` +
      `<tbody>${rows.map((r) => `<tr>${heads.map((_, k) => `<td${a(k)}>${inline(r[k] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    return [html, j - 1];
  }

  /* ---------- قوائم متداخلة ---------- */
  function renderList(items) {
    let pos = 0;
    const level = (indent) => {
      const type = items[pos].type;
      const startNum = items[pos].num;
      let html = "", allTask = true;
      while (pos < items.length) {
        const it = items[pos];
        if (it.indent !== indent || it.type !== type) break;
        pos++;
        let nested = "";
        while (pos < items.length && items[pos].indent > indent) nested += level(items[pos].indent);
        const body = inline(it.text).replace(/\n/g, "<br>");
        if (it.task) {
          const done = it.task === "x";
          html += `<li class="task${done ? " done" : ""}"><div class="task-row"><input class="chk" type="checkbox" disabled${done ? " checked" : ""} aria-label="${done ? "منجز" : "غير منجز"}" /><span>${body}</span></div>${nested}</li>`;
        } else {
          allTask = false;
          html += `<li${dirAttr(it.text)}>${body}${nested}</li>`;
        }
      }
      const attrs = (allTask ? ' class="tasks"' : "") + (type === "ol" && startNum && startNum !== 1 ? ` start="${startNum}"` : "");
      return `<${type}${attrs}>${html}</${type}>`;
    };
    let h = "";
    while (pos < items.length) h += level(items[pos].indent);
    return h;
  }

  /* ---------- فيديو / صور ---------- */
  const YT_RE = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^\s#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#]\S*)?$/;
  const videoHtml = (id) =>
    `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="فيديو يوتيوب" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;

  const IMG_LINE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/;
  function figure(m) {
    const cap = m[3] ? `<figcaption>${inline(m[3])}</figcaption>` : "";
    return `<figure class="fig"><img src="${esc(safeUrl(m[2]))}" alt="${esc(m[1])}" loading="lazy" decoding="async" />${cap}</figure>`;
  }

  /* ---------- المحلل الرئيسي ---------- */
  function parse(lines, depth, ctx) {
    const out = [];
    let para = [], quote = [], list = null, gal = [];

    const flushP = () => {
      if (para.length) {
        const txt = para.join("\n");
        out.push(`<p${dirAttr(txt)}>${inline(txt).replace(/\n/g, "<br>")}</p>`);
        para = [];
      }
    };
    const flushQ = () => {
      if (!quote.length) return;
      let q = quote;
      quote = [];
      const first = q[0].match(/^\[!([A-Za-z]+)\]\s*(.*)$/);
      if (first && callType(first[1])) {
        out.push(callout(callType(first[1]), first[2], parse(q.slice(1), depth + 1, ctx)));
        return;
      }
      let cite = "";
      const cm = q.length > 1 && q[q.length - 1].match(/^(?:—|–|―|--)\s*(.+)$/);
      if (cm) { cite = `<cite>${inline(cm[1])}</cite>`; q = q.slice(0, -1); }
      out.push(`<blockquote>${parse(q, depth + 1, ctx)}${cite}</blockquote>`);
    };
    const flushL = () => {
      if (list) { out.push(renderList(list)); list = null; }
    };
    const flushG = () => {
      if (!gal.length) return;
      out.push(gal.length === 1 ? figure(gal[0]) : `<div class="gallery g${Math.min(gal.length, 3)}">${gal.map(figure).join("")}</div>`);
      gal = [];
    };
    const flushAll = () => { flushP(); flushQ(); flushL(); flushG(); };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const t = raw.trim();
      let m;

      if (!t) { flushAll(); continue; }

      /* استكمال سطر عنصر قائمة (سطر مُزاح تحت العنصر) */
      if (list && /^\s{2,}\S/.test(raw) && !/^\s*(?:[-*+]|\d+[.)])\s+/.test(raw)) {
        list[list.length - 1].text += "\n" + t;
        continue;
      }

      if ((m = t.match(/^\u0001(\d+)\u0001$/))) { flushAll(); out.push(ctx.blocks[m[1]]); continue; }

      /* حاويات ::: */
      if ((m = t.match(/^:::\s*([A-Za-z]+)\s*(.*)$/))) {
        flushAll();
        const kind = m[1].toLowerCase(), title = m[2].trim();
        let d = 1, j = i + 1;
        const inner = [];
        for (; j < lines.length; j++) {
          const tt = lines[j].trim();
          if (/^:::\s*[A-Za-z]/.test(tt)) d++;
          else if (tt === ":::") { d--; if (d === 0) break; }
          inner.push(lines[j]);
        }
        i = j;
        const body = depth > 5 ? esc(inner.join("\n")) : parse(inner, depth + 1, ctx);
        const ct = callType(kind);
        if (ct) out.push(callout(ct, title, body));
        else if (kind === "details" || kind === "toggle" || kind === "fold")
          out.push(`<details class="fold"><summary>${inline(title || "التفاصيل")}</summary><div class="fold-body">${body}</div></details>`);
        else if (kind === "steps") out.push(`<div class="steps">${body}</div>`);
        else if (kind === "center") out.push(`<div class="md-center">${body}</div>`);
        else if (kind === "ltr") out.push(`<div class="md-ltr" dir="ltr">${body}</div>`);
        else out.push(`<div>${body}</div>`);
        continue;
      }
      if (t === ":::") continue;

      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(t)) { flushAll(); out.push("<hr>"); continue; }

      if ((m = t.match(/^(#{1,4})\s+(.+)$/))) {
        flushAll();
        const l = m[1].length <= 2 ? 2 : m[1].length === 3 ? 3 : 4;
        const id = ctx.hid(m[2]);
        out.push(`<h${l} id="${id}"${dirAttr(m[2])}>${inline(m[2])}<a class="anc" href="#${id}" aria-label="رابط القسم">#</a></h${l}>`);
        continue;
      }

      /* جدول */
      if (t.indexOf("|") >= 0 && lines[i + 1] !== undefined) {
        const tb = tryTable(lines, i);
        if (tb) { flushAll(); out.push(tb[0]); i = tb[1]; continue; }
      }

      if ((m = t.match(/^>\s?(.*)$/))) { flushP(); flushL(); flushG(); quote.push(m[1]); continue; }

      if ((m = raw.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/))) {
        flushP(); flushQ(); flushG();
        const tk = m[3].match(/^\[( |x|X)\]\s+(.*)$/);
        if (!list) list = [];
        list.push({
          indent: m[1].length,
          type: /\d/.test(m[2]) ? "ol" : "ul",
          num: parseInt(m[2], 10) || 0,
          task: tk ? (tk[1] === " " ? "o" : "x") : "",
          text: tk ? tk[2] : m[3],
        });
        continue;
      }

      if ((m = t.match(IMG_LINE))) { flushP(); flushQ(); flushL(); gal.push(m); continue; }

      /* فيديو يوتيوب: @[youtube](url) أو رابط يوتيوب لوحده في سطر */
      if ((m = t.match(/^@\[(?:youtube|video)\]\((\S+)\)$/i)) && YT_RE.test(m[1])) {
        flushAll(); out.push(videoHtml(m[1].match(YT_RE)[1])); continue;
      }
      if ((m = t.match(YT_RE))) { flushAll(); out.push(videoHtml(m[1])); continue; }

      /* زر: @[button النص](url) */
      if ((m = t.match(/^@\[button\s+(.+?)\]\((\S+)\)$/i))) {
        flushAll();
        const url = esc(safeUrl(m[2]));
        out.push(`<div class="md-btn-wrap"><a class="md-btn" href="${url}"${/^https?:/i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${inline(m[1])} <i class="fas fa-arrow-left" aria-hidden="true"></i></a></div>`);
        continue;
      }

      flushL(); flushQ(); flushG();
      para.push(t);
    }
    flushAll();
    return out.join("\n");
  }

  function render(src) {
    const ctx = { blocks: [], used: {} };
    ctx.hid = (txt) => {
      const base =
        String(txt).replace(/[`*\[\]()!<>=~^]/g, "").trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "section";
      let id = base, n = 2;
      while (ctx.used[id]) id = base + "-" + n++;
      ctx.used[id] = 1;
      return id;
    };
    src = String(src || "")
      .replace(/\r\n?/g, "\n")
      .replace(/(^|\n)[ \t]*```([^\n`]*)\n([\s\S]*?)\n?[ \t]*```[ \t]*(?=\n|$)/g, (_, pre, info, code) => {
        ctx.blocks.push(codeBox(info, code));
        return "\n\u0001" + (ctx.blocks.length - 1) + "\u0001\n";
      })
      .replace(/\t/g, "  ");
    return parse(src.split("\n"), 0, ctx);
  }

  /* نص عادي (للوصف / عدّ الكلمات / SEO) */
  function plain(src) {
    return String(src || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/@\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^:::.*$/gm, " ")
      .replace(/^\s*>\s*\[![A-Za-z]+\]/gm, " ")
      .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, " ")
      .replace(/[#>*`~=|^\[\]()!_]/g, " ")
      .replace(/\s+-\s+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  g.MD = { render, plain, inline, highlight };
  g.renderMarkdown = render;
  g.mdPlain = plain;
})(window);
