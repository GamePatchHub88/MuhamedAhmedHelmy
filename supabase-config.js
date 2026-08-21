

const SUPABASE_URL = "https://nethlnekztwurphnqtvl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ldGhsbmVrenR3dXJwaG5xdHZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzY4MjEzOCwiZXhwIjoyMDg5MjU4MTM4fQ.UQYcBzDPPdJYvawL-tfBmRQIgOQMmbl63atzvsszXBs";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);
