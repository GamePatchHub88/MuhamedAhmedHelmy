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

const SUPABASE_URL = "https://wgcfajrwfmunwoqmneww.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnY2ZhanJ3Zm11bndvcW1uZXd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNDg3ODQsImV4cCI6MjA5ODkyNDc4NH0.sR7YNvM3YKGQkavCN617r9B30oEwf06dCuuRz83ojlE";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);
