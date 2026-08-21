-- شغّل الكود ده مرة واحدة بس في Supabase Dashboard → SQL Editor

-- ==========================================================
-- 1) جدول المهارات (Skills)
-- ==========================================================
create table if not exists skills (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'عام', -- مثال: Front-end / Security & IT / عام
  icon text not null default 'fas fa-code', -- كلاس أيقونة Font Awesome
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

alter table skills enable row level security;

create policy "public can read skills"
on skills for select
to anon, authenticated
using (true);

create policy "authenticated can insert skills"
on skills for insert
to authenticated
with check (true);

create policy "authenticated can update skills"
on skills for update
to authenticated
using (true)
with check (true);

create policy "authenticated can delete skills"
on skills for delete
to authenticated
using (true);

-- ==========================================================
-- 2) جدول الأعمال / المشاريع (Projects)
-- ==========================================================
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  badge text not null default 'WEB APP', -- مثال: WEB APP · PWA
  icon text not null default 'fas fa-globe', -- كلاس أيقونة Font Awesome
  link_url text, -- رابط الموقع (اختياري)
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

alter table projects enable row level security;

create policy "public can read projects"
on projects for select
to anon, authenticated
using (true);

create policy "authenticated can insert projects"
on projects for insert
to authenticated
with check (true);

create policy "authenticated can update projects"
on projects for update
to authenticated
using (true)
with check (true);

create policy "authenticated can delete projects"
on projects for delete
to authenticated
using (true);

-- ==========================================================
-- 3) جدول تقييمات العملاء (Reviews / Testimonials)
-- ==========================================================
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  client_role text not null default 'عميل',
  review_text text not null,
  rating integer not null default 5,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

alter table reviews enable row level security;

create policy "public can read reviews"
on reviews for select
to anon, authenticated
using (true);

create policy "authenticated can insert reviews"
on reviews for insert
to authenticated
with check (true);

create policy "authenticated can update reviews"
on reviews for update
to authenticated
using (true)
with check (true);

create policy "authenticated can delete reviews"
on reviews for delete
to authenticated
using (true);

-- ==========================================================
-- 4) بيانات مبدئية (اختياري) — نفس المحتوى اللي كان ظاهر في الموقع قبل كده
--    شغّلها لو عايز الأقسام تبقى فيها محتوى من أول مرة بدل ما تفضل فاضية
-- ==========================================================
insert into skills (name, category, icon, order_index) values
  ('HTML5 / CSS3', 'Front-end', 'fab fa-html5', 0),
  ('JavaScript', 'Front-end', 'fab fa-js', 1),
  ('Tailwind CSS', 'Front-end', 'fas fa-wind', 2),
  ('تصميم متجاوب', 'Front-end', 'fas fa-mobile-screen', 3),
  ('واجهات RTL', 'Front-end', 'fas fa-language', 4),
  ('PWA Apps', 'Front-end', 'fas fa-bolt', 5),
  ('Penetration Testing', 'Security & IT', 'fas fa-shield-halved', 0),
  ('Security+ (مسار)', 'Security & IT', 'fas fa-user-shield', 1);

insert into projects (title, description, badge, icon, link_url, order_index) values
  ('منصة خُطي', 'موقع إسلامي فيه سيرة النبي وأصحابه , مع امكانية الاستماع الي الصوت', 'WEB APP · PWA', 'fas fa-mosque', null, 0),
  ('Ah Stack', 'مدونة شخصية لأحد العملاء , فيها مقالات وامكانية التواصل مع صاحب المدونة', 'WEB APP · PWA', 'fas fa-user-circle', null, 1),
  ('منصة كورسات أبو سفيان', 'منصة تعليمية متكاملة لبيع وعرض الكورسات، بتصميم احترافي وتجربة استخدام سلسة من التصفح لحد الشراء.', 'WEB APP · E-COMMERCE', 'fas fa-store', 'https://www.abosofyanbrand.com/', 2);

insert into reviews (client_name, client_role, review_text, rating, order_index) values
  ('صاحب المدونة الشخصية', 'عميل — المدونة الشخصية', 'تعامل محترف من أول يوم، وسلّم الموقع في الميعاد بالظبط زي ما اتفقنا. تواصل واضح طول الوقت.', 5, 0),
  ('أبو سفيان', 'عميل — منصة كورسات أبو سفيان', 'تجربة رائعة من أول استشارة لحد التسليم، منصة الكورسات طلعت بالظبط زي ما كنا محتاجينها. الدعم الفني بعد التسليم كان مميز جدًا وسريع في أي وقت احتجناه.', 5, 1);

-- ==========================================================
-- 5) لو عندك جدول شهادات قديم من نسخة سابقة (بعد إلغاء نظام الشهادات)،
--    شغّل السطرين دول لحذفه نهائيًا من قاعدة البيانات والتخزين
-- ==========================================================
-- drop table if exists certificates;
-- delete from storage.buckets where id = 'certificates';

-- ==========================================================
-- 6) بعد كده روح لـ Authentication → Users في Supabase
--    واعمل مستخدم واحد بس (إيميلك وباسورد قوي) — ده هو حساب الأدمن
--    اللي هتسجل بيه دخول من صفحة admin.html
-- ==========================================================
