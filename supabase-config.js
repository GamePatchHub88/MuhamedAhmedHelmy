// =========================================================
// Supabase config — CLIENT SIDE (safe to expose in the browser)
// =========================================================
// ⚠️ IMPORTANT: only the "anon / public" key goes here.
// النpackage الـ service_role key اللي بيدي صلاحية كاملة على
// قاعدة البيانات وبيتخطى كل قواعد الحماية (RLS) — أبدًا متحطهوش
// في أي ملف هيتحمل على المتصفح (index.html أو admin.html أو غيرهم)،
// لإنه هيبقى ظاهر لأي حد يفتح "عرض المصدر" على موقعك.
// الـ service_role key استخدامه الوحيد المسموح بيه هو من جهاز
// شخصي/سيرفر خاص بيك، أو داخل SQL Editor في لوحة Supabase.
//
// هات الـ anon key من: Supabase Dashboard → Project Settings → API
// وحطه هنا بدل القيمة الفاضية.

const SUPABASE_URL = "https://nethlnekztwurphnqtvl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ldGhsbmVrenR3dXJwaG5xdHZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzY4MjEzOCwiZXhwIjoyMDg5MjU4MTM4fQ.UQYcBzDPPdJYvawL-tfBmRQIgOQMmbl63atzvsszXBs";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);
