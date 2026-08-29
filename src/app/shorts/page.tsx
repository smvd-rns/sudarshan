"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowLeft, ChevronDown, ChevronUp, Share2, Volume2, VolumeX, Home, Play } from "lucide-react";
import { supabase } from "@/lib/supabase";
import ShareModal from "@/components/ShareModal";
import { Suspense } from "react";

interface ShortVideo {
  id: string;
  title: string;
  thumbnail: string;
  published: string;
  channel_title: string;
  channel_id: string;
}

function ShortsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const channelFilter = searchParams.get("channel") || "";

  const [session, setSession] = useState<any>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  const [shorts, setShorts] = useState<ShortVideo[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeShareVideo, setActiveShareVideo] = useState<ShortVideo | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [channels, setChannels] = useState<any[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);
  activeIndexRef.current = activeIndex;
  const shortsLengthRef = useRef(0);
  shortsLengthRef.current = shorts.length;
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthInitialized(true);
    });

    return () => {
      subscription.unsubscribe();
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // scrollToIndex defined early and stored in ref so listeners can call it safely
  const scrollToIndex = useCallback((index: number) => {
    const slide = containerRef.current?.querySelector(`[data-index="${index}"]`);
    if (slide) slide.scrollIntoView({ behavior: "smooth" });
  }, []);
  const scrollToIndexRef = useRef(scrollToIndex);
  scrollToIndexRef.current = scrollToIndex;

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const sendCommand = useCallback((videoId: string, func: string) => {
    const iframe = document.getElementById(`yt-player-${videoId}`) as HTMLIFrameElement;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: "command", func, args: [] }),
        "https://www.youtube-nocookie.com"
      );
    }
  }, []);

  const fetchShorts = useCallback(async (append = false) => {
    if (!authInitialized || !session) {
      if (authInitialized && !session) setLoading(false);
      return;
    }

    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${session.access_token}`
      };

      const url = channelFilter
        ? `/api/youtube/shorts?limit=12&channelId=${channelFilter}`
        : "/api/youtube/shorts?limit=12";

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      setShorts(prev => {
        const newItems = data.items || [];
        const existingIds = new Set(prev.map((item: ShortVideo) => item.id));
        const filtered = newItems.filter((item: ShortVideo) => !existingIds.has(item.id));
        return append ? [...prev, ...filtered] : newItems;
      });
    } catch (err) {
      console.error("Error fetching shorts:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [authInitialized, session, channelFilter]);

  useEffect(() => { 
    if (authInitialized && session) {
      fetchShorts(); 
    }
  }, [authInitialized, session, fetchShorts]);

  useEffect(() => {
    if (!authInitialized || !session) return;
    const fetchChannels = async () => {
      try {
        const headers: Record<string, string> = {
          "Authorization": `Bearer ${session.access_token}`
        };
        const res = await fetch("/api/youtube/channels?v=2", { headers });
        if (res.ok) {
          const data = await res.json();
          const filtered = (data.channels || []).filter((c: any) => c.channel_id !== "UCZ8S3qwowiFztAQBRTawWfA");
          setChannels(filtered);
        }
      } catch (err) {
        console.error("Error fetching channels:", err);
      }
    };
    fetchChannels();
  }, [authInitialized, session]);

  // When activeIndex changes: setup active video
  useEffect(() => {
    if (shorts.length === 0) return;
    setIsPlaying(true);

    const activeVideo = shorts[activeIndex];
    
    // Send the listening event to the new iframe once it's likely mounted
    const timer = setTimeout(() => {
      if (activeVideo) {
        const iframe = document.getElementById(`yt-player-${activeVideo.id}`) as HTMLIFrameElement;
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage(JSON.stringify({ event: "listening" }), "*");
        }
      }
    }, 1000);

    // Fetch more when near end
    if (activeIndex >= shorts.length - 3 && !loadingMore) {
      fetchShorts(true);
    }

    return () => clearTimeout(timer);
  }, [activeIndex, shorts, loadingMore, fetchShorts]);

  // Scroll listener to detect active slide (Bulletproof on mobile unlike IntersectionObserver)
  const handleScroll = useCallback(() => {
    setIsScrolling(true);
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);

    if (!containerRef.current) return;
    const { scrollTop, clientHeight } = containerRef.current;
    if (clientHeight === 0) return;
    
    // Calculate which slide is most visible
    const newIndex = Math.round(scrollTop / clientHeight);
    
    if (newIndex !== activeIndexRef.current && newIndex >= 0 && newIndex < shortsLengthRef.current) {
      setActiveIndex(newIndex);
    }
  }, []);

  // Handle YouTube iframe messages
  useEffect(() => {
    const handleMsg = (event: MessageEvent) => {
      if (!event.origin.includes("youtube")) return;
      try {
        const data = JSON.parse(event.data);

        // Auto-advance on video end
        if ((data.event === "onStateChange" && data.info === 0) || (data.event === "infoDelivery" && data.info?.playerState === 0)) {
          const cur = activeIndexRef.current;
          const total = shortsLengthRef.current;
          if (cur < total - 1) {
            scrollToIndexRef.current(cur + 1);
          }
        }
      } catch { /* not JSON */ }
    };
    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, [shorts]);

  const togglePlay = () => {
    const video = shorts[activeIndex];
    if (!video) return;

    if (isPlaying) {
      sendCommand(video.id, "pauseVideo");
      setIsPlaying(false);
    } else {
      sendCommand(video.id, "playVideo");
      setIsPlaying(true);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); scrollToIndex(Math.min(activeIndex + 1, shorts.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); scrollToIndex(Math.max(activeIndex - 1, 0)); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, shorts.length, scrollToIndex]);

  if (authInitialized && !session) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <p className="font-outfit text-sm font-medium tracking-wide text-slate-400">Please log in to view shorts.</p>
          <button onClick={() => router.push("/login")} className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (loading && shorts.length === 0) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
          <span className="font-outfit text-sm font-medium tracking-wide text-slate-400">Loading Shorts...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen bg-slate-950 text-white overflow-hidden select-none">

      {/* ─── HEADER ────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={() => router.push("/")} className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 active:scale-95 transition-all text-white border border-white/10">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center">
          <span className="font-outfit text-[10px] font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">Short Videos</span>
          <select
            value={channelFilter}
            onChange={(e) => { setShorts([]); setActiveIndex(0); const val = e.target.value; router.push(val ? `/shorts?channel=${val}` : "/shorts"); }}
            className="mt-1 bg-black/40 text-[9px] font-black uppercase tracking-widest text-white border border-white/10 rounded-full px-3 py-1 backdrop-blur-md focus:outline-none cursor-pointer hover:bg-black/60 transition-all max-w-[140px] truncate"
          >
            <option value="" className="bg-slate-900 text-white font-black">All Channels</option>
            {channels.map((chan) => (
              <option key={chan.channel_id} value={chan.channel_id} className="bg-slate-900 text-white font-semibold">{chan.name}</option>
            ))}
          </select>
        </div>
        <button onClick={() => router.push("/")} className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 active:scale-95 transition-all text-white border border-white/10">
          <Home className="w-5 h-5" />
        </button>
      </div>

      {/* ─── VERTICAL SLIDER ────────────────── */}
      <div 
        ref={containerRef} 
        onScroll={handleScroll}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory" 
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {shorts.map((video, idx) => {
          const isActive = idx === activeIndex;
          // Only render iframe for the ACTIVE slide. 
          // Destroying inactive iframes guarantees they stop playing and saves massive amounts of RAM/CPU.
          const shouldRenderIframe = isActive;
          
          // Use autoplay=1 AND mute=0 so that the video starts with audio enabled by default.
          const embedUrl = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&mute=0&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&cc_load_policy=0&origin=${encodeURIComponent(origin)}`;

          return (
            <div
              key={video.id}
              data-slide
              data-index={idx}
              className="relative w-full h-full snap-start snap-always flex items-center justify-center bg-black overflow-hidden"
            >
              <div className="relative w-full h-full max-h-screen md:max-h-[85vh] aspect-[9/16] md:rounded-3xl overflow-hidden shadow-2xl bg-black border border-white/5">
                
                {shouldRenderIframe ? (
                  <iframe
                    key={video.id} 
                    id={`yt-player-${video.id}`}
                    src={embedUrl}
                    title={video.title}
                    className={`w-full h-full border-none object-cover scale-[1.01] ${isScrolling ? "pointer-events-none" : ""}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  // Far slides: just show thumbnail
                  <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${video.thumbnail})` }} />
                )}

                {/* Tap to play/pause — only on active */}
                {/* Covers only the middle zone (top-16 to bottom-28) to leave top (CC/settings) and bottom (timeline/actions) clickable */}
                {isActive && (
                  <div onClick={togglePlay} className="absolute top-16 left-0 right-0 bottom-28 cursor-pointer z-10 flex items-center justify-center bg-transparent">
                    {!isPlaying && (
                      <div className="p-5 rounded-full bg-black/60 text-white border border-white/10 animate-pulse shadow-xl">
                        <Play className="w-8 h-8 fill-white" />
                      </div>
                    )}
                  </div>
                )}

                {/* Gradient overlay */}
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/90 via-transparent to-black/40" />

                {/* Title + channel */}
                <div className="absolute bottom-16 left-6 right-16 z-20 pointer-events-none">
                  <span className="inline-block px-3 py-1 mb-3 text-[10px] font-black uppercase tracking-wider rounded-full bg-orange-600/90 text-white backdrop-blur-sm">
                    {channels.find(c => c.channel_id === video.channel_id)?.name || video.channel_title || "Short"}
                  </span>
                  <h3 className="font-outfit text-sm font-bold leading-snug text-white line-clamp-2 pr-4 drop-shadow-md">
                    {video.title}
                  </h3>
                </div>
              </div>

              {/* Sidebar actions — only for active */}
              {isActive && (
                <div className="absolute right-4 bottom-24 z-30 flex flex-col items-center gap-6">
                  <button onClick={() => setActiveShareVideo(video)} className="flex flex-col items-center gap-1 group active:scale-90 transition-all">
                    <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-white/20 text-white transition-all shadow-lg">
                      <Share2 className="w-5 h-5 group-hover:text-orange-400 transition-colors" />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 drop-shadow-md">Share</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Navigation arrows */}
      {activeIndex > 0 && (
        <button onClick={() => scrollToIndex(activeIndex - 1)} className="absolute top-20 right-4 z-40 w-10 h-10 rounded-full bg-white/10 border border-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 active:scale-90 transition-all text-white/70 hover:text-white">
          <ChevronUp className="w-5 h-5" />
        </button>
      )}
      {activeIndex < shorts.length - 1 && (
        <button onClick={() => scrollToIndex(activeIndex + 1)} className="absolute bottom-6 right-4 z-40 w-10 h-10 rounded-full bg-white/10 border border-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 active:scale-90 transition-all text-white/70 hover:text-white">
          <ChevronDown className="w-5 h-5" />
        </button>
      )}

      {activeShareVideo && (
        <ShareModal
          isOpen={true}
          url={`https://www.youtube.com/watch?v=${activeShareVideo.id}`}
          title={activeShareVideo.title}
          onClose={() => setActiveShareVideo(null)}
        />
      )}
    </div>
  );
}

export default function ShortsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-white">
        <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
      </div>
    }>
      <ShortsContent />
    </Suspense>
  );
}
