-- شغّل الكود ده مرة واحدة بس في Supabase Dashboard → SQL Editor

-- 1) جدول الشهادات
create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pdf_url text not null,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

-- لو الجدول كان متعمل قبل كده من غير عمود order_index، شغّل السطر ده لوحده:
-- alter table certificates add column if not exists order_index integer not null default 0;

alter table certificates enable row level security;

-- أي زائر للموقع يقدر يقرأ الشهادات (عرض عام)
create policy "public can read certificates"
on certificates for select
to anon, authenticated
using (true);

-- بس المستخدم اللي عامل تسجيل دخول (الأدمن) يقدر يضيف
create policy "authenticated can insert certificates"
on certificates for insert
to authenticated
with check (true);

-- وبس هو يقدر يعدّل (لإعادة الترتيب)
create policy "authenticated can update certificates"
on certificates for update
to authenticated
using (true)
with check (true);

-- وبس هو يقدر يحذف
create policy "authenticated can delete certificates"
on certificates for delete
to authenticated
using (true);

-- 2) مساحة تخزين ملفات الـ PDF
insert into storage.buckets (id, name, public)
values ('certificates', 'certificates', true)
on conflict (id) do nothing;

create policy "public read certificate files"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'certificates');

create policy "authenticated upload certificate files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'certificates');

create policy "authenticated delete certificate files"
on storage.objects for delete
to authenticated
using (bucket_id = 'certificates');

-- 3) بعد كده روح لـ Authentication → Users في Supabase
--    واعمل مستخدم واحد بس (إيميلك وباسورد قوي) — ده هو حساب الأدمن
--    اللي هتسجل بيه دخول من صفحة admin.html
