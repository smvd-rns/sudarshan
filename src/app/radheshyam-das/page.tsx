"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Globe, 
  RefreshCw, 
  Maximize2, 
  Minimize2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Monitor, 
  Smartphone,
  ChevronRight,
  ShieldCheck,
  ArrowLeft
} from "lucide-react";
import NextLink from "next/link";

const RSD_URL = "/rsd";
const DESKTOP_CANVAS_WIDTH = 1200;

export default function RadheshyamDasPage() {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Default to native responsive mobile view
  const [viewMode, setViewMode] = useState<"responsive" | "desktop">("responsive");
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [containerWidth, setContainerWidth] = useState<number>(1200);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Auto-dismiss loading indicator after 1.2s max so overlay never blocks content
  useEffect(() => {
    const timer = setTimeout(() => {
      setIframeLoading(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  // Track container width for responsive scaling if in desktop mode
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      } else {
        setContainerWidth(window.innerWidth);
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [isFullscreen]);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Dynamic scale factor for desktop mode on small screens
  const desktopScale = Math.min(1, Math.max(0.3, (containerWidth > 0 ? containerWidth : 375) / DESKTOP_CANVAS_WIDTH));
  const activeScale = viewMode === "desktop" ? desktopScale * zoomLevel : 1;

  const handleReload = () => {
    setIframeLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = RSD_URL;
    }
    setTimeout(() => setIframeLoading(false), 1200);
  };

  const handleZoomIn = () => {
    setViewMode("desktop");
    setZoomLevel(prev => Math.min(2.0, Number((prev + 0.15).toFixed(2))));
  };

  const handleZoomOut = () => {
    setViewMode("desktop");
    setZoomLevel(prev => Math.max(0.5, Number((prev - 0.15).toFixed(2))));
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
  };

  return (
    <div className={`font-outfit ${isFullscreen ? "fixed inset-0 z-[2000] bg-slate-900 flex flex-col" : "min-h-screen bg-slate-50/70"}`}>
      <main className={isFullscreen ? "flex-1 flex flex-col h-full w-full p-0" : "max-w-7xl mx-auto w-full p-2 sm:p-5"}>
        
        {/* Navigation Breadcrumb & Header (Visible when NOT in fullscreen) */}
        {!isFullscreen && (
          <div className="mb-2 sm:mb-4">
            {/* Desktop breadcrumb */}
            <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              <NextLink href="/" className="hover:text-orange-600 transition-colors">Home</NextLink>
              <ChevronRight className="w-3 h-3" />
              <span>More</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-orange-600">Radheshyam Das</span>
            </div>

            {/* Sleek Header Bar */}
            <div className="flex items-center justify-between gap-3 bg-white px-3 py-2.5 sm:px-5 sm:py-3.5 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-sm">
              <div className="flex items-center gap-2.5">
                <NextLink href="/" className="sm:hidden p-1 -ml-1 text-slate-400 hover:text-slate-700">
                  <ArrowLeft className="w-4 h-4" />
                </NextLink>
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-sm shadow-orange-500/20 shrink-0">
                  <Globe className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-none">
                      HG Radheshyam Das
                    </h1>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-orange-50 text-orange-700 border border-orange-200">
                      <ShieldCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      In-App
                    </span>
                  </div>
                  <p className="hidden sm:block text-xs text-slate-500 font-semibold mt-0.5">
                    Official Discourses &amp; Categories &mdash; Ashram In-App Access
                  </p>
                </div>
              </div>

              {/* Header Right Action */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleReload}
                  className="sm:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 active:scale-95 transition-all"
                  title="Reload"
                >
                  <RefreshCw className={`w-4 h-4 ${iframeLoading ? "animate-spin text-orange-600" : ""}`} />
                </button>
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-[11px] sm:text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95"
                  title="Toggle Fullscreen View"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Fullscreen</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Portal Card */}
        <div 
          ref={containerRef}
          className={`bg-white shadow-lg border border-slate-200 overflow-hidden relative flex flex-col ${
            isFullscreen 
              ? "flex-1 h-full rounded-none border-none" 
              : "rounded-xl sm:rounded-2xl h-[calc(100dvh-125px)] sm:h-[84vh]"
          }`}
        >
          {/* Controls Bar */}
          <div className="bg-slate-900 text-white px-2.5 sm:px-4 py-2 flex items-center justify-between gap-1.5 shrink-0 border-b border-slate-800 select-none">
            {/* Left: View Mode Indicator & Quick Toggles */}
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => { setViewMode("responsive"); setZoomLevel(1); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all ${
                  viewMode === "responsive" 
                    ? "bg-orange-600 text-white shadow-sm" 
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
                title="Mobile Responsive: Full width, readable fonts, touch-friendly"
              >
                <Smartphone className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>Mobile View</span>
              </button>

              <button
                onClick={() => { setViewMode("desktop"); setZoomLevel(1); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all ${
                  viewMode === "desktop" 
                    ? "bg-orange-600 text-white shadow-sm" 
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
                title="Desktop View: Full 3-column desktop layout"
              >
                <Monitor className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>Desktop</span>
              </button>
            </div>

            {/* Center: Zoom Controls (only in desktop mode) */}
            {viewMode === "desktop" && (
              <div className="flex items-center gap-1 bg-slate-800/90 rounded-xl p-0.5 border border-slate-700/60">
                <button
                  onClick={handleZoomOut}
                  disabled={activeScale <= 0.3}
                  className="p-1 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-40 transition-all"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="text-[10px] font-mono font-bold text-slate-200 px-1 min-w-[34px] text-center">
                  {Math.round(activeScale * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={activeScale >= 2.0}
                  className="p-1 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-40 transition-all"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                {activeScale !== desktopScale && (
                  <button
                    onClick={handleResetZoom}
                    className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                    title="Reset Zoom"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            )}

            {/* Right: Reload & Fullscreen */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              <button
                onClick={handleReload}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all active:scale-95"
                title="Reload Website"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${iframeLoading ? "animate-spin text-orange-400" : ""}`} />
              </button>

              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all active:scale-95"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Iframe Viewport Container */}
          <div 
            className="w-full flex-1 relative bg-[#fdf8f4] overflow-auto touch-pan-y" 
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {/* Loading Indicator */}
            {iframeLoading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm transition-opacity duration-300 pointer-events-none">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shadow-sm animate-pulse">
                    <Globe className="w-5 h-5 animate-bounce" />
                  </div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">Loading discourses...</p>
                </div>
              </div>
            )}

            {/* Canvas Wrapper */}
            {viewMode === "responsive" ? (
              // Native Responsive Mobile View: 100% full width, large text, natural cards
              <iframe
                ref={iframeRef}
                id="radheshyam-das-iframe"
                src={RSD_URL}
                title="HG Radheshyam Das Website"
                onLoad={() => setIframeLoading(false)}
                className="w-full h-full border-none block bg-transparent"
                allow="geolocation; microphone; camera; clipboard-read; clipboard-write; fullscreen"
                loading="eager"
              />
            ) : (
              // Desktop View: Forced 1200px desktop canvas scaled down
              <div 
                style={{
                  width: "100%",
                  height: "100%",
                  overflow: "hidden",
                  position: "relative"
                }}
              >
                <iframe
                  ref={iframeRef}
                  id="radheshyam-das-iframe-desktop"
                  src={RSD_URL}
                  title="HG Radheshyam Das Website (Desktop)"
                  onLoad={() => setIframeLoading(false)}
                  className="border-none block bg-transparent"
                  allow="geolocation; microphone; camera; clipboard-read; clipboard-write; fullscreen"
                  loading="eager"
                  style={{
                    width: `${DESKTOP_CANVAS_WIDTH}px`,
                    minWidth: `${DESKTOP_CANVAS_WIDTH}px`,
                    height: `${100 / activeScale}%`,
                    minHeight: `${100 / activeScale}%`,
                    transformOrigin: "top left",
                    transform: `scale(${activeScale})`,
                    display: "block"
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
