// تشغيل: node generate-sitemap.mjs
// بيجيب المقالات المنشورة من Supabase ويكتب sitemap.xml فيه كل المقالات.
// شغّله بعد كل نشر مقال جديد (أو ضيفه كأمر build في Vercel: "node generate-sitemap.mjs").
import { readFileSync, writeFileSync } from "node:fs";

const SITE = "https://mohamedahmedhelmi.vercel.app";
const cfg = readFileSync(new URL("./supabase-config.js", import.meta.url), "utf8");
const URL_ = cfg.match(/SUPABASE_URL\s*=\s*"([^"]+)"/)[1];
const KEY = cfg.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/)[1];

const res = await fetch(
  `${URL_}/rest/v1/articles?select=slug,title,cover_url,created_at,updated_at&published=eq.true&order=created_at.desc`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
);
if (!res.ok) throw new Error("Supabase: " + res.status);
const rows = await res.json();

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const day = (d) => new Date(d || Date.now()).toISOString().slice(0, 10);
const today = day();

const articles = rows
  .map((a) => `  <url>
    <loc>${SITE}/article.html?slug=${esc(encodeURIComponent(a.slug))}</loc>
    <lastmod>${day(a.updated_at || a.created_at)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>${
      a.cover_url && /^https?:/i.test(a.cover_url)
        ? `\n    <image:image>\n      <image:loc>${esc(a.cover_url)}</image:loc>\n      <image:title>${esc(a.title)}</image:title>\n    </image:image>`
        : ""
    }
  </url>`)
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>${SITE}/2.jpg</image:loc>
      <image:title>محمد أحمد حلمي — مبرمج فرونت اند</image:title>
    </image:image>
  </url>
  <url>
    <loc>${SITE}/articles.html</loc>
    <lastmod>${rows[0] ? day(rows[0].updated_at || rows[0].created_at) : today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
${articles}
</urlset>
`;
writeFileSync(new URL("./sitemap.xml", import.meta.url), xml);
console.log(`sitemap.xml ✔  (${rows.length} مقال)`);
