-- Run this SQL on your YouTube Database (supabaseYt) in the SQL Editor
-- to instantly set all existing video descriptions to NULL, freeing up 200MB+ of space.

UPDATE yt_videos 
SET description = NULL 
WHERE description IS NOT NULL;

-- (Optional) Run VACUUM to let PostgreSQL reclaim the physical disk space immediately
VACUUM FULL yt_videos;
