-- 1. Optimize search function to handle millions of rows without statement timeouts
-- This optimization fixes the timeout issue when searching for short words like "shaky"
-- by using the `<%` (word_similarity) operator instead of `%` (strict similarity), 
-- which correctly matches substrings in long video titles using the GIN index.

-- Drop existing functions to avoid conflict
DROP FUNCTION IF EXISTS search_youtube_content(text, text[], integer, uuid);
DROP FUNCTION IF EXISTS search_youtube_content(text, text[], int);

CREATE OR REPLACE FUNCTION search_youtube_content(
    query_text TEXT,
    channel_ids TEXT[] DEFAULT NULL,
    max_limit INTEGER DEFAULT 200,
    requesting_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id TEXT,
    title TEXT,
    thumbnail TEXT,
    published TIMESTAMPTZ,
    type TEXT,
    playlist_count INTEGER,
    channel_id TEXT,
    channel_title TEXT,
    search_rank REAL
) AS $$
    WITH matched_videos AS (
        SELECT 
            v.video_id AS id, v.title, v.thumbnail_url AS thumbnail, v.published_at AS published,
            'video'::TEXT AS type, 0::INTEGER AS playlist_count, v.channel_id, c.name AS channel_title,
            COALESCE(word_similarity(query_text, v.title), 0.0)::REAL AS similarity_rank
        FROM yt_videos v
        JOIN youtube_channels c ON v.channel_id = c.channel_id
        WHERE 
            -- Use <% for word_similarity, which works much better and faster for substring searches
            (v.title ILIKE '%' || query_text || '%' OR query_text <% v.title)
            AND (
                (channel_ids IS NOT NULL AND v.channel_id = ANY(channel_ids))
                OR
                (channel_ids IS NULL AND c.visibility = 'public')
            )
        ORDER BY similarity_rank DESC, v.published_at DESC
        LIMIT max_limit
    ),
    matched_playlists AS (
        SELECT 
            p.playlist_id AS id, p.title, p.thumbnail_url AS thumbnail, p.created_at AS published,
            'playlist'::TEXT AS type, p.video_count AS playlist_count, p.channel_id, c.name AS channel_title,
            COALESCE(word_similarity(query_text, p.title), 0.0)::REAL AS similarity_rank
        FROM yt_playlists p
        JOIN youtube_channels c ON p.channel_id = c.channel_id
        WHERE 
            (p.title ILIKE '%' || query_text || '%' OR query_text <% p.title)
            AND (
                (channel_ids IS NOT NULL AND p.channel_id = ANY(channel_ids))
                OR
                (channel_ids IS NULL AND c.visibility = 'public')
            )
        ORDER BY similarity_rank DESC, p.created_at DESC
        LIMIT max_limit
    ),
    combined AS (
        SELECT mv.id, mv.title, mv.thumbnail, mv.published, mv.type, mv.playlist_count, mv.channel_id, mv.channel_title, mv.similarity_rank FROM matched_videos mv
        UNION ALL
        SELECT mp.id, mp.title, mp.thumbnail, mp.published, mp.type, mp.playlist_count, mp.channel_id, mp.channel_title, mp.similarity_rank FROM matched_playlists mp
    )
    SELECT 
        comb.id, comb.title, comb.thumbnail, comb.published, comb.type, comb.playlist_count, comb.channel_id, comb.channel_title,
        comb.similarity_rank AS search_rank
    FROM combined comb
    ORDER BY search_rank DESC, published DESC
    LIMIT max_limit;
$$ LANGUAGE sql;
