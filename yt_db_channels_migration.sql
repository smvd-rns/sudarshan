-- =========================================================
-- RUN THIS IN YOUR YOUTUBE DATABASE (YT DB) SQL EDITOR
-- =========================================================

-- Ensure columns for tracking sync progress exist in the YT DB helper table
ALTER TABLE public.youtube_channels 
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_error TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS sync_cursor TEXT;
