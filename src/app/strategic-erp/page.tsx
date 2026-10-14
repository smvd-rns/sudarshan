"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Building2, 
  ExternalLink, 
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
  Info
} from "lucide-react";
import NextLink from "next/link";

const ERP_URL = "https://12.strategicerpcloud.com/strategicerp/";
const DESKTOP_CANVAS_WIDTH = 1280;

export default function StrategicErpPage() {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<"desktop-scroll" | "fit-screen">("desktop-scroll");
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [containerWidth, setContainerWidth] = useState<number>(1280);
  const [showTip, setShowTip] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Track container width for responsive scaling
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

  // Calculate dynamic scale factor for "Fit Screen" mode
  const fitScale = Math.min(1, Math.max(0.25, (containerWidth > 0 ? containerWidth : 375) / DESKTOP_CANVAS_WIDTH));
  const activeScale = viewMode === "fit-screen" ? fitScale : zoomLevel;

  const handleReload = () => {
    setIframeLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = ERP_URL;
    }
  };

  const handleZoomIn = () => {
    setViewMode("desktop-scroll");
    setZoomLevel(prev => Math.min(2.0, Number((prev + 0.15).toFixed(2))));
  };

  const handleZoomOut = () => {
    setViewMode("desktop-scroll");
    setZoomLevel(prev => Math.max(0.4, Number((prev - 0.15).toFixed(2))));
  };

  const handleResetZoom = () => {
    setViewMode("desktop-scroll");
    setZoomLevel(1);
  };

  const toggleFitScreen = () => {
    if (viewMode === "fit-screen") {
      setViewMode("desktop-scroll");
      setZoomLevel(1);
    } else {
      setViewMode("fit-screen");
    }
  };

  return (
    <div className={`font-outfit ${isFullscreen ? "fixed inset-0 z-[2000] bg-slate-900 flex flex-col" : "min-h-screen bg-slate-50/70"}`}>
      <main className={isFullscreen ? "flex-1 flex flex-col h-full w-full p-0" : "max-w-7xl mx-auto w-full p-3 sm:p-6"}>
        
        {/* Navigation Breadcrumb & Header (Visible when NOT in fullscreen) */}
        {!isFullscreen && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              <NextLink href="/" className="hover:text-blue-600 transition-colors">Home</NextLink>
              <ChevronRight className="w-3 h-3" />
              <span>More</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-blue-600">Strategic ERP</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Strategic ERP</h1>
                    <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <ShieldCheck className="w-3 h-3" />
                      Live Portal
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Enterprise ERP Cloud &mdash; Forced Desktop Mode Enabled
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { window.location.href = ERP_URL; }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-blue-500/20 transition-all active:scale-95"
                  title="Launch full screen inside the app for seamless OTP login without cookie blocking"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Launch In-App</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile / Web APK helper notice (dismissible) */}
        {!isFullscreen && showTip && (
          <div className="mb-3 p-3.5 bg-blue-50/90 border border-blue-200/80 rounded-2xl flex items-center justify-between gap-3 text-xs text-blue-900 shadow-sm">
            <div className="flex items-start gap-2.5 font-medium">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Web APK &amp; OTP Notice:</strong> If login requires OTP verification, tap <strong>Launch In-App</strong> above so session cookies work smoothly without looping. Use the Android Back button to return to Spiritual Echoes.
              </div>
            </div>
            <button 
              onClick={() => setShowTip(false)}
              className="text-blue-500 hover:text-blue-800 text-xs font-black uppercase tracking-wider px-2 py-1 rounded-lg hover:bg-blue-100/50 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Portal Card */}
        <div 
          ref={containerRef}
          className={`bg-white shadow-xl border border-slate-200 overflow-hidden relative flex flex-col ${
            isFullscreen 
              ? "flex-1 h-full rounded-none border-none" 
              : "rounded-2xl sm:rounded-3xl h-[78vh] sm:h-[82vh]"
          }`}
        >
          {/* Controls Bar */}
          <div className="bg-slate-900 text-white px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2 shrink-0 border-b border-slate-800 select-none">
            {/* Left: View Mode Indicator & Quick Toggles */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={toggleFitScreen}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all ${
                  viewMode === "fit-screen" 
                    ? "bg-blue-600 text-white shadow-sm" 
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
                title="Scale desktop layout to fit current screen width"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Fit Screen</span>
                <span className="sm:hidden">Fit</span>
              </button>

              <button
                onClick={handleResetZoom}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all ${
                  viewMode === "desktop-scroll" && zoomLevel === 1 
                    ? "bg-blue-600 text-white shadow-sm" 
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
                title="View at native 100% desktop size with pan & scroll"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">100% Desktop</span>
                <span className="sm:hidden">100%</span>
              </button>
            </div>

            {/* Center: Zoom In/Out Controls */}
            <div className="flex items-center gap-1 bg-slate-800/90 rounded-xl p-1 border border-slate-700/60">
              <button
                onClick={handleZoomOut}
                disabled={activeScale <= 0.4}
                className="p-1 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <span className="text-[10px] font-mono font-bold text-slate-200 px-1.5 min-w-[42px] text-center">
                {Math.round(activeScale * 100)}%
              </span>

              <button
                onClick={handleZoomIn}
                disabled={activeScale >= 2.0}
                className="p-1 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              {activeScale !== 1 && (
                <button
                  onClick={handleResetZoom}
                  className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all ml-0.5"
                  title="Reset to 100%"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Right: Reload, Fullscreen & External */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              <button
                onClick={handleReload}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all active:scale-95"
                title="Reload ERP"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${iframeLoading ? "animate-spin text-blue-400" : ""}`} />
              </button>

              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all active:scale-95"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>

              <a
                href={ERP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all active:scale-95"
                title="Open in new window"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Iframe Viewport Container */}
          <div className="w-full flex-1 relative bg-slate-900/5 overflow-auto touch-pan-x touch-pan-y" style={{ WebkitOverflowScrolling: "touch" }}>
            {/* Loading Indicator */}
            {iframeLoading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm transition-opacity duration-300">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm animate-pulse">
                    <Building2 className="w-6 h-6 animate-bounce" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-800">Loading Strategic ERP...</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Establishing secure enterprise connection</p>
                  </div>
                </div>
              </div>
            )}

            {/* Desktop Canvas Wrapper */}
            <div 
              style={{
                width: viewMode === "fit-screen" ? "100%" : `${DESKTOP_CANVAS_WIDTH * activeScale}px`,
                minWidth: viewMode === "fit-screen" ? "100%" : `${DESKTOP_CANVAS_WIDTH * activeScale}px`,
                height: "100%",
                minHeight: "100%",
                position: "relative",
                overflow: viewMode === "fit-screen" ? "hidden" : "visible"
              }}
            >
              <iframe
                ref={iframeRef}
                id="strategic-erp-iframe"
                src={ERP_URL}
                title="Strategic ERP Portal"
                onLoad={() => setIframeLoading(false)}
                className="border-none bg-white block"
                allow="geolocation; microphone; camera; clipboard-read; clipboard-write; fullscreen"
                loading="eager"
                style={{
                  width: `${DESKTOP_CANVAS_WIDTH}px`,
                  minWidth: `${DESKTOP_CANVAS_WIDTH}px`,
                  height: activeScale !== 1 ? `${100 / activeScale}%` : "100%",
                  minHeight: activeScale !== 1 ? `${100 / activeScale}%` : "100%",
                  transformOrigin: "top left",
                  transform: activeScale !== 1 ? `scale(${activeScale})` : "none",
                  display: "block"
                }}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
