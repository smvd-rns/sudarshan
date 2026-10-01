"use client";

import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, Music, X, Settings, Bookmark, Check } from "lucide-react";
import { useMedia } from "@/context/MediaContext";

export default function IdktPlayer() {
  const { 
    currentTrack, 
    playlist,
    autoplay,
    setAutoplay,
    isPlaying, 
    togglePlay, 
    stopTrack, 
    playNext,
    playPrevious,
    playbackSpeed, 
    setPlaybackSpeed,
    progress,
    duration,
    volume,
    isMuted,
    seek,
    setVolume,
    setIsMuted,
    savePosition
  } = useMedia();
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showMobileExtra, setShowMobileExtra] = useState(false);
  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];

  if (!currentTrack) return null;

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(Number(e.target.value));
  };

  const getSpeakerName = (item: any) => {
    const path = (item as any).full_path || "";
    if (path.includes("01_-_Srila_Prabhupada")) return "Srila Prabhupada";
    
    // Simple heuristic for speaker names from paths
    const segments = path.split("/");
    for (const segment of segments) {
      if (segment.includes("His_Holiness_") || segment.includes("His_Grace_") || segment.includes("Srila_")) {
        return segment
          .replace(/His_Holiness_/gi, "")
          .replace(/His_Grace_/gi, "")
          .replace(/Srila_/gi, "")
          .replace(/_/g, " ")
          .trim();
      }
    }
    return "Audio Lecture";
  };

  return (
    <div className="fixed [bottom:calc(env(safe-area-inset-bottom,0px)+88px)] sm:bottom-6 left-1/2 -translate-x-1/2 w-[95%] max-w-4xl z-[100] animate-in slide-in-from-bottom-10 duration-500">
      <div className="bg-gradient-to-r from-blue-950 via-indigo-900 to-slate-900 backdrop-blur-2xl border-2 border-amber-500/40 shadow-[0_25px_60px_-15px_rgba(15,23,42,0.8)] rounded-[2rem] sm:rounded-[2.5rem] p-3.5 sm:p-6 flex flex-col gap-2.5 sm:gap-3.5 relative">
        
        {/* Close Button */}
        <button 
          onClick={stopTrack}
          className="absolute -top-2.5 -right-2.5 sm:-top-3 sm:-right-3 w-8 h-8 sm:w-9 sm:h-9 bg-amber-500 text-slate-950 rounded-full flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-xl z-20 border-2 border-amber-300 active:scale-95"
          title="Close player"
        >
          <X className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[3]" />
        </button>

        {/* Track Title - Above Progress Bar */}
        <div className="px-2 sm:px-4 pt-1">
          <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight leading-snug line-clamp-2 sm:line-clamp-1">
            {currentTrack.name}
          </h4>
          <p className="text-[8px] sm:text-[10px] font-extrabold text-amber-300 uppercase tracking-widest mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            ISKCON Desire Tree • {getSpeakerName(currentTrack)}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="group relative w-full h-4 sm:h-2 bg-blue-950/80 rounded-full cursor-pointer flex items-center px-0.5 mt-1 sm:mt-0 border border-blue-800/40">
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={progress}
            onChange={handleSeek}
            className="absolute inset-x-0 -top-1 bottom-0 w-full opacity-0 z-20 cursor-pointer"
          />
          <div className="relative w-full h-1.5 sm:h-1.5 bg-blue-950 rounded-full overflow-hidden">
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 rounded-full transition-all duration-100"
              style={{ width: `${(progress / (duration || 1)) * 100}%` }}
            />
          </div>
          {/* Slider Thumb Handle */}
          <div 
            className="absolute h-4 w-4 sm:h-3.5 sm:w-3.5 bg-amber-400 border-2 border-white rounded-full shadow-lg z-10 transition-all duration-100 pointer-events-none"
            style={{ 
              left: `calc(${(progress / (duration || 1)) * 100}% - 8px)`,
              opacity: progress > 0 ? 1 : 0
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Controls Section */}
          <div className="flex items-center gap-1 sm:gap-4 shrink-0">
            <button 
              onClick={playPrevious}
              disabled={!playlist.length || playlist.findIndex(t => t.id === currentTrack?.id) === 0}
              className="w-8 h-8 sm:w-10 sm:h-10 text-amber-200 hover:text-amber-400 disabled:opacity-20 disabled:hover:text-slate-400 transition-all rounded-full hover:bg-blue-900/60 flex items-center justify-center shrink-0"
            >
              <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </button>
            <button 
              onClick={togglePlay}
              className="w-11 h-11 sm:w-14 sm:h-14 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 text-slate-950 rounded-full flex items-center justify-center hover:scale-105 transition-all shadow-xl shadow-orange-500/30 active:scale-95 shrink-0 border-2 border-amber-300 font-bold"
            >
              {isPlaying ? <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current ml-0.5" />}
            </button>
            <button 
              onClick={playNext}
              disabled={!playlist.length || playlist.findIndex(t => t.id === currentTrack?.id) === playlist.length - 1}
              className="w-8 h-8 sm:w-10 sm:h-10 text-amber-200 hover:text-amber-400 disabled:opacity-20 disabled:hover:text-slate-400 transition-all rounded-full hover:bg-blue-900/60 flex items-center justify-center shrink-0"
            >
              <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Manual Save Button */}
            <button 
              onClick={async () => {
                setSaveStatus('saving');
                await savePosition();
                setSaveStatus('success');
                setTimeout(() => setSaveStatus('idle'), 2000);
              }}
              className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-xl border transition-all active:scale-95 shadow-sm ${
                saveStatus === 'success' 
                  ? "bg-emerald-500 border-emerald-400 text-white" 
                  : "bg-blue-950/80 border-blue-700/60 text-amber-200 hover:bg-blue-900 hover:text-amber-400 hover:border-amber-400/50"
              }`}
              title={saveStatus === 'success' ? "Position Saved!" : "Save playback position"}
            >
              {saveStatus === 'success' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Bookmark className={`w-4 h-4 ${saveStatus === 'saving' ? 'animate-bounce' : ''}`} />
              )}
            </button>
          </div>

          {/* Right Section / Extra Mobile Menu */}
          <div className="flex items-center gap-2 sm:gap-4 flex-1 justify-end shrink-0">
            <div className="text-[10px] sm:text-[11px] font-black text-amber-200 tabular-nums bg-blue-950/90 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full border border-blue-700/60">
              {formatTime(progress)}
            </div>
            
            {/* Desktop Extras */}
            <div className="hidden sm:flex items-center gap-4">
              {/* Autoplay Toggle */}
              <div className="flex items-center gap-2 bg-blue-950/90 px-3 py-1.5 rounded-full border border-blue-700/60">
                <span className="text-[9px] font-black text-amber-200 uppercase tracking-widest">Autoplay</span>
                <button 
                  onClick={() => setAutoplay(!autoplay)}
                  className={`w-8 h-4 rounded-full relative transition-colors ${autoplay ? "bg-amber-500" : "bg-blue-900"}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-slate-950 rounded-full transition-all ${autoplay ? "left-4.5" : "left-0.5"}`} />
                </button>
              </div>

              <div className="relative">
                <button 
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className="text-[10px] font-black text-amber-200 hover:text-amber-400 transition-colors px-3 py-1.5 rounded-full border border-blue-700/60 bg-blue-950/90"
                >
                  {playbackSpeed}x
                </button>
                {showSpeedMenu && (
                  <div className="absolute bottom-full right-0 mb-4 bg-blue-950 border border-blue-800 shadow-2xl rounded-2xl p-2 min-w-[80px] animate-in slide-in-from-bottom-2 duration-200">
                    {speedOptions.map(speed => (
                      <button
                        key={speed}
                        onClick={() => {
                          setPlaybackSpeed(speed);
                          setShowSpeedMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-[10px] font-bold rounded-xl transition-colors ${playbackSpeed === speed ? "bg-amber-500 text-slate-950 font-black" : "text-amber-200 hover:bg-blue-900"}`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 group/vol">
                <button onClick={() => setIsMuted(!isMuted)}>
                  <Volume2 className="w-5 h-5 text-amber-200 hover:text-amber-400 transition-colors shrink-0" />
                </button>
                <div className="w-16 lg:w-20 h-1 bg-blue-950 rounded-full relative overflow-hidden border border-blue-800/40">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div 
                    className="absolute top-0 left-0 h-full bg-amber-400 rounded-full group-hover/vol:bg-orange-500 transition-all"
                    style={{ width: `${volume * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Mobile Toggle */}
            <div className="sm:hidden relative">
              <button 
                onClick={() => setShowMobileExtra(!showMobileExtra)}
                className="p-2 text-amber-200 hover:text-amber-400 bg-blue-950/90 rounded-full active:bg-blue-900 transition-colors border border-blue-700/60"
              >
                <Settings className={`w-4 h-4 ${showMobileExtra ? 'rotate-90' : ''} transition-transform duration-300`} />
              </button>
              
              {showMobileExtra && (
                <div className="absolute bottom-full right-0 mb-4 bg-blue-950 border border-blue-800 shadow-2xl rounded-2xl p-4 min-w-[160px] animate-in slide-in-from-bottom-2 duration-200 z-50">
                  <p className="text-[8px] font-black text-amber-300 uppercase tracking-widest mb-3">Playback Settings</p>
                  
                  <div className="space-y-4">
                    {/* Mobile Autoplay Toggle */}
                    <div className="flex items-center justify-between pb-3 border-b border-blue-900">
                      <p className="text-[10px] font-bold text-amber-200">Autoplay Next</p>
                      <button 
                        onClick={() => setAutoplay(!autoplay)}
                        className={`w-8 h-4 rounded-full relative transition-colors ${autoplay ? "bg-amber-500" : "bg-blue-900"}`}
                      >
                        <div className={`absolute top-0.5 w-3 h-3 bg-slate-950 rounded-full transition-all ${autoplay ? "left-4.5" : "left-0.5"}`} />
                      </button>
                    </div>

                    {/* Mobile Speed Controls */}
                    <div>
                      <div className="grid grid-cols-3 gap-1">
                        {speedOptions.map(speed => (
                          <button
                            key={speed}
                            onClick={() => setPlaybackSpeed(speed)}
                            className={`py-1.5 text-[10px] font-bold rounded-lg transition-colors ${playbackSpeed === speed ? "bg-amber-500 text-slate-950 font-black" : "bg-blue-900 text-amber-200"}`}
                          >
                            {speed}x
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {/* Mobile Volume Slider */}
                    <div className="flex items-center gap-3 pt-2 border-t border-blue-900">
                      <Volume2 className="w-4 h-4 text-amber-200 shrink-0" />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={volume}
                        onChange={(e) => setVolume(Number(e.target.value))}
                        className="flex-1 h-1 bg-blue-900 rounded-full appearance-none cursor-pointer accent-amber-400"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
