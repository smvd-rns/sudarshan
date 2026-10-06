"use client";

import { useState } from "react";
import VideoCard, { Lecture } from "./VideoCard";
import { Search, X, Loader2, Heart, Link2, Check, Plus } from "lucide-react";
import OptimizedVideoPlayer from "./OptimizedVideoPlayer";
import AddBcClassModal from "./AddBcClassModal";
import { openExternal } from "@/lib/device";
import { useEffect, useCallback } from "react";

export default function LectureGrid({ 
  initialLectures,
  userRole,
  isSuperAdmin,
  onUpdate,
  accessToken,
  onLoadMore,
  hasMore,
  isFetchingMore,
  onSearch
}: { 
  initialLectures: Lecture[],
  userRole?: number,
  isSuperAdmin?: boolean,
  onUpdate?: () => void,
  accessToken?: string,
  onLoadMore?: () => void,
  hasMore?: boolean,
  isFetchingMore?: boolean,
  onSearch?: (q: string) => void
}) {
  const [search, setSearch] = useState("");
  const [activeLecture, setActiveLecture] = useState<Lecture | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const handleCopyLink = async (youtubeId: string) => {
    const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    try {
      await navigator.clipboard.writeText(videoUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const fetchFavorites = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/user/favorites", {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favoriteIds || []);
      }
    } catch (err) {
      console.error("Failed to fetch favorites:", err);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const handleToggleFavorite = async (videoId: string) => {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/user/favorites", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}` 
        },
        body: JSON.stringify({ video_id: videoId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.action === "added") setFavorites(prev => [...prev, videoId]);
        else setFavorites(prev => prev.filter(id => id !== videoId));
      }
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (onSearch) onSearch(val);
  };

  return (
    <div className="w-full pb-20">
      {/* Search Header */}
      <div className="mb-8 sm:mb-14 text-center max-w-2xl mx-auto space-y-4 sm:space-y-6 px-4">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-outfit font-black text-devo-950 tracking-tight leading-tight">
          Discover Spiritual <span className="text-transparent bg-clip-text bg-gradient-to-r from-devo-600 to-accent-gold">Wisdom</span>
        </h1>
        <p className="text-base sm:text-lg text-devo-800 font-medium opacity-80 max-w-lg mx-auto">
          Explore our collection of profound discourses. Immerse yourself in the timeless teachings.
        </p>

        {/* SuperAdmin Quick Action Button */}
        {isSuperAdmin && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center justify-center gap-2.5 px-6 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-amber-600/20 hover:shadow-amber-600/30 transition-all hover:scale-105 active:scale-95 border border-amber-400/30"
            >
              <Plus className="w-4 h-4" />
              <span>Add New BC Class Entry</span>
            </button>
          </div>
        )}

        <div className="relative max-w-xl mx-auto mt-6">
          <div className="absolute inset-y-0 left-0 pl-4 sm:pl-5 flex items-center pointer-events-none">
            <Search className="h-4 w-4 sm:h-5 sm:w-5 text-devo-500" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 sm:pl-14 pr-4 py-3.5 sm:py-5 border-2 border-devo-100/50 rounded-2xl sm:rounded-full focus:ring-8 focus:ring-devo-500/5 focus:border-devo-400 focus:outline-none transition-all duration-300 text-base sm:text-lg shadow-xl shadow-devo-900/5 placeholder-devo-300 bg-white"
            placeholder="Search by title or speaker..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* Add BC Class Modal (SuperAdmin Only) */}
      {isSuperAdmin && (
        <AddBcClassModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          accessToken={accessToken}
          onSuccess={() => {
            if (onUpdate) onUpdate();
          }}
        />
      )}

      {/* Grid */}
      {initialLectures.length > 0 ? (
        <div className="space-y-12">
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 gap-3 sm:gap-8 px-2 sm:px-4">
            {initialLectures.map(lecture => (
              <VideoCard 
                key={lecture.id} 
                lecture={lecture} 
                onPlay={() => setActiveLecture(lecture)} 
                userRole={userRole}
                onUpdate={onUpdate}
                accessToken={accessToken}
                isFavorite={favorites.includes(lecture.youtube_id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="flex justify-center pt-8">
              <button
                onClick={onLoadMore}
                disabled={isFetchingMore}
                className="group relative flex items-center justify-center gap-3 px-12 py-4 bg-white border-2 border-devo-100 hover:border-devo-600 text-devo-950 font-black uppercase tracking-widest text-sm rounded-full transition-all shadow-xl hover:shadow-devo-100 active:scale-95 disabled:opacity-50"
              >
                {isFetchingMore ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-devo-600" />
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <span>Load More Lectures</span>
                    <Search className="w-4 h-4 opacity-40 group-hover:rotate-12 transition-transform" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-20 px-4">
          <div className="w-20 h-20 bg-devo-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <X className="w-10 h-10 text-devo-300" />
          </div>
          <p className="text-xl text-devo-600 font-black uppercase tracking-widest">No teachings found</p>
          <p className="text-slate-400 mt-2 font-medium">Try a different search term or check back later.</p>
          <button 
            onClick={() => handleSearchChange("")}
            className="mt-6 px-6 py-2 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:border-devo-400 transition-all"
          >
            Clear Search
          </button>
        </div>
      )}

      {/* Video Modal - Fully Responsive */}
      {activeLecture && (
        <div 
          className="fixed inset-0 z-[100] flex flex-col bg-black/98 backdrop-blur-2xl animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setActiveLecture(null); }}
        >
          {/* Spacer for mobile notch safety */}
          <div className="h-safe-top sm:h-4" />

          {/* Video fills the screen vertically on mobile, max-width on desktop */}
          <div className="flex flex-col flex-1 items-center justify-center px-4 sm:px-6 gap-3 sm:gap-6 min-h-0 w-full">
            
            {/* Close Button Top Right */}
            <button 
              onClick={() => setActiveLecture(null)}
              className="absolute top-4 right-4 sm:top-8 sm:right-8 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/20 active:scale-90 z-[110]"
              aria-label="Close"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Video Container with Height Safety */}
            <div className="w-full max-w-[100vw] sm:max-w-5xl xl:max-w-6xl aspect-video bg-black sm:rounded-3xl overflow-hidden border-0 sm:border-4 sm:border-white/10 shadow-2xl flex-shrink-0 max-h-[60vh] sm:max-h-[75vh]">
              <OptimizedVideoPlayer 
                videoId={activeLecture.youtube_id}
                title={activeLecture.title}
                artist={activeLecture.speaker_name}
              />
            </div>

            {/* Bottom Content Bar - Slimmer & Responsive */}
            <div className="w-full max-w-[100vw] sm:max-w-5xl xl:max-w-6xl px-2 sm:px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-white font-black text-lg sm:text-xl tracking-tight line-clamp-1">{activeLecture.title}</p>
                <p className="text-indigo-400 font-bold text-[10px] sm:text-xs uppercase tracking-widest">{activeLecture.speaker_name}</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={() => handleCopyLink(activeLecture.youtube_id)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-orange-950/20 active:scale-95"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-4 h-4" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setActiveLecture(null)}
                  className="sm:hidden flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all border border-white/10"
                >
                  Close
                </button>
              </div>
            </div>
          </div>

          {/* Bottom safe area */}
          <div className="h-4 sm:h-4" />
        </div>
      )}
    </div>
  );
}
