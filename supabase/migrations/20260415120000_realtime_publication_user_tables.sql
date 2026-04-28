-- Add migrated user tables to the Realtime publication (run once per project).
-- If a table is already in the publication, you may see a harmless error — skip that line.
alter publication supabase_realtime add table public.selfcare_entries;
alter publication supabase_realtime add table public.focus_sessions;
alter publication supabase_realtime add table public.achievements;
alter publication supabase_realtime add table public.buddy_state;
alter publication supabase_realtime add table public.points_log;
