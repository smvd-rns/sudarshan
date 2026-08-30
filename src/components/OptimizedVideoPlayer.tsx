"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { openExternal } from "@/lib/device";

// Add TypeScript support for the YouTube IFrame API
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface VideoPlayerHandle {
  getCurrentTime: () => number;
  getDuration: () => number;
}

interface OptimizedVideoPlayerProps {
  videoId: string;
  title: string;
  artist?: string;
  album?: string;
  thumbnail?: string;
  initialTime?: number;
  onStateChange?: (state: number) => void;
  className?: string;
}

const OptimizedVideoPlayer = forwardRef<VideoPlayerHandle, OptimizedVideoPlayerProps>(({
  videoId,
  title,
  artist = "Devotional Library",
  album = "Spiritual Echoes",
  thumbnail,
  initialTime = 0,
  onStateChange,
  className = ""
}, ref) => {
  const PLAYER_STATE_PLAYING = 1;
  const PLAYER_STATE_PAUSED = 2;
  const [playerReady, setPlayerReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerInstance = useRef<any>(null);
  const [currentState, setCurrentState] = useState<number | null>(null);
  const playerContainerId = useRef(`player-${Math.random().toString(36).substr(2, 9)}`);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    getCurrentTime: () => {
      if (playerInstance.current?.getCurrentTime) {
        return playerInstance.current.getCurrentTime();
      }
      return 0;
    },
    getDuration: () => {
      if (playerInstance.current?.getDuration) {
        return playerInstance.current.getDuration();
      }
      return 0;
    }
  }));

  // On local/http, including the origin parameter can sometimes trigger "Invalid Response" 
  // from YouTube due to strict security policies. We only include it for HTTPS.
  // We use youtube-nocookie.com for better compatibility with filtered networks (e.g. at the Temple).
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const origin = isHttps ? window.location.origin : undefined;
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1${origin ? `&origin=${encodeURIComponent(origin)}` : ''}`;

  // 1. Load YouTube IFrame API Script (Globally once)
  useEffect(() => {
    const checkYT = () => {
      if (window.YT && window.YT.Player) {
        setPlayerReady(true);
        setTimedOut(false);
        return true;
      }
      return false;
    };

    if (checkYT()) return;

    // AUTO-FALLBACK: Fall back to plain iframe quickly if API is slow/blocked
    // Reduced to 1.5s to provide snap-quick experience on restricted networks.
    const fallbackTimer = setTimeout(() => {
      if (!window.YT || !window.YT.Player) {
        console.warn("[YT-PLAYER] Using Standard Fallback (API slow/blocked)");
        setTimedOut(true);
      }
    }, 1500);

    // Always chain onYouTubeIframeAPIReady — even if script tag already exists
    // (it may be mid-load from a previous mount, so the callback hasn't fired yet)
    const previousOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (previousOnReady) previousOnReady();
      clearTimeout(fallbackTimer);
      setPlayerReady(true);
    };

    if (!document.getElementById("youtube-api-script")) {
      const tag = document.createElement("script");
      tag.id = "youtube-api-script";
      tag.src = "https://www.youtube.com/iframe_api";
      tag.onerror = () => {
        console.warn("[YT-PLAYER] API Script Blocked by network policy. Activated fallback.");
        clearTimeout(fallbackTimer);
        setTimedOut(true);
      };
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Polling as a safety net
    const interval = setInterval(() => {
      if (checkYT()) {
        clearInterval(interval);
        clearTimeout(fallbackTimer);
      }
    }, 200);

    return () => {
      clearInterval(interval);
      clearTimeout(fallbackTimer);
    };
  }, []);

  // Media Session API Sync
  const updateMediaSession = () => {
    if (!("mediaSession" in navigator)) return;

    const metadata = {
      title: title,
      artist: artist,
      album: album,
      artwork: [
        { 
          src: thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`, 
          sizes: "512x512", 
          type: "image/jpeg" 
        },
      ],
    };

    navigator.mediaSession.metadata = new (window as any).MediaMetadata(metadata);
    navigator.mediaSession.playbackState = playerInstance.current?.getPlayerState?.() === PLAYER_STATE_PLAYING ? "playing" : "paused";

    navigator.mediaSession.setActionHandler("play", () => {
      playerInstance.current?.playVideo();
      navigator.mediaSession.playbackState = "playing";
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      playerInstance.current?.pauseVideo();
      navigator.mediaSession.playbackState = "paused";
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) {
        playerInstance.current?.seekTo(details.seekTime);
      }
    });
  };

  // 2. Initialize/Update Player Instance
  const wasPlayingRef = useRef(false);
  const seekPerformedRef = useRef(false);

  useEffect(() => {
    // Reset seek flag when videoId changes
    seekPerformedRef.current = false;
  }, [videoId]);

  useEffect(() => {
    if (!playerInstance.current || !initialTime || seekPerformedRef.current) return;
    const current = playerInstance.current.getCurrentTime?.();
    if (typeof current === "number" && current + 2 < initialTime) {
      playerInstance.current.seekTo(initialTime, true);
      seekPerformedRef.current = true;
    }
  }, [initialTime, videoId]);

  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    if (!playerReady || !videoId || timedOut) return;

    if (!playerInstance.current) {
      playerInstance.current = new window.YT.Player(playerContainerId.current, {
        height: "100%",
        width: "100%",
        videoId: videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: () => {
             updateMediaSession();
             if (initialTime > 0) {
               playerInstance.current?.seekTo(initialTime, true);
               seekPerformedRef.current = true;
             }
             // Explicitly play to ensure autoplay works after a transition
             playerInstance.current?.playVideo();
          },
          onStateChange: (event: any) => {
            setCurrentState(event.data);
            if (onStateChangeRef.current) onStateChangeRef.current(event.data);
            const isPlaying = event.data === PLAYER_STATE_PLAYING;
            const isPaused = event.data === PLAYER_STATE_PAUSED;
            
            if (isPlaying) {
              updateMediaSession();
              wasPlayingRef.current = true;
              
              // Fallback seek: if onReady seek didn't work or was skipped, try here once
              if (!seekPerformedRef.current && initialTime > 0) {
                playerInstance.current?.seekTo(initialTime, true);
                seekPerformedRef.current = true;
              }
            } else if (isPaused) {
              if (!document.hidden) {
                wasPlayingRef.current = false;
              }
            }
          },
          onError: () => {
             setTimedOut(true); 
          }
        },
      });
    } else if (playerInstance.current.loadVideoById) {
      playerInstance.current.loadVideoById({
        videoId: videoId,
        startSeconds: initialTime || 0
      });
      playerInstance.current.playVideo();
      updateMediaSession();
    }

    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
      }
    };
  }, [playerReady, videoId, timedOut]); // eslint-disable-line react-hooks/exhaustive-deps

  // 4. Persistence Logic: Prevent pause on tab hidden
  useEffect(() => {
    const handleVisibility = () => {
      if (!playerInstance.current || !window.YT) return;

      if (!document.hidden) {
        // Tab is visible again — resume if it was playing before the tab switch.
        if (wasPlayingRef.current) {
          // Small delay to let the browser fully restore the tab before calling play.
          setTimeout(() => {
            playerInstance.current?.playVideo();
            if ('mediaSession' in navigator) {
              navigator.mediaSession.playbackState = "playing";
            }
          }, 150);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, []);



  return (
    <div className={`relative w-full h-full bg-black overflow-hidden ${className}`}>
      {!timedOut ? (
        <div id={playerContainerId.current} className="w-full h-full" />
      ) : (
        <iframe
          src={embedUrl}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation allow-pointer-lock allow-orientation-lock allow-forms"
          // NOTE: 'allow-popups' is intentionally absent — this is the
          // browser-level block for YouTube logo / More Videos / title links.
        />
      )}



      {!playerReady && !timedOut && videoId && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
          <div className="text-center space-y-4">
            <Loader2 className="w-10 h-10 text-devo-500 animate-spin mx-auto" />
            <p className="text-white font-bold text-[10px] uppercase tracking-[0.2em] px-4 animate-pulse">
              Optimizing Connection...
            </p>
          </div>
        </div>
      )}

      {error && !timedOut && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-8 text-center z-20">
          <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
          <p className="text-white font-bold text-sm mb-6">{error}</p>
          <button
            onClick={() => { setError(null); playerInstance.current?.loadVideoById(videoId); }}
            className="px-6 py-3 bg-devo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-devo-700 transition-all"
          >
            Retry Connection
          </button>
        </div>
      )}
    </div>
  );
});

export default OptimizedVideoPlayer;
