"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, X, BookOpen, ExternalLink } from "lucide-react";

export default function PolicyModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [modalTitleMain, setModalTitleMain] = useState("Ashram");
  const [modalTitleHighlight, setModalTitleHighlight] = useState("Media Policy");
  const [modalDesc, setModalDesc] = useState("Restricted Device Access");
  const [modalContent, setModalContent] = useState("As per our Temple Policy, external YouTube navigation is restricted to maintain a focused spiritual atmosphere.");
  const [modalSub, setModalSub] = useState("Please continue your journey within this curated library.");

  useEffect(() => {
    const handleShowPolicy = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setModalTitleMain(customEvent.detail.titleMain || "External Link");
        setModalTitleHighlight(customEvent.detail.titleHighlight || "Restricted");
        setModalDesc(customEvent.detail.desc || "Restricted Action");
        setModalContent(customEvent.detail.content || "External links are not allowed to be opened in another browser tab on laptop view.");
        setModalSub(customEvent.detail.sub || "Please continue your journey within this curated library.");
      } else {
        // Default YouTube block message
        setModalTitleMain("Ashram");
        setModalTitleHighlight("Media Policy");
        setModalDesc("Restricted Device Access");
        setModalContent("As per our Temple Policy, external YouTube navigation is restricted to maintain a focused spiritual atmosphere.");
        setModalSub("Please continue your journey within this curated library.");
      }
      setIsOpen(true);
    };
    window.addEventListener("show-policy", handleShowPolicy);
    return () => window.removeEventListener("show-policy", handleShowPolicy);
  }, []);

  // Global click interceptor and window.open override for laptop view
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Intercept standard <a> anchor link clicks
    const handleGlobalClick = (e: MouseEvent) => {
      const isLaptopView = window.innerWidth >= 1024;
      if (!isLaptopView) return;

      let target = e.target as HTMLElement | null;
      while (target && target.tagName !== "A") {
        target = target.parentElement;
      }

      if (target && target.tagName === "A") {
        const href = target.getAttribute("href");
        const linkTarget = target.getAttribute("target");

        if (href) {
          const isExternal = href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//");
          const isCurrentOrigin = href.includes(window.location.host);
          const isYouTube = href.includes("youtube.com") || href.includes("youtu.be");
          const isDriveLink = href.includes("drive.google.com");
          const isStrategicErp = href.includes("strategicerpcloud.com");
          const isRsd = href.includes("radheshyamdas.com");

          // Block external links or links opening in another tab (exclude whitelisted Drive links, Strategic ERP, and Radheshyam Das)
          if (((isExternal && !isCurrentOrigin) || isYouTube || linkTarget === "_blank") && !isDriveLink && !isStrategicErp && !isRsd) {
            e.preventDefault();
            e.stopPropagation();

            window.dispatchEvent(new CustomEvent("show-policy", {
              detail: {
                titleMain: "External Link",
                titleHighlight: "Blocked",
                desc: "Restricted Navigation",
                content: "External links and new browser tabs are not allowed on laptop view.",
                sub: "Please continue your journey within this curated library."
              }
            }));
          }
        }
      }
    };

    // 2. Intercept programmatic window.open calls
    const originalOpen = window.open;
    window.open = function(url, target, features) {
      const isLaptopView = window.innerWidth >= 1024;
      if (isLaptopView) {
        const urlStr = String(url || "");
        const isExternal = urlStr.startsWith("http://") || urlStr.startsWith("https://") || urlStr.startsWith("//");
        const isCurrentOrigin = urlStr.includes(window.location.host);
        const isYouTube = urlStr.includes("youtube.com") || urlStr.includes("youtu.be");
        const isBlankOrSystem = target === "_blank" || target === "_system";
        const isDriveLink = urlStr.includes("drive.google.com");
        const isStrategicErp = urlStr.includes("strategicerpcloud.com");
        const isRsd = urlStr.includes("radheshyamdas.com");

        if (((isExternal && !isCurrentOrigin) || isYouTube || isBlankOrSystem) && !isDriveLink && !isStrategicErp && !isRsd) {
          console.warn("[BLOCKED] window.open blocked on laptop view:", url);
          window.dispatchEvent(new CustomEvent("show-policy", {
            detail: {
              titleMain: "External Link",
              titleHighlight: "Blocked",
              desc: "Restricted Navigation",
              content: "External links and new browser tabs are not allowed on laptop view.",
              sub: "Please continue your journey within this curated library."
            }
          }));
          return null;
        }
      }
      return originalOpen.call(window, url, target, features);
    };

    document.addEventListener("click", handleGlobalClick, true);

    return () => {
      document.removeEventListener("click", handleGlobalClick, true);
      window.open = originalOpen;
    };
  }, []);

  /**
   * IFRAME NEW-TAB DETECTOR
   *
   * Cross-origin iframes (like YouTube) run in their own JS sandbox,
   * so we cannot override window.open inside them. But the browser
   * gives us an indirect signal:
   *
   *   1. window "blur"  → focus left our window (user clicked inside iframe)
   *   2. document "visibilitychange" → hidden  → a new tab actually opened
   *
   * If BOTH happen within a short window (~300 ms), a new tab was opened
   * from inside the iframe. We respond by:
   *   a. Showing the policy modal immediately
   *   b. Calling window.focus() to pull the user back to our page
   *
   * Normal iframe interaction (play/pause video) only fires blur — the
   * page never becomes hidden — so this does NOT trigger false positives.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    let lastBlurTime = 0;

    const handleWindowBlur = () => {
      lastBlurTime = Date.now();
    };

    const handleVisibilityChange = () => {
      const timeSinceBlur = Date.now() - lastBlurTime;
      const activeEl = document.activeElement;
      const isIframeActive = activeEl?.tagName === "IFRAME" && activeEl?.id !== "strategic-erp-iframe" && activeEl?.id !== "rsd-iframe";

      // If page became hidden within 300ms of a blur, and an iframe was active, a new tab was opened from it
      if (document.hidden && timeSinceBlur < 300 && lastBlurTime > 0 && isIframeActive) {
        // Show the policy modal
        window.dispatchEvent(new CustomEvent("show-policy", {
          detail: {
            titleMain: "External Link",
            titleHighlight: "Blocked",
            desc: "New Tab Detected",
            content: "Opening YouTube or external links in a new browser tab is not permitted. Please stay within the curated library.",
            sub: "Please continue your journey within this curated library."
          }
        }));

        // Immediately bring focus back to our page
        setTimeout(() => {
          window.focus();
        }, 50);
      }

      // Reset blur tracking when user returns to this tab
      if (!document.hidden) {
        lastBlurTime = 0;
      }
    };

    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
        onClick={() => setIsOpen(false)}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-md bg-white/90 backdrop-blur-2xl rounded-[2rem] sm:rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] border border-white/20 p-6 sm:p-10 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8 duration-500">
        
        {/* Decorative Background Elements */}
        <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-48 h-48 bg-devo-500/10 blur-[60px] rounded-full" />
        <div className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-48 h-48 bg-accent-gold/10 blur-[60px] rounded-full" />

        <button 
          onClick={() => setIsOpen(false)}
          className="absolute top-6 right-6 p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-900"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative text-center space-y-4 sm:space-y-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-tr from-devo-50 to-devo-100 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto shadow-sm ring-4 ring-white">
            <ShieldAlert className="w-6 h-6 sm:w-8 h-8 text-devo-600" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-outfit font-black text-devo-950 tracking-tight leading-tight">
              {modalTitleMain} <span className="text-devo-600">{modalTitleHighlight}</span>
            </h2>
            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-devo-400 opacity-60">{modalDesc}</p>
          </div>

          <div className="bg-slate-50/50 p-5 sm:p-7 rounded-[1.5rem] border border-slate-100 text-left">
            <p className="text-xs sm:text-base text-slate-700 font-medium leading-relaxed">
              {modalContent}
            </p>
            <div className="mt-4 flex items-start gap-3">
              <div className="mt-0.5 p-1 bg-devo-500/10 rounded">
                <BookOpen className="w-3.5 h-3.5 text-devo-600" />
              </div>
              <p className="text-[11px] sm:text-sm text-slate-500 font-bold leading-normal">
                {modalSub}
              </p>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setIsOpen(false)}
              className="w-full px-6 py-3.5 sm:py-4 bg-devo-950 text-white rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl hover:shadow-devo-500/20 active:scale-95"
            >
              Stay in Library
            </button>
          </div>

          <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">
            Official Media Compliance
          </p>
        </div>
      </div>
    </div>
  );
}
