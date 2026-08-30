"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import {
  SlidersHorizontal, ChevronDown, Check,
  Search, Play, Radio, Film, Layers, ExternalLink,
  Loader2, X, Clock, CheckCircle2,
  Heart, Bookmark, Share2, Video, AlertCircle, Grid
} from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import OptimizedVideoPlayer from "./OptimizedVideoPlayer";
import { openExternal } from "@/lib/device";
import ShareModal from "./ShareModal";

interface VideoItem {
  id: string;
  title: string;
  thumbnail: string;
  date?: string;
  published: string;
  type: "video" | "live" | "short" | "playlist";
  playlistCount?: number;
  channelId?: string;
  channel_id?: string;
  channelTitle?: string;
  lastPosition?: number;
  duration?: number;
}

interface Channel {
  id: string;          // Database UUID
  channel_id: string;   // UCxx format
  name: string;
  handle: string;
  custom_logo: string;  // Manually uploaded to Supabase
  banner_style: string;
}

const tabs = [
  { id: "videos", label: "Videos", icon: Play },
  { id: "playlists", label: "Playlists", icon: Layers },
  { id: "favorites", label: "Watch Later", icon: Clock },
];

const formatClockTime = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export default function YouTubeChannelHub() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [activeTab, setActiveTab] = useState("videos");
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [activePlaylistName, setActivePlaylistName] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteVideos, setFavoriteVideos] = useState<VideoItem[]>([]);
  const [favoriteChannels, setFavoriteChannels] = useState<string[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const [autoplay, setAutoplay] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    const saved = localStorage.getItem("yt-autoplay");
    if (saved !== null) {
      setAutoplay(saved === "true");
    }
  }, []);

  const toggleAutoplay = () => {
    setAutoplay(prev => {
      const newVal = !prev;
      localStorage.setItem("yt-autoplay", String(newVal));
      return newVal;
    });
  };

  const [contentCache, setContentCache] = useState<Record<string, any>>({});
  const [logoCache, setLogoCache] = useState<Record<string, string>>({});

  const [visibleChannelsCount, setVisibleChannelsCount] = useState(10);
  const observerRef = useRef<HTMLDivElement | null>(null);

  const toggleFavoriteChannel = async (e: React.MouseEvent, channelId: string) => {
    e.stopPropagation();
    
    const sessionStr = localStorage.getItem('supabase.auth.token'); // Fallback if no session prop
    const token = sessionStr ? JSON.parse(sessionStr).access_token : null;
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.dispatchEvent(new CustomEvent("show-policy"));
      return;
    }

    const isAlreadyFav = favoriteChannels.includes(channelId);
    const requestIntent = isAlreadyFav ? "remove" : "add";

    // OPTIMISTIC UPDATE: Update UI immediately
    setFavoriteChannels(prev => {
      const newFavs = isAlreadyFav 
        ? prev.filter(id => id !== channelId) 
        : [...prev, channelId];
      notify(isAlreadyFav ? "Removed channel from favorites" : "Added channel to favorites");
      return newFavs;
    });

    // BACKGROUND SYNC: Send to database
    try {
      const performSync = async (retryCount = 0) => {
        try {
          const res = await fetch("/api/user/favorite-channels?v=1", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}` 
            },
            body: JSON.stringify({ 
              intent: requestIntent,
              channel_id: channelId
            })
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            console.warn(`[FavChannelSync] Save attempt ${retryCount + 1} failed (${res.status}):`, errorData.error);
            
            if (retryCount < 2 && (res.status === 503 || res.status === 504 || res.status === 429)) {
              const delay = (retryCount + 1) * 5000; 
              setTimeout(() => performSync(retryCount + 1), delay);
            }
          }
        } catch (err) {
          console.error("[FavChannelSync] Background network error:", err);
        }
      };

      performSync();
    } catch (err) {
      console.error("Failed to start background favorite sync:", err);
    }
  };

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [globalResults, setGlobalResults] = useState<{ playlists: VideoItem[], videos: VideoItem[] }>({ playlists: [], videos: [] });
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [fetchedVideoMetadata, setFetchedVideoMetadata] = useState<Record<string, VideoItem>>({});
  const filterRef = useRef<HTMLDivElement>(null);

  // Reset pagination when filter/search changes
  useEffect(() => {
    setVisibleChannelsCount(10);
  }, [selectedChannelIds, activeSearchQuery]);

  const fetchedRef = useRef<Set<string>>(new Set());
  const currentTimeRef = useRef<number>(0);
  const currentDurationRef = useRef<number>(0);
  const playerInstanceRef = useRef<any>(null);
  const lastProgressSyncRef = useRef<Record<string, number>>({});

  useEffect(() => {
    // Reset time tracking when video changes
    currentTimeRef.current = 0;
    currentDurationRef.current = 0;
  }, [activeVideoId]);

  useEffect(() => {
    const fetchChannels = async () => {
      setLoadingChannels(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || "guest";
        const storageKey = `channels_cache_v3_${userId}`;
        
        // 1. Try reading from LocalStorage Cache first
        try {
          const rawCache = localStorage.getItem(storageKey);
          if (rawCache) {
            const parsed = JSON.parse(rawCache);
            // 24 hours TTL = 86400000 ms
            const isFresh = Date.now() - parsed.timestamp < 86400000;
            if (parsed.channels?.length > 0) {
              setChannels(parsed.channels);
              setLoadingChannels(false);
              
              // Handle URL query selection from cache immediately
              const urlChannelId = searchParams.get("channel");
              const urlPlaylistId = searchParams.get("playlist");
              const urlVideoId = searchParams.get("v");

              if (urlChannelId) {
                const found = parsed.channels.find((c: any) => c.channel_id === urlChannelId);
                if (found) {
                  setActiveChannel(found);
                  if (urlPlaylistId) setActivePlaylistId(urlPlaylistId);
                  if (urlVideoId) setActiveVideoId(urlVideoId);
                }
              }

              if (isFresh) {
                // Cache is still valid (< 24 hours). Skip network fetch completely.
                return;
              }
            }
          }
        } catch (e) {
          console.warn("Failed to read local channels cache:", e);
        }

        // 2. Fetch from network if cache is stale or missing
        const headers: Record<string, string> = {};
        if (session) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }

        const res = await fetch("/api/youtube/channels?v=2", { headers });
        const data = await res.json();
        if (data.channels?.length > 0) {
          setChannels(data.channels);
          
          // Save back to LocalStorage with timestamp
          try {
            localStorage.setItem(storageKey, JSON.stringify({
              channels: data.channels,
              timestamp: Date.now()
            }));
          } catch (e) {
            console.warn("Failed to write local channels cache:", e);
          }
          
          const urlChannelId = searchParams.get("channel");
          const urlPlaylistId = searchParams.get("playlist");
          const urlVideoId = searchParams.get("v");

          if (urlChannelId) {
            const found = data.channels.find((c: any) => c.channel_id === urlChannelId);
            if (found) {
              setActiveChannel(found);
              if (urlPlaylistId) setActivePlaylistId(urlPlaylistId);
              if (urlVideoId) setActiveVideoId(urlVideoId);
            }
          }
        }
      } catch (err) {
        // Only show error screen if we don't have cached data to fallback to
        if (channels.length === 0) {
          setError("Failed to load portal configuration.");
        }
      } finally {
        setLoadingChannels(false);
      }
    };
    fetchChannels();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const urlChannelId = searchParams.get("channel");
    const urlPlaylistId = searchParams.get("playlist");
    const urlVideoId = searchParams.get("v");
    const urlTab = searchParams.get("tab");

    if (!urlChannelId) {
      if (urlTab === "favorites") {
        setActiveChannel(null);
        setActiveTab("favorites");
        setActivePlaylistId(null);
        setActiveVideoId(urlVideoId || null);
        return;
      }
      
      if (activeChannel || activeTab !== "videos") {
        setActiveChannel(null);
        setActiveTab("videos");
        setActivePlaylistId(null);
        setActiveVideoId(null);
      }
      return;
    }
    
    if (channels.length > 0) {
      const matched = channels.find(c => c.channel_id === urlChannelId);
      
      if (matched && matched.channel_id !== activeChannel?.channel_id) {
        setActiveChannel(matched);
        setActiveVideoId(null);
        // Reset to videos if no explicit tab is in URL (prevents sticking to favorites/playlists from prev channel)
        if (!urlTab) setActiveTab("videos");

        // Scroll to player on channel change
        setTimeout(() => {
          if (playerRef.current) {
            playerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 100);
      }
      
      if (urlTab && urlTab !== activeTab) {
        setActiveTab(urlTab as any);
      }
      
      // Only set if they exist in URL and differ from current state
      // This prevents the "null" in URL from fighting with the "auto-select" logic
      if (urlPlaylistId && urlPlaylistId !== activePlaylistId) {
        setActivePlaylistId(urlPlaylistId);
        // If we have a playlist in URL but no tab, force 'playlists' tab to ensure correct content loading
        if (!urlTab && activeTab !== "playlists") {
          setActiveTab("playlists");
        }
      }
      if (urlVideoId && urlVideoId !== activeVideoId) {
        setActiveVideoId(urlVideoId);
      }
    }
  }, [searchParams, channels, activeChannel?.channel_id, activePlaylistId, activeVideoId, activeTab]);

  const fetchFavorites = useCallback(async () => {
    const sessionStr = localStorage.getItem('supabase.auth.token'); // Fallback if no session prop
    const token = sessionStr ? JSON.parse(sessionStr).access_token : null;
    
    // Better way: use supabase.auth.getSession() or pass from parent
    // For now, we'll try to get it from the supabase client directly if possible
    // or just assume the API will handle the error if no token is sent.
    
    setLoadingFavorites(true);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/user/favorites?v=1", {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setFavorites(data.favoriteIds || []);
        setFavoriteVideos(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch favorites:", err);
    } finally {
      setLoadingFavorites(false);
      setLoading(false);
    }
  }, []);

  const fetchFavoriteChannels = useCallback(async () => {
    try {
      const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/user/favorite-channels?v=1", {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setFavoriteChannels(data.favoriteIds || []);
      }
    } catch (err) {
      console.error("Failed to fetch favorite channels:", err);
    }
  }, []);

  const toggleFavorite = async (e: React.MouseEvent, videoId: string) => {
    e.stopPropagation();
    
    // 1. Check Session First
    const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
    if (!session) {
      window.dispatchEvent(new CustomEvent("show-policy"));
      return;
    }

    const isAlreadyFavorite = favorites.includes(videoId);
    const shouldIncludeProgress = !isAlreadyFavorite && videoId === activeVideoId;
    const requestIntent = isAlreadyFavorite ? "remove" : "add";

    // 2. OPTIMISTIC UPDATE: Update UI immediately
    if (isAlreadyFavorite) {
      setFavorites(prev => prev.filter(id => id !== videoId));
      setFavoriteVideos(prev => prev.filter(v => v.id !== videoId));
      notify("Removed from Watch Later");
    } else {
      setFavorites(prev => [...prev, videoId]);
      const vid = videos.find((v: any) => v.id === videoId) || 
                  globalResults.videos.find((v: any) => v.id === videoId) || 
                  globalResults.playlists.find((v: any) => v.id === videoId) || 
                  fetchedVideoMetadata[videoId];
      
      if (vid) {
        // Force-sync time for the notification/initial state
        let finalTime = currentTimeRef.current;
        let finalDuration = currentDurationRef.current;
        if (playerInstanceRef.current?.getCurrentTime) {
          finalTime = playerInstanceRef.current.getCurrentTime() || finalTime;
          finalDuration = playerInstanceRef.current.getDuration() || finalDuration;
        }
        
        setFavoriteVideos(prev => [{ ...vid, lastPosition: finalTime, duration: finalDuration }, ...prev]);
        notify(`Added to Watch Later at ${formatClockTime(finalTime)}`);
      } else {
        notify("Added to Watch Later!");
      }
    }

    // 3. BACKGROUND SYNC: Send to database without making the user wait
    try {
      // Get the exact time one more time for the background save
      let finalTime = currentTimeRef.current;
      let finalDuration = currentDurationRef.current;
      if (shouldIncludeProgress && playerInstanceRef.current?.getCurrentTime) {
        finalTime = playerInstanceRef.current.getCurrentTime() || finalTime;
        finalDuration = playerInstanceRef.current.getDuration() || finalDuration;
      }

      const performSync = async (retryCount = 0) => {
        try {
          const res = await fetch("/api/user/favorites?v=1", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}` 
            },
            body: JSON.stringify({ 
              intent: requestIntent,
              video_id: videoId,
              last_position: shouldIncludeProgress ? finalTime : undefined,
              duration: shouldIncludeProgress ? finalDuration : undefined
            })
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            console.warn(`[PushDiag] Background save attempt ${retryCount + 1} failed (${res.status}):`, errorData.error);
            
            if (retryCount < 2 && (res.status === 503 || res.status === 504 || res.status === 429)) {
              const delay = (retryCount + 1) * 5000; // 5s, 10s
              console.log(`[PushDiag] Retrying in ${delay/1000}s...`);
              setTimeout(() => performSync(retryCount + 1), delay);
            }
          } else {
            console.log("[PushDiag] Background save successful.");
          }
        } catch (err) {
          console.error("[PushDiag] Background save network error:", err);
        }
      };

      performSync();
    } catch (err) {
      console.error("Failed to start background favorite sync:", err);
    }
  };

  useEffect(() => {
    fetchFavorites();
    fetchFavoriteChannels();
  }, [fetchFavorites, fetchFavoriteChannels]);

  const currentTabContent = activeChannel 
    ? (contentCache[activeChannel.channel_id]?.[activeTab]?.[activePlaylistId || "main"] || { items: [], token: "" })
    : { items: [], token: "" };
    
  const videos = currentTabContent.items;
  const nextPageToken = currentTabContent.token;
  const activeLogo = (typeof activeChannel?.custom_logo === 'string' && activeChannel.custom_logo) || 
    (activeChannel && typeof logoCache[activeChannel.channel_id] === 'string' ? logoCache[activeChannel.channel_id] : null);

  const sortedChannels = [...channels].sort((a, b) => {
    const aFav = favoriteChannels.includes(a.channel_id);
    const bFav = favoriteChannels.includes(b.channel_id);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    return 0;
  });

  const filteredChannelsCount = sortedChannels.filter(c => selectedChannelIds.length === 0 || selectedChannelIds.includes(c.channel_id)).length;

  useEffect(() => {
    if (activeChannel || activeTab === "favorites") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleChannelsCount((prev) => Math.min(prev + 10, filteredChannelsCount));
        }
      },
      { threshold: 0.1 }
    );

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => observer.disconnect();
  }, [filteredChannelsCount, activeChannel, activeTab]);

  const fetchContent = useCallback(async (channel: Channel, tab: string, isLoadMore = false) => {
    if (!channel) return;
    const pId = activePlaylistId || "main";
    const cacheKey = `${channel.channel_id}-${tab}-${pId}`;
    if (!isLoadMore && fetchedRef.current.has(cacheKey)) return;

    if (isLoadMore) setLoadMoreLoading(true);
    else {
      setLoading(true);
      fetchedRef.current.add(cacheKey);
    }
    setError(null);

    try {
      const pageToken = isLoadMore ? nextPageToken : "";
      const plParam = activePlaylistId ? `&playlistId=${activePlaylistId}` : "";
      const tParam = `&_t=${Date.now()}`;
      
      const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`/api/youtube?channelId=${channel.channel_id}&type=${tab}&pageToken=${pageToken}${plParam}${tParam}`, { headers });

      const data = await res.json();
      
      if (!res.ok) {
        fetchedRef.current.delete(cacheKey);
        const serverDetails = typeof data?.details === "string"
          ? data.details
          : data?.details?.error?.message;
        setError(serverDetails || data?.error || `HTTP ${res.status}`);
        return;
      }

      setContentCache((prev) => {
        const channelCache = prev[channel.channel_id] || {};
        const tabCache = channelCache[tab] || {};
        const plCache = tabCache[pId] || { items: [], token: "" };
        return {
          ...prev,
          [channel.channel_id]: {
            ...channelCache,
            [tab]: {
              ...tabCache,
              [pId]: {
                items: isLoadMore ? [...plCache.items, ...data.items] : data.items,
                token: data.nextPageToken || ""
              }
            }
          }
        };
      });

      if (data.channelLogo) {
        setLogoCache((prev) => ({ ...prev, [channel.channel_id]: data.channelLogo }));
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not load content.");
      console.error(err);
    } finally {
      setLoading(false);
      setLoadMoreLoading(false);
    }
  }, [nextPageToken, activePlaylistId, contentCache]);

  useEffect(() => {
    if (activeChannel && activeTab !== "favorites") {
      fetchContent(activeChannel, activeTab);
    } else if (activeTab === "favorites") {
      fetchFavorites();
    }
  }, [activeChannel, activeTab, activePlaylistId, fetchContent, fetchFavorites]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const performGlobalSearch = async () => {
      if (!activeSearchQuery.trim()) {
        setGlobalResults({ playlists: [], videos: [] });
        setIsSearchingGlobal(false);
        return;
      }

      // Require at least 3 chars when on the home page with no filters
      if (selectedChannelIds.length === 0 && !activeChannel && activeSearchQuery.length < 3) {
        setGlobalResults({ playlists: [], videos: [] });
        setIsSearchingGlobal(false);
        return;
      }

      setIsSearchingGlobal(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }
        
        let playlists: any[] = [];
        let videos: any[] = [];

        if (activeChannel && selectedChannelIds.length === 0) {
          // Inside a channel: make TWO parallel requests to ensure channel results aren't drowned out by global results
          const channelUrl = `/api/youtube/search?q=${encodeURIComponent(activeSearchQuery)}&channelId=${activeChannel.channel_id}`;
          const globalUrl = `/api/youtube/search?q=${encodeURIComponent(activeSearchQuery)}`;
          
          const [channelRes, globalRes] = await Promise.all([
            fetch(channelUrl, { headers }),
            fetch(globalUrl, { headers })
          ]);
          
          if (channelRes.ok) {
            const cData = await channelRes.json();
            playlists = [...(cData.playlists || [])];
            videos = [...(cData.videos || [])];
          }
          if (globalRes.ok) {
             const gData = await globalRes.json();
             // Merge, prioritizing channel results and avoiding duplicates
             const seenP = new Set(playlists.map(p => p.id));
             for (const p of (gData.playlists || [])) {
               if (!seenP.has(p.id)) playlists.push(p);
             }
             const seenV = new Set(videos.map(v => v.id));
             for (const v of (gData.videos || [])) {
               if (!seenV.has(v.id)) videos.push(v);
             }
          }
        } else {
          // Standard search (Home page, or with explicit filters)
          let url = `/api/youtube/search?q=${encodeURIComponent(activeSearchQuery)}`;
          if (selectedChannelIds.length > 0) {
            url += `&channelId=${selectedChannelIds.join(',')}`;
          }
          const res = await fetch(url, { headers });
          if (res.ok) {
            const data = await res.json();
            playlists = data.playlists || [];
            videos = data.videos || [];
          }
        }

        setGlobalResults({ playlists, videos });
      } catch (err) {
        console.error("Global search error:", err);
      } finally {
        setIsSearchingGlobal(false);
      }
    };

    performGlobalSearch();
  }, [activeSearchQuery, selectedChannelIds, activeChannel]);

  const playerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isShowingPlaylist = activePlaylistId !== null;
    const isMainVideoTab = activeTab === "videos" && !isShowingPlaylist;

    if (!activeVideoId && videos.length > 0 && (isMainVideoTab || isShowingPlaylist)) {
      setActiveVideoId(videos[0].id);
      setIsLive(videos[0].type === "live");
    }
  }, [videos, activeVideoId, activeTab, activePlaylistId]);

  useEffect(() => {
    if (!activeVideoId) return;

    // Check if it's already in some cache
    const isCached = videos.some((v: VideoItem) => v.id === activeVideoId) || 
                     globalResults.videos.some((v: VideoItem) => v.id === activeVideoId) ||
                     globalResults.playlists.some((v: VideoItem) => v.id === activeVideoId) ||
                     Object.values(contentCache).some((ch: any) => 
                       Object.values(ch).some((tabs: any) => 
                         Object.values(tabs).some((pl: any) => 
                           pl.items.some((v: any) => v.id === activeVideoId)
                         )
                       )
                     );

    if (!isCached && !fetchedVideoMetadata[activeVideoId]) {
      const fetchMetadata = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const headers: Record<string, string> = {};
          if (session) {
            headers["Authorization"] = `Bearer ${session.access_token}`;
          }

          const res = await fetch(`/api/youtube?videoId=${activeVideoId}`, { headers });

          if (res.ok) {
            const data = await res.json();
            setFetchedVideoMetadata(prev => ({ ...prev, [activeVideoId]: data }));
          }
        } catch (err) {
          console.error("Failed to fetch one-off video metadata:", err);
        }
      };
      fetchMetadata();
    }
  }, [activeVideoId, videos, globalResults, contentCache, fetchedVideoMetadata]);

  const displayVideos = activeTab === "favorites" ? favoriteVideos : videos;

  const filteredVideos = (() => {
    const localMatches = displayVideos.filter((v: VideoItem) =>
      v.title.toLowerCase().includes(activeSearchQuery.toLowerCase())
    );

    if (!activeSearchQuery.trim() || !activeChannel) {
      return localMatches;
    }

    // Determine if we should pull from server-side playlists or videos based on active tab
    const serverSource = activeTab === "playlists" ? globalResults.playlists : globalResults.videos;
    
    const serverMatches = serverSource
      .filter((v: any) => (v.channelId || v.channel_id) === activeChannel.channel_id)
      .map((v: any) => ({
        id: v.id,
        title: v.title,
        thumbnail: v.thumbnail,
        date: v.published ? new Date(v.published).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : undefined,
        published: v.published,
        type: v.type || (activeTab === "playlists" ? "playlist" : "video"),
        playlistCount: v.playlistCount,
        channelId: v.channelId || v.channel_id,
        channelTitle: v.channelTitle
      }));

    // Merge matches, prioritizing local ones (which may have duration, progress, etc.)
    const merged = [...localMatches];
    const seenIds = new Set(merged.map(v => v.id));

    for (const sm of serverMatches) {
      if (!seenIds.has(sm.id)) {
        merged.push(sm as any);
        seenIds.add(sm.id);
      }
    }

    return merged;
  })();

  const activeVideo = (() => {
    if (!activeVideoId) return null;
    
    // 0. Check Watch Later list FIRST (This one has the progress/timing data)
    const fromWatchLater = favoriteVideos.find((v: VideoItem) => v.id === activeVideoId);
    if (fromWatchLater) return fromWatchLater;

    // 1. Check current channel videos
    const fromChannel = videos.find((v: VideoItem) => v.id === activeVideoId);
    if (fromChannel) return fromChannel;
    
    // 2. Check global search results (important if clicked from search)
    const fromGlobal = globalResults.videos.find((v: VideoItem) => v.id === activeVideoId) || 
                       globalResults.playlists.find((v: VideoItem) => v.id === activeVideoId);
    if (fromGlobal) return fromGlobal;

    // 3. Check one-off fetched metadata
    if (fetchedVideoMetadata[activeVideoId]) return fetchedVideoMetadata[activeVideoId];
    
    // 4. Fallback: Search all channel caches
    for (const chId in contentCache) {
      for (const tab in contentCache[chId]) {
        for (const plId in contentCache[chId][tab]) {
           const found = contentCache[chId][tab][plId].items.find((v: any) => v.id === activeVideoId);
           if (found) return found;
        }
      }
    }
    return null;
  })();



  const handleVideoSelect = (vid: VideoItem) => {
    if (vid.type === "playlist") {
      setActivePlaylistId(vid.id);
      setActivePlaylistName(vid.title);
      setActiveVideoId(null);
      // Sync URL
      const query = new URLSearchParams(searchParams.toString());
      query.set("playlist", vid.id);
      query.delete("v");
      router.push(`${pathname}?${query.toString()}`, { scroll: false });
      return;
    }
    
    setActiveVideoId(vid.id);
    setIsLive(vid.type === "live");
    
    // Sync URL
    const query = new URLSearchParams(searchParams.toString());
    query.set("v", vid.id);
    router.push(`${pathname}?${query.toString()}`, { scroll: false });
    
    if (playerRef.current) {
      playerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleShare = async () => {
    if (!activeVideoId) return;
    
    // Direct YouTube link for sharing
    const shareUrl = `https://www.youtube.com/watch?v=${activeVideoId}`;
    const shareTitle = activeVideo?.title || "Spiritual Lecture";

    // Try native share first
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: `Check out this lecture: ${shareTitle}`,
          url: shareUrl,
        });
        notify("Shared successfully!");
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error("Share failed:", err);
          setIsShareModalOpen(true);
        }
      }
    } else {
      // Fallback to custom share modal for mobile or insecure contexts
      setIsShareModalOpen(true);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify("Link copied to clipboard!");
    } catch (err) {
      notify("Failed to copy link", "error");
    }
  };

  if (!activeChannel && activeTab !== "favorites") {
    return (
      <div className="min-h-screen bg-slate-50 py-10 sm:py-16 px-4">
        <div className="max-w-7xl mx-auto space-y-10 sm:space-y-16">
          <div className="text-center space-y-3 sm:space-y-5 mx-auto animate-in fade-in slide-in-from-top-4 duration-700">
            <h1 className="text-3xl sm:text-6xl font-outfit font-black text-devo-950 tracking-tight leading-tight">
              Spiritual <span className="text-transparent bg-clip-text bg-gradient-to-r from-devo-600 to-accent-gold">Library</span>
            </h1>
            <p className="text-xs sm:text-base text-devo-800 font-bold opacity-60 uppercase tracking-[0.2em]">Select a channel or search below</p>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mt-8 sm:mt-12 max-w-4xl mx-auto px-4">
              {/* Search Bar Container */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  setActiveSearchQuery(searchQuery);
                }}
                className="relative flex-1 group"
              >
                <div className="absolute inset-0 bg-devo-500/10 blur-2xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity" />
                <div className="relative flex items-center">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-devo-400" />
                  <input 
                    type="text"
                    placeholder="Search across wisdom library..."
                    className="w-full pl-14 pr-32 py-4 sm:py-5 bg-white border-2 border-slate-100 rounded-[2rem] font-bold text-sm sm:text-base shadow-xl focus:border-devo-500 outline-none transition-all placeholder:text-slate-300"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (!e.target.value.trim()) {
                        setActiveSearchQuery("");
                      }
                    }}
                  />
                  
                  {/* Action Button inside Input container */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {isSearchingGlobal ? (
                      <Loader2 className="w-5 h-5 animate-spin text-devo-500 mr-2" />
                    ) : searchQuery.trim() ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          setActiveSearchQuery("");
                        }}
                        className="p-1 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : null}
                    
                    <button
                      type="submit"
                      disabled={searchQuery.length < 3}
                      className="px-4 py-2 bg-devo-600 hover:bg-devo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-full text-xs font-black uppercase tracking-widest shadow-md transition-all active:scale-95 whitespace-nowrap"
                    >
                      Search
                    </button>
                  </div>
                </div>
              </form>

              {/* Action Group */}
              <div className="flex items-center gap-3">
                {/* Favorites Shortcut */}
                <button 
                  onClick={() => router.push(`${pathname}?tab=favorites`)}
                  className="flex-1 sm:flex-none h-[52px] sm:h-[60px] px-6 flex items-center justify-center gap-2.5 bg-white border-2 border-orange-50 hover:border-orange-100 rounded-[2rem] font-black text-[10px] uppercase tracking-widest text-orange-600 shadow-xl transition-all hover:scale-[1.02] hover:bg-orange-50/30 active:scale-95 whitespace-nowrap group"
                >
                  <Clock className="w-4 h-4 text-orange-500 group-hover:scale-125 transition-transform" />
                  <span>Watch Later</span>
                </button>

                {/* Teachers Filter */}
                <div className="relative flex-1 sm:flex-none" ref={filterRef}>
                  <button 
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className={`h-[52px] sm:h-[60px] w-full sm:w-auto px-6 flex items-center justify-center gap-3 bg-white border-2 rounded-[2rem] font-black text-[10px] uppercase tracking-widest shadow-xl transition-all hover:scale-[1.02] active:scale-95 ${
                      selectedChannelIds.length > 0 ? "border-devo-500 text-devo-600 bg-devo-50/50" : "border-slate-100 text-slate-400"
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>
                      {selectedChannelIds.length === 0 ? "All Channels" : `${selectedChannelIds.length} Teachers`}
                    </span>
                    <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${isFilterOpen ? "rotate-180" : ""}`} />
                  </button>

                 {isFilterOpen && (
                   <div className="absolute top-full mt-4 right-0 w-72 bg-white rounded-3xl shadow-2xl border border-slate-100 p-4 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
                      <div className="flex items-center justify-between mb-4 px-2">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Filter Teachers</span>
                        <div className="flex gap-3">
                          <button 
                            onClick={() => setSelectedChannelIds(channels.map(c => c.channel_id))}
                            className="text-[9px] font-black text-devo-600 hover:text-devo-950 uppercase"
                          >
                            All
                          </button>
                          <button 
                            onClick={() => setSelectedChannelIds([])}
                            className="text-[9px] font-black text-slate-400 hover:text-red-500 uppercase"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      
                      <div className="max-h-80 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
                        {sortedChannels.map((ch) => {
                          const isSelected = selectedChannelIds.includes(ch.channel_id);
                          return (
                            <button
                              key={ch.id}
                              onClick={() => {
                                setSelectedChannelIds(prev => 
                                  isSelected ? prev.filter(id => id !== ch.channel_id) : [...prev, ch.channel_id]
                                );
                              }}
                              className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all ${
                                isSelected ? "bg-devo-50 text-devo-900" : "hover:bg-slate-50 text-slate-600"
                              }`}
                            >
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected ? "bg-devo-500 border-devo-500" : "border-slate-200"
                              }`}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-slate-100 flex items-center justify-center">
                                {typeof ch.custom_logo === 'string' && ch.custom_logo ? (
                                  <Image src={ch.custom_logo} alt={ch.name} width={32} height={32} className="object-cover" unoptimized />
                                ) : typeof logoCache[ch.channel_id] === 'string' && logoCache[ch.channel_id] ? (
                                  <Image src={logoCache[ch.channel_id]} alt={ch.name} width={32} height={32} className="object-cover" unoptimized />
                                ) : (
                                  <Video className="w-4 h-4 text-slate-300" />
                                )}
                              </div>
                              <span className="text-[11px] font-bold truncate text-left flex-1">{ch.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {activeSearchQuery ? (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex flex-col sm:flex-row items-center justify-between border-b border-slate-200 pb-6 gap-4">
                  <div className="flex flex-col items-center sm:items-start gap-1">
                    <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">LECTURE SEARCH RESULTS</h2>
                    {selectedChannelIds.length > 0 && (
                      <p className="text-[10px] font-bold text-devo-600 uppercase tracking-widest">
                        Filtering by: {selectedChannelIds.length} Selected Teachers
                      </p>
                    )}
                  </div>
                  <button onClick={() => { setSearchQuery(""); setActiveSearchQuery(""); setSelectedChannelIds([]); setGlobalResults({ playlists: [], videos: [] }); }} className="px-6 py-2 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg">Back to Library</button>
                </div>

                {isSearchingGlobal && globalResults.playlists.length === 0 && globalResults.videos.length === 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10 py-10">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="space-y-4 animate-pulse">
                        <div className="w-full aspect-video rounded-[2rem] bg-slate-200" />
                        <div className="space-y-2">
                          <div className="h-4 bg-slate-200 rounded-full w-full" />
                          <div className="h-3 bg-slate-200 rounded-full w-2/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : globalResults.playlists.length === 0 && globalResults.videos.length === 0 && !isSearchingGlobal ? (
                  <div className="py-20 text-center">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <X className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No matching lectures found in our library</p>
                  </div>
                ) : (
                  <div className="space-y-16">
                    {/* Playlists Section */}
                    {globalResults.playlists.length > 0 && (
                      <div className="space-y-8">
                        <div className="flex items-center gap-4">
                          <Layers className="w-5 h-5 text-devo-500" />
                          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-devo-900">Found Playlists ({globalResults.playlists.length})</h3>
                          <div className="flex-1 h-px bg-gradient-to-r from-devo-100 to-transparent" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
                          {globalResults.playlists.map((item, i) => (
                            <SearchResultItem key={item.id + i} item={item} isPlaylist={true} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Videos Section */}
                    {globalResults.videos.length > 0 && (
                      <div className="space-y-8">
                        <div className="flex items-center gap-4">
                          <Play className="w-5 h-5 text-devo-500" />
                          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-devo-900">Lectures & Videos ({globalResults.videos.length})</h3>
                          <div className="flex-1 h-px bg-gradient-to-r from-devo-100 to-transparent" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
                          {globalResults.videos.map((item, i) => (
                            <SearchResultItem key={item.id + i} item={item} isPlaylist={false} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-y-8 gap-x-4 sm:gap-x-6">
              {loadingChannels ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="space-y-4 animate-pulse">
                    <div className="w-full h-[180px] sm:h-[240px] rounded-[2rem] sm:rounded-[3rem] bg-slate-200 border border-slate-100" />
                    <div className="space-y-2 px-4 flex flex-col items-center">
                      <div className="h-3 bg-slate-200 rounded-full w-2/3" />
                      <div className="h-2 bg-slate-100 rounded-full w-1/3" />
                    </div>
                  </div>
                ))
              ) : (
                <>
                  {sortedChannels
                    .filter(c => selectedChannelIds.length === 0 || selectedChannelIds.includes(c.channel_id))
                    .slice(0, visibleChannelsCount)
                    .map((channel, i) => (
                    <div 
                      key={channel.id}
                      onClick={() => router.push(`${pathname}?channel=${channel.channel_id}`)}
                      className="group flex flex-col items-center gap-4 animate-in zoom-in duration-700 cursor-pointer relative"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <div className="relative w-full aspect-[4/5] sm:aspect-[3/4] h-auto rounded-[2rem] sm:rounded-[3rem] overflow-hidden shadow-xl transition-all duration-500 group-hover:shadow-2xl group-hover:scale-[1.05] active:scale-95 border border-slate-100 bg-slate-100">
                        {/* Favorite Toggle Button */}
                        <button
                          onClick={(e) => toggleFavoriteChannel(e, channel.channel_id)}
                          className={`absolute top-4 right-4 z-20 p-2.5 rounded-full backdrop-blur-md border shadow-lg transition-all active:scale-90 ${
                            favoriteChannels.includes(channel.channel_id)
                              ? "bg-red-500 border-red-400 text-white scale-100"
                              : "bg-white/70 hover:bg-white border-white/20 text-slate-400 hover:text-red-500 opacity-100 sm:opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
                          }`}
                          title={favoriteChannels.includes(channel.channel_id) ? "Remove from favorites" : "Add to favorites"}
                        >
                          <Heart className={`w-4 h-4 ${favoriteChannels.includes(channel.channel_id) ? "fill-current" : ""}`} />
                        </button>

                        {(typeof channel.custom_logo === 'string' && channel.custom_logo) || (typeof logoCache[channel.channel_id] === 'string' && logoCache[channel.channel_id]) ? (
                          <Image 
                            src={(typeof channel.custom_logo === 'string' && channel.custom_logo) || logoCache[channel.channel_id]} 
                            alt={channel.name} 
                            fill 
                            className="object-cover group-hover:scale-110 transition-transform duration-700" 
                            unoptimized 
                            priority={i < 8}
                            loading={i < 8 ? "eager" : "lazy"}
                          />
                        ) : (
                          <div className="absolute inset-0 bg-slate-50 flex items-center justify-center">
                            <Video className="w-12 h-12 text-slate-200" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      </div>
                      <div className="text-center space-y-0.5 px-2">
                         <h2 className="text-[11px] sm:text-[14px] font-black text-devo-950 leading-tight group-hover:text-devo-600 transition-colors uppercase tracking-tight">{channel.name}</h2>
                         <p className="text-slate-400 font-bold text-[8px] sm:text-[10px] uppercase tracking-widest">{channel.handle}</p>
                      </div>
                    </div>
                  ))}

                  {sortedChannels.filter(c => selectedChannelIds.length === 0 || selectedChannelIds.includes(c.channel_id)).length > visibleChannelsCount && (
                    <div ref={observerRef} className="col-span-full flex items-center justify-center py-10 w-full">
                      <Loader2 className="w-8 h-8 animate-spin text-devo-500" />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 pt-6 lg:pt-0 pb-20 lg:pb-0">
      <aside className="hidden lg:flex w-14 xl:w-20 bg-white border-r border-slate-200 flex-col items-center py-4 xl:py-6 gap-4 xl:gap-6 sticky top-20 h-[calc(100vh-80px)] z-50 shrink-0">
        <button 
          onClick={() => router.push(pathname)}
          title="Back to Global Library"
          className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-black transition-all shadow-lg active:scale-95 mb-4 group"
        >
          <Grid className="w-5 h-5 group-hover:rotate-12 transition-transform" />
        </button>
        <div className="flex flex-col items-center gap-3 xl:gap-5 flex-grow overflow-y-auto w-full custom-scrollbar pb-6 px-1">
          {sortedChannels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => router.push(`${pathname}?channel=${channel.channel_id}`)}
              title={channel.name}
              className={`relative group p-1.5 rounded-2xl transition-all duration-300 ${
                activeChannel?.id === channel.id
                  ? "ring-2 ring-devo-500 ring-offset-4 bg-slate-100"
                  : "hover:bg-slate-50"
              }`}
            >
              {favoriteChannels.includes(channel.channel_id) && (
                <div className="absolute -top-0.5 -right-0.5 bg-red-500 border-2 border-white rounded-full p-0.5 shadow-md z-10 animate-in zoom-in duration-300">
                  <Heart className="w-2 h-2 text-white fill-current" />
                </div>
              )}
              <div className="w-10 h-10 xl:w-14 xl:h-14 rounded-lg xl:rounded-xl overflow-hidden shadow-md border-2 border-white bg-slate-200 flex items-center justify-center">
                {(typeof channel.custom_logo === 'string' && channel.custom_logo) || (typeof logoCache[channel.channel_id] === 'string' && logoCache[channel.channel_id]) ? (
                  <Image
                    src={(typeof channel.custom_logo === 'string' && channel.custom_logo) || logoCache[channel.channel_id]}
                    alt={channel.name}
                    width={56}
                    height={56}
                    className="object-cover group-hover:scale-110 transition-transform duration-500"
                    unoptimized
                  />
                ) : (
                  <Video className="w-5 h-5 xl:w-6 xl:h-6 text-slate-400" />
                )}
              </div>
              <span className="absolute left-full ml-4 px-3 py-1.5 bg-devo-950 text-white text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-xl">
                {channel.name}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className="lg:hidden relative z-[60] mt-0 bg-white border-b border-slate-200 px-4 py-4 shadow-sm">
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
          {sortedChannels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => router.push(`${pathname}?channel=${channel.channel_id}`)}
              className={`flex-shrink-0 flex flex-col items-center gap-1.5 transition-all duration-300 relative ${
                activeChannel?.id === channel.id ? "scale-105" : "opacity-80"
              }`}
            >
               <div className={`w-14 h-14 rounded-2xl overflow-hidden border-2 shadow-sm relative ${
                activeChannel?.id === channel.id ? "border-devo-500 ring-2 ring-devo-100" : "border-white"
              }`}>
                {favoriteChannels.includes(channel.channel_id) && (
                  <div className="absolute top-0.5 right-0.5 bg-red-500 border border-white rounded-full p-0.5 shadow-md z-10">
                    <Heart className="w-1.5 h-1.5 text-white fill-current" />
                  </div>
                )}
                {(typeof channel.custom_logo === 'string' && channel.custom_logo) || (typeof logoCache[channel.channel_id] === 'string' && logoCache[channel.channel_id]) ? (
                  <Image
                    src={(typeof channel.custom_logo === 'string' && channel.custom_logo) || logoCache[channel.channel_id]}
                    alt={channel.name}
                    width={56}
                    height={56}
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                    <Video className="w-5 h-5 text-slate-300" />
                  </div>
                )}
              </div>
              <span className="text-[9px] font-black uppercase tracking-tighter text-slate-600 truncate max-w-[60px]">
                {channel.name.split(' ')[0]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="h-44 sm:h-64 relative">
          <div
            className="absolute inset-0 opacity-90 transition-all duration-700"
            style={{ background: activeChannel?.banner_style || "linear-gradient(to right, #0F172A, #334155)" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
          <div className="absolute -bottom-16 sm:-bottom-20 left-1/2 sm:left-8 -translate-x-1/2 sm:translate-x-0 flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6 w-full sm:w-auto px-4 sm:px-0">
            <div className="relative w-28 h-28 sm:w-44 sm:h-44 rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden border-4 sm:border-8 border-white shadow-2xl bg-slate-100 flex items-center justify-center shrink-0">
              {typeof activeLogo === 'string' && activeLogo ? (
                <Image
                  src={activeLogo}
                  alt={activeChannel?.name || "My Favorites"}
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="bg-red-50 w-full h-full flex items-center justify-center">
                   <Heart className="w-12 h-12 text-red-500 fill-red-500" />
                </div>
              )}
            </div>
            <div className="pb-3 space-y-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-3">
                <h1 className="text-xl sm:text-4xl font-outfit font-black text-devo-950 tracking-tight drop-shadow-sm">
                  {activeChannel?.name || "My Spiritual Library"}
                </h1>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 sm:w-6 sm:h-6 text-blue-500" />
                  {activeChannel && (
                    <button
                      onClick={(e) => toggleFavoriteChannel(e, activeChannel.channel_id)}
                      className={`p-1.5 sm:p-2 rounded-full border shadow-md backdrop-blur-md transition-all hover:scale-110 active:scale-95 ${
                        favoriteChannels.includes(activeChannel.channel_id)
                          ? "bg-red-500 border-red-400 text-white"
                          : "bg-white/80 border-slate-200 text-slate-400 hover:text-red-500"
                      }`}
                      title={favoriteChannels.includes(activeChannel.channel_id) ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Heart className={`w-3 h-3 sm:w-4 sm:h-4 ${favoriteChannels.includes(activeChannel.channel_id) ? "fill-current" : ""}`} />
                    </button>
                  )}
                </div>
              </div>
              <span className="inline-block text-white bg-black/25 backdrop-blur-md px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] border border-white/20">
                {activeChannel?.handle || "FAVORITES COLLECTION"}
              </span>
            </div>
          </div>
        </div>

        <div className="pt-24 px-4 sm:px-10 pb-20 flex flex-col gap-8 max-w-7xl mx-auto w-full">
          
          {/* Top Cinematic Player Area */}
          <div className="flex flex-col gap-6 w-full">
            <div ref={playerRef} className="scroll-mt-24 aspect-video bg-black rounded-[2rem] overflow-hidden shadow-2xl relative w-full">
              {activeVideoId ? (
                <OptimizedVideoPlayer 
                  ref={playerInstanceRef}
                  key={`${activeChannel?.id || "global-player"}-${activeVideoId}`}
                  videoId={activeVideoId}
                  title={activeVideo?.title || "Video"}
                  artist={activeChannel?.name || "Watch Later"}
                  thumbnail={activeVideo?.thumbnail}
                  initialTime={activeVideo?.lastPosition || 0}
                  onStateChange={(state: number) => {
                    // 0 is YT.PlayerState.ENDED
                    if (state === 0 && autoplay) {
                      console.log("[Autoplay] Video ended. Searching for next...", { activeVideoId, activeTab, hasPlaylist: !!activePlaylistId });
                      
                      // Try to find in the current filtered list (what the user sees)
                      let currentIndex = filteredVideos.findIndex((v: VideoItem) => v.id === activeVideoId);
                      let listToUse = filteredVideos;
                      
                      // Fallback to the full videos list if not found in filtered (e.g. search query changed)
                      if (currentIndex === -1) {
                        currentIndex = videos.findIndex((v: VideoItem) => v.id === activeVideoId);
                        listToUse = videos;
                      }
                      
                      // Final fallback to favorites if in favorites tab
                      if (currentIndex === -1 && activeTab === "favorites") {
                        currentIndex = favoriteVideos.findIndex((v: VideoItem) => v.id === activeVideoId);
                        listToUse = favoriteVideos;
                      }

                      if (currentIndex !== -1 && currentIndex < listToUse.length - 1) {
                        const nextVideo = listToUse[currentIndex + 1];
                        console.log("[Autoplay] Found next video:", nextVideo.title);
                        // Small delay for UX transition
                        setTimeout(() => {
                          handleVideoSelect(nextVideo);
                          notify(`Autoplay: Playing next lecture`, 'success');
                        }, 1000);
                      } else {
                        console.log("[Autoplay] No next video found or at end of list.", { currentIndex, total: listToUse.length });
                      }
                    }
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900 px-6 text-center">
                   <p className="text-white/50 font-bold text-sm uppercase tracking-widest leading-loose">
                    {activeTab === "live" ? "No live streams currently" : "Select a video from the list to start watching"}
                  </p>
                </div>
              )}
            </div>

            {activeVideo && (
              <div className="bg-white p-6 sm:p-10 rounded-[2.5rem] border border-slate-100 shadow-sm w-full">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                  <div className="space-y-3 flex-1">
                    <h2 className="text-xl sm:text-2xl font-outfit font-black text-devo-950 tracking-tight leading-tight">
                      {activeVideo.title}
                    </h2>
                    <div className="flex items-center gap-4 text-slate-400 text-xs font-bold uppercase tracking-widest flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {activeVideo.date}
                      </span>
                      <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black ${isLive ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
                        <Radio className={`w-3.5 h-3.5 ${isLive ? "animate-pulse" : ""}`} />
                        {isLive ? "LIVE" : (activeTab === "favorites" ? "WATCH LATER" : activeTab.toUpperCase())}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 w-full sm:w-auto justify-end">
                    <button 
                      onClick={() => openExternal(`https://www.youtube.com/watch?v=${activeVideoId}`)}
                      className="flex items-center gap-2 px-4 py-2 bg-[#FF0000] text-white rounded-xl hover:bg-[#cc0000] transition-all shadow-md active:scale-95"
                      title="Watch on YouTube"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                      </svg>
                      <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Watch on YouTube</span>
                    </button>
                    <button 
                      onClick={(e) => activeVideoId && toggleFavorite(e, activeVideoId)}
                      className={`p-3 rounded-xl transition-all group border ${activeVideoId && favorites.includes(activeVideoId) ? "bg-orange-50 border-orange-100 text-orange-600" : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100"}`}
                      title={activeVideoId && favorites.includes(activeVideoId) ? "Remove from Watch Later" : "Add to Watch Later"}
                    >
                      <Clock className={`w-5 h-5 ${activeVideoId && favorites.includes(activeVideoId) ? "text-orange-600" : "group-hover:text-orange-500"}`} />
                    </button>
                    <button 
                      onClick={handleShare}
                      className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all active:scale-95 border border-slate-100"
                      title="Share this lecture"
                    >
                      <Share2 className="w-5 h-5 text-slate-400" />
                    </button>
                  </div>
                </div>
                <p className="text-slate-400 text-sm font-medium leading-relaxed border-t border-slate-50 pt-4">
                  Distraction-free devotional viewing. All content is curated from
                  approved spiritual channels. Your watch later list appears here automatically for quick access.
                </p>
              </div>
            )}
          </div>

          {/* Middle Toolbar Section (Tabs, Search, and Toggle) */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-[2.2rem] border border-slate-100 shadow-sm w-full">
            {/* Tabs */}
            <div className="w-full lg:w-auto min-w-[280px]">
              {!activePlaylistId ? (
                <div className="flex bg-slate-50 rounded-2xl overflow-hidden font-black uppercase tracking-widest text-[9px] sm:text-[10px] border border-slate-100">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id);
                          setActivePlaylistId(null);
                        }}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 transition-all ${
                          activeTab === tab.id ? "bg-devo-950 text-white" : "text-slate-400 hover:bg-slate-100"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 sm:w-4 h-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-between bg-devo-950 py-2.5 px-4 rounded-2xl shadow-md">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="p-1.5 bg-white/10 rounded-lg">
                      <Layers className="w-3.5 h-3.5 text-white" />
                    </div>
                    <h3 className="text-white font-outfit font-black text-xs truncate uppercase tracking-widest">
                      {activePlaylistName}
                    </h3>
                  </div>
                  <button
                    onClick={() => {
                      setActivePlaylistId(null);
                      setActivePlaylistName(null);
                      const query = new URLSearchParams(searchParams.toString());
                      query.delete("playlist");
                      query.delete("v");
                      router.push(`${pathname}?${query.toString()}`, { scroll: false });
                    }}
                    className="flex items-center gap-1.5 ml-4 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shrink-0"
                  >
                    <X className="w-3 h-3" /> Back
                  </button>
                </div>
              )}
            </div>
            
            {/* Search Input */}
            <div className="relative flex-grow max-w-md w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search lectures in this channel..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:border-devo-500 font-bold text-[11px] sm:text-xs outline-none transition-all focus:bg-white focus:shadow-sm"
              />
            </div>
            
            {/* Autoplay & Count Controls */}
            <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <Play className="w-3 h-3" />
                {loading ? "Loading…" : `${activePlaylistId ? "Playlist" : activeTab.toUpperCase()}: ${filteredVideos.length} Items`}
              </p>
              
              <button 
                onClick={toggleAutoplay}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all ${autoplay ? "bg-devo-50 text-devo-600 border border-devo-100" : "bg-slate-50 text-slate-400 border border-slate-100"}`}
                title={autoplay ? "Autoplay is ON" : "Autoplay is OFF"}
              >
                <span className="text-[9px] font-black uppercase tracking-widest">Autoplay</span>
                <div className={`w-7 h-4 rounded-full relative transition-colors ${autoplay ? "bg-devo-500" : "bg-slate-300"}`}>
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all ${autoplay ? "left-3.5" : "left-0.5"}`} />
                </div>
              </button>
            </div>
          </div>
          
          {/* Bottom Grid Content Section */}
          <div className="w-full">
            {loading || (isSearchingGlobal && filteredVideos.length === 0) ? (
              /* Skeleton Loader Grid */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm animate-pulse space-y-4">
                    <div className="aspect-video rounded-2xl bg-slate-200 w-full" />
                    <div className="space-y-2 py-1">
                      <div className="h-3.5 bg-slate-200 rounded-full w-full" />
                      <div className="h-3.5 bg-slate-200 rounded-full w-2/3" />
                      <div className="h-2.5 bg-slate-100 rounded-full w-1/2 mt-4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-red-100 px-4">
                <AlertCircle className="w-10 h-10 text-red-300 mx-auto mb-3" />
                <p className="text-red-400 font-bold text-xs uppercase tracking-widest">Failed to load</p>
                <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mt-2 max-w-xs mx-auto leading-normal">{error}</p>
              </div>
            ) : (
              <div className="space-y-8 w-full">
                {/* Real-time Video Grid */}
                {filteredVideos.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {filteredVideos.map((vid: VideoItem, i: number) => {
                      const isFav = favorites.includes(vid.id);
                      return (
                        <div
                          key={`${vid.id}-${vid.type}-${i}`}
                          onClick={() => handleVideoSelect(vid)}
                          className={`group flex flex-col bg-white rounded-[2rem] overflow-hidden border-2 transition-all duration-300 cursor-pointer shadow-sm text-left hover:-translate-y-1 hover:shadow-xl ${
                            activeVideoId === vid.id
                              ? "border-devo-500 ring-2 ring-devo-100"
                              : "border-slate-100 hover:border-slate-300"
                          }`}
                        >
                          {/* Card Thumbnail Area */}
                          <div className="relative aspect-video w-full overflow-hidden bg-slate-50 shrink-0">
                            {typeof vid.thumbnail === 'string' && vid.thumbnail ? (
                              <Image 
                                src={vid.thumbnail} 
                                alt={vid.title} 
                                fill 
                                className="object-cover group-hover:scale-105 transition-transform duration-500" 
                                unoptimized 
                                loading="lazy" 
                              />
                            ) : (
                              <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
                                <Video className="w-8 h-8 text-slate-300" />
                              </div>
                            )}
                            
                            {/* Play Overlay Icon on Hover */}
                            <div className="absolute inset-0 bg-black/15 group-hover:bg-black/25 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center z-10">
                              <div className="bg-devo-500/90 text-white rounded-full p-3 shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                                <Play className="w-5 h-5 fill-current ml-0.5" />
                              </div>
                            </div>

                            {/* Watch Later Progress Bar */}
                            {vid.lastPosition !== undefined && vid.lastPosition > 0 && vid.duration && (
                              <div className="absolute bottom-0 left-0 right-0 h-1 sm:h-1.5 bg-black/40 z-10">
                                <div 
                                  className="h-full bg-devo-500 rounded-r-full" 
                                  style={{ width: `${Math.min(100, (vid.lastPosition / vid.duration) * 100)}%` }}
                                />
                              </div>
                            )}

                            {/* Badges / Indicators */}
                            <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5">
                              {vid.type === "live" && (
                                <span className="bg-red-600 text-white px-2 py-0.5 rounded-md text-[8px] font-black tracking-widest flex items-center gap-1 shadow-sm">
                                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                                  LIVE
                                </span>
                              )}
                              {vid.type === "playlist" && (
                                <span className="bg-devo-950 text-white px-2 py-0.5 rounded-md text-[8px] font-black tracking-widest flex items-center gap-1 shadow-sm">
                                  <Layers className="w-2.5 h-2.5" />
                                  PLAYLIST
                                </span>
                              )}
                            </div>

                            {/* Watch Later Quick Bookmark Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(e, vid.id);
                              }}
                              className={`absolute top-3 right-3 z-20 p-2 rounded-xl border backdrop-blur-md transition-all shadow-sm active:scale-95 ${
                                isFav 
                                  ? "bg-orange-500 border-orange-400 text-white hover:bg-orange-600" 
                                  : "bg-white/80 border-slate-200 text-slate-400 hover:text-orange-500 hover:bg-white"
                              }`}
                              title={isFav ? "Remove from Watch Later" : "Add to Watch Later"}
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Card Text Content Area */}
                          <div className="p-5 flex-grow flex flex-col justify-between">
                            <div className="space-y-2">
                              <h3 className="font-outfit font-black text-[13px] sm:text-[14px] leading-tight text-slate-800 line-clamp-2 group-hover:text-devo-700 transition-colors">
                                {vid.title}
                              </h3>
                              {vid.playlistCount !== undefined && vid.playlistCount > 0 && (
                                <p className="text-[10px] font-bold text-devo-600 uppercase tracking-widest">
                                  {vid.playlistCount} lectures included
                                </p>
                              )}
                            </div>
                            
                            <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                              <span className="truncate max-w-[120px]">{vid.channelTitle || activeChannel?.name}</span>
                              <span className="shrink-0">{vid.date}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Empty State */
                  <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-100">
                    <Video className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">
                      {activeTab === "favorites" ? "Your watch later library is currently empty" : "No uploads discovered in this category"}
                    </p>
                    <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mt-2 max-w-xs mx-auto leading-normal">
                      {activeTab === "favorites" ? "Save videos using the watch later button on thumbnails or inside the player." : "Check back later or explore another tab!"}
                    </p>
                  </div>
                )}

                {/* Global Results Section */}
                {searchQuery && (
                  <div className="space-y-4 pt-6 border-t border-slate-100">
                    {(globalResults.videos.length > 0 || globalResults.playlists.length > 0 || isSearchingGlobal) && (
                      <>
                        <div className="flex items-center justify-between px-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-devo-600">
                            {activeChannel ? "Also Discovered in Other Channels" : "Wider Devotional Library Matches"}
                          </p>
                          {isSearchingGlobal && <Loader2 className="w-3.5 h-3.5 animate-spin text-devo-400" />}
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                          {[...globalResults.videos, ...globalResults.playlists]
                            .filter(gr => gr.channelId !== activeChannel?.channel_id && gr.channel_id !== activeChannel?.channel_id)
                            .slice(0, 8)
                            .map((item: any, i) => (
                              <div
                                key={item.id + i}
                                onClick={() => {
                                  const query = new URLSearchParams();
                                  query.set("channel", item.channelId || item.channel_id);
                                  if (item.type === "playlist") query.set("playlist", item.id);
                                  else query.set("v", item.id);
                                  setSearchQuery("");
                                  router.push(`${pathname}?${query.toString()}`);
                                }}
                                className="group flex flex-col bg-white rounded-[2rem] overflow-hidden border border-slate-100 hover:border-slate-300 transition-all duration-300 cursor-pointer shadow-sm text-left hover:-translate-y-1 hover:shadow-xl"
                              >
                                <div className="relative aspect-video w-full overflow-hidden bg-slate-50">
                                  {typeof item.thumbnail === 'string' && item.thumbnail ? (
                                    <Image src={item.thumbnail} alt={item.title} fill className="object-cover group-hover:scale-105 transition-transform duration-500" unoptimized />
                                  ) : (
                                    <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
                                      <Video className="w-8 h-8 text-slate-300" />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-black/15 group-hover:bg-black/25 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center z-10">
                                    <div className="bg-devo-500/90 text-white rounded-full p-3 shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                                      <Play className="w-5 h-5 fill-current ml-0.5" />
                                    </div>
                                  </div>
                                </div>
                                <div className="p-5 flex-grow flex flex-col justify-between">
                                  <h3 className="font-outfit font-black text-[13px] sm:text-[14px] leading-tight text-slate-800 line-clamp-2 group-hover:text-devo-700 transition-colors">
                                    {item.title}
                                  </h3>
                                  <p className="mt-4 pt-3 border-t border-slate-50 text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">
                                    {item.channelTitle}
                                  </p>
                                </div>
                              </div>
                            ))}
                        </div>
                      </>
                    )}
                    
                    {!isSearchingGlobal && (globalResults.videos.length === 0 && globalResults.playlists.length === 0) && searchQuery.length >= 2 && filteredVideos.length === 0 && !activeChannel && (
                      <div className="text-center py-16 bg-white/30 rounded-3xl border-2 border-dashed border-slate-100">
                        <Search className="w-10 h-10 text-slate-200 mx-auto mb-2 opacity-50" />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4">
                          No matches discovered in the wider library
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Load More Button */}
                {nextPageToken && activeChannel && (
                  <div className="flex justify-center pt-4">
                    <button
                      onClick={() => fetchContent(activeChannel, activeTab, true)}
                      disabled={loadMoreLoading}
                      className="px-8 py-4 bg-white/70 hover:bg-white text-devo-600 rounded-[2rem] border-2 border-dashed border-devo-200 hover:border-devo-400 font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50 shadow-sm hover:shadow-md min-w-[200px]"
                    >
                      {loadMoreLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Load More Archives"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Premium Notification Toast */}
      {notification && (
        <div className="fixed bottom-24 sm:bottom-10 left-1/2 -translate-x-1/2 z-[2000] animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-3 min-w-[280px] ${
            notification.type === 'success' 
            ? "bg-slate-900/90 text-white border-white/20" 
            : "bg-red-600/90 text-white border-red-400"
          }`}>
            {notification.type === 'success' ? (
              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-xs font-black uppercase tracking-[0.2em]">{notification.type === 'success' ? 'Success' : 'Attention'}</span>
              <span className="text-[11px] font-bold text-white/80">{notification.message}</span>
            </div>
            <button onClick={() => setNotification(null)} className="ml-auto p-1 hover:bg-white/10 rounded-lg transition-colors">
              <X className="w-4 h-4 text-white/40" />
            </button>
          </div>
        </div>
      )}
      {/* Custom Share Fallback Modal */}
      <ShareModal 
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title={activeVideo?.title || "Spiritual Lecture"}
        url={activeVideoId ? `https://www.youtube.com/watch?v=${activeVideoId}` : ""}
      />
    </div>
  );
}

// Sub-component for Search Results
function SearchResultItem({ item, isPlaylist }: { item: any, isPlaylist: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isLiveItem = item.type === "live";

  return (
    <button 
        onClick={() => {
          const query = new URLSearchParams();
          query.set("channel", item.channelId || item.channel_id);
          if (isPlaylist) {
            query.set("playlist", item.id);
          } else {
            query.set("v", item.id);
          }
          router.push(`${pathname}?${query.toString()}`);
        }}
        className="group flex flex-col text-left"
    >
        <div className="relative w-full pb-[56.25%] rounded-3xl overflow-hidden shadow-sm group-hover:shadow-xl group-hover:scale-[1.02] transition-all duration-500 border border-slate-100 bg-slate-200">
              {typeof item.thumbnail === 'string' && item.thumbnail ? (
                <Image 
                  src={item.thumbnail} 
                  alt={item.title} 
                  fill 
                  className="object-cover object-center group-hover:scale-110 transition-all duration-700 opacity-0 data-[loaded=true]:opacity-100" 
                  onLoadingComplete={(img) => img.setAttribute('data-loaded', 'true')}
                  unoptimized 
                />
              ) : (
                <div className="absolute inset-0 bg-slate-200 flex items-center justify-center">
                  <Video className="w-12 h-12 text-slate-300" />
                </div>
              )}
              
              {/* Overlay Icons */}
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                {isPlaylist ? (
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Layers className="w-6 h-6 text-white" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="w-6 h-6 text-white ml-1" />
                  </div>
                )}
              </div>

              {/* Badges */}
              <div className="absolute bottom-3 right-3 flex gap-2">
                {isLiveItem && (
                  <div className="px-2 py-1 bg-red-600 rounded-lg flex items-center gap-1.5 shadow-lg border border-red-500">
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                      <span className="text-[8px] font-black text-white uppercase tracking-widest">LIVE</span>
                  </div>
                )}
                <div className="px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[8px] font-black text-white uppercase tracking-widest border border-white/20 shadow-lg">
                  {isPlaylist ? `${item.playlistCount || 0} VIDEOS` : "LECTURE"}
              </div>
          </div>
        </div>

        <div className="pt-4 px-1 space-y-2.5">
          <h3 className="font-outfit font-black text-xs sm:text-[13px] text-devo-950 line-clamp-2 leading-snug group-hover:text-devo-600 transition-colors">
            {item.title}
          </h3>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
              {isPlaylist ? <Layers className="w-3 h-3 text-slate-400" /> : <Video className="w-3 h-3 text-slate-400" />}
            </div>
            <p className="text-[9px] font-bold text-slate-400 truncate uppercase tracking-widest">{item.channelTitle || "Devotional Library"}</p>
          </div>
        </div>
    </button>
  );
}
