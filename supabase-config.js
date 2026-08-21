

const SUPABASE_URL = "https://wgcfajrwfmunwoqmneww.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnY2ZhanJ3Zm11bndvcW1uZXd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzM0ODc4NCwiZXhwIjoyMDk4OTI0Nzg0fQ.oC9Z9XI93TynwYePXApfdewt4kXMlyZ3JlteVf_I-7U";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);
