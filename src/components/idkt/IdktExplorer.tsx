"use client";

import React, { useState, useEffect } from "react";
import { Folder, Music, ChevronRight, Search, RefreshCw, ChevronLeft, Loader2, PlayCircle, ExternalLink, X, MoreVertical, Eye, EyeOff, Trash2, Clock, Check } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useMedia } from "@/context/MediaContext";
import { supabase } from "@/lib/supabase";

export default function IdktExplorer({ session, profile }: { session: any, profile: any }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  
  const [items, setItems] = useState<any[]>([]);
  const uRoles = Array.isArray(profile?.roles) ? profile.roles : [profile?.role].filter(r => r != null);
  const isSuperAdmin = uRoles.includes(1);
  const currentPath = searchParams.get("path") || "/";
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [deepSyncing, setDeepSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState("");
  const cancelSyncRef = React.useRef(false);
  const { playTrack, currentTrack, isPlaying } = useMedia();

  // Hear Later states
  const [activeTab, setActiveTab] = useState<'library' | 'favorites'>('library');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<any[]>([]);
  
  const getSpeakerName = (item: any) => {
    if (item.type === "folder") return "Sub-Directory";
    
    const path = item.full_path || "";
    if (path.includes("01_-_Srila_Prabhupada")) return "Srila Prabhupada";
    
    // Heuristic for speaker names in IDT paths
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
      if (segment.includes("H.H._") || segment.includes("H.G._")) {
         return segment
          .replace(/H\.H\._/gi, "")
          .replace(/H\.G\._/gi, "")
          .replace(/_/g, " ")
          .trim();
      }
    }
    
    return "Audio Lecture";
  };

  const loadItems = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const roleParam = isSuperAdmin ? 1 : (uRoles[0] || 6);
      const res = await fetch(`/api/idkt/browse?path=${encodeURIComponent(path)}&role=${roleParam}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load library");
      }
      const data = await res.json();
      setItems(data.items || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      if (query === "") loadItems(currentPath);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const roleParam = isSuperAdmin ? 1 : (uRoles[0] || 6);
      const res = await fetch(`/api/idkt/search?q=${encodeURIComponent(query)}&role=${roleParam}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Search failed");
      }
      const data = await res.json();
      setItems(data.items || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManageItem = async (item: any, action: 'hide' | 'unhide' | 'delete') => {
    if (action === 'delete' && !confirm(`Are you sure you want to PERMANENTLY delete this ${item.type}${item.type === 'folder' ? ' and all its contents' : ''}?`)) return;
    
    setLoading(true);
    try {
      const res = await fetch("/api/idkt/manage", {
        method: "POST",
        body: JSON.stringify({
          action,
          id: item.id,
          full_path: item.full_path,
          type: item.type,
          userRole: isSuperAdmin ? 1 : (uRoles[0] || 6)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Operation failed");
      
      if (activeTab === 'library') {
        loadItems(currentPath);
      } else {
        loadFavorites();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setLoading(false);
    }
  };

  const loadFavorites = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/user/audio-favorites", {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      if (!res.ok) throw new Error("Failed to load Hear Later list");
      
      const data = await res.json();
      setFavoriteItems(data.items || []);
      setFavoriteIds(data.favoriteIds || []);
      if (activeTab === 'favorites') {
        setItems(data.items || []);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleWatchLater = async (e: React.MouseEvent, audioId: string) => {
    e.stopPropagation();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const isRemoving = favoriteIds.includes(audioId);
      
      const res = await fetch("/api/user/audio-favorites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ audio_id: audioId })
      });

      if (res.ok) {
        if (isRemoving) {
          setFavoriteIds(prev => prev.filter(id => id !== audioId));
          setFavoriteItems(prev => prev.filter(item => item.id !== audioId));
          if (activeTab === 'favorites') {
            setItems(prev => prev.filter(item => item.id !== audioId));
          }
        } else {
          setFavoriteIds(prev => [...prev, audioId]);
          // Refresh list to get metadata if needed, but for now just updating UI state is enough 
          // if we are in library view. If in favorites view, it shouldn't happen unless we add from search.
        }
      }
    } catch (err) {
      console.error("Error toggling hear later:", err);
    }
  };

  useEffect(() => {
    loadFavorites();
  }, []);

  useEffect(() => {
    if (activeTab === 'library') {
      if (searchQuery === "") {
        loadItems(currentPath);
      }
    } else {
      loadFavorites();
    }
  }, [currentPath, searchQuery, isSuperAdmin, activeTab]);

  // Admin Sync Logic
  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/idkt/crawl", {
        method: "POST",
        body: JSON.stringify({ action: "sync_folder", path: currentPath })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");

      if (data.success) {
        loadItems(currentPath);
        // Get overall status
        const statusRes = await fetch("/api/idkt/crawl", {
          method: "POST",
          body: JSON.stringify({ action: "get_status" })
        });
        setSyncStatus(await statusRes.json());
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  // Deep Recursive Sync Logic
  const handleDeepSync = async (priorityPath: string | null = null) => {
    setDeepSyncing(true);
    setError(null);
    cancelSyncRef.current = false;
    
    try {
      // If priorityPath is provided, first ensure it's synced to find immediate children
      if (priorityPath && priorityPath !== "/") {
        const initSyncRes = await fetch("/api/idkt/crawl", {
          method: "POST",
          body: JSON.stringify({ action: "sync_folder", path: priorityPath })
        });
        if (initSyncRes.ok) {
          loadItems(currentPath);
        }
      }

      let keepScanning = true;
      while (keepScanning && !cancelSyncRef.current) {
        // 1. Get next pending folder (respecting priority path if provided)
        const statusRes = await fetch("/api/idkt/crawl", {
          method: "POST",
          body: JSON.stringify({ action: "get_status", priority_path: priorityPath })
        });
        const statusData = await statusRes.json();
        setSyncStatus(statusData);

        if (statusData.next) {
          // 2. Sync the pending folder
          try {
            const syncRes = await fetch("/api/idkt/crawl", {
              method: "POST",
              body: JSON.stringify({ action: "sync_folder", path: statusData.next })
            });
            const syncData = await syncRes.json();
            if (!syncRes.ok) {
              console.warn(`Sync failed for ${statusData.next}: ${syncData.error}`);
              // We don't throw here so the loop continues to the next available folder
            }
          } catch (fetchErr: any) {
            console.error(`Network error during sync of ${statusData.next}:`, fetchErr);
          }
          
          // Reload current view if we happen to be scanning the current directory's children
          if (statusData.next === currentPath || statusData.next.startsWith(currentPath)) {
            loadItems(currentPath);
          }

          // 3. Wait a bit to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          setDeepSyncing(false);
          const branchName = priorityPath ? priorityPath.split("/").filter(Boolean).pop() : "Global";
          alert(`Scan completed for ${branchName}!`);
          keepScanning = false;
          break; // Nothing left to scan
        }
      }
    } catch (err: any) {
      console.error("Deep sync error:", err);
      setError(err.message);
    } finally {
      setDeepSyncing(false);
    }
  };





  const handleInjectFolder = async () => {
    if (!manualPath.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/idkt/crawl", {
        method: "POST",
        body: JSON.stringify({ action: "inject_folder", parent_path: currentPath, folder_name: manualPath.trim() })
      });
      if (!res.ok) throw new Error("Injection failed");
      setManualPath("");
      loadItems(currentPath);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stopDeepSync = () => {
    cancelSyncRef.current = true;
  };

  const navigateTo = (path: string) => {
    setSearchQuery("");
    // Force immediate load to prevent UI inertia on production/live environments
    loadItems(path);
    router.push(`${pathname}?path=${encodeURIComponent(path)}`, { scroll: false });
  };

  const breadcrumbs = currentPath === "/" ? ["Home"] : ["Home", ...currentPath.split("/").filter(Boolean)];

  return (
    <div className="space-y-4 sm:space-y-8 animate-in fade-in duration-700">
      
      {/* Header & Search */}
      <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-yellow-500/10 p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] border-2 border-amber-200/80 shadow-xl shadow-amber-500/5 relative overflow-hidden">
        {/* Decorative Background Ambient Glow */}
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-amber-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-yellow-400/20 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-amber-500/20">
                <Music className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tighter uppercase font-outfit">ISKCON Desire Tree</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-xs shadow-emerald-500" />
                  <p className="text-amber-800/80 font-bold text-[9px] sm:text-[10px] uppercase tracking-widest">Digital Audio Library</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full lg:w-auto">
            {/* Tab Switcher */}
            <div className="flex bg-amber-100/70 p-1.5 rounded-xl sm:rounded-2xl border border-amber-200/80 shrink-0 w-full sm:w-auto justify-center">
              <button
                onClick={() => setActiveTab('library')}
                className={`flex items-center justify-center gap-2 px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all ${
                  activeTab === 'library' ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/20" : "text-amber-900/70 hover:text-amber-950"
                }`}
              >
                <Folder className="w-3.5 h-3.5" /> Library
              </button>
              <button
                onClick={() => setActiveTab('favorites')}
                className={`flex items-center justify-center gap-2 px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all ${
                  activeTab === 'favorites' ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/20" : "text-amber-900/70 hover:text-amber-950"
                }`}
              >
                <Clock className="w-3.5 h-3.5" /> Hear Later
              </button>
            </div>

            {/* Search Bar with stylish golden border and focus ring */}
            <div className="relative w-full lg:w-72 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500 group-focus-within:text-amber-600 transition-colors" />
              <input
                type="text"
                placeholder="Search lectures..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleSearch(e.target.value);
                }}
                className="w-full bg-white border-2 border-amber-300/80 hover:border-amber-400 focus:border-amber-500 pl-11 pr-4 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl outline-none font-bold text-[11px] sm:text-xs text-slate-900 placeholder:text-slate-400 focus:ring-4 focus:ring-amber-500/20 transition-all shadow-xs"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <button 
                onClick={handleSync}
                disabled={syncing || deepSyncing}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-3.5 sm:px-4.5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[9px] sm:text-[10px] transition-all shadow-md active:scale-95 disabled:opacity-50"
                title="Sync this current directory only"
              >
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" /> : <RefreshCw className="w-3.5 h-3.5 text-amber-400" />}
                {syncing ? "Syncing..." : "Sync Here"}
              </button>

              {isSuperAdmin && (
                <div className="flex items-center gap-2 flex-1 sm:flex-none">
                  {deepSyncing ? (
                    <button 
                      onClick={stopDeepSync}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-red-600 text-white px-3.5 sm:px-4.5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[9px] sm:text-[10px] hover:bg-red-700 transition-all shadow-md active:scale-95"
                    >
                      <X className="w-3.5 h-3.5" /> Stop
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={() => handleDeepSync(null)}
                        disabled={syncing}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-3.5 sm:px-4.5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[9px] sm:text-[10px] hover:from-amber-600 hover:to-orange-600 transition-all shadow-md shadow-amber-500/20 active:scale-95 disabled:opacity-50"
                        title="Recursively scan all undiscovered folders globally"
                      >
                        <Search className="w-3.5 h-3.5" /> Global
                      </button>

                      {currentPath !== "/" && (
                        <button 
                          onClick={() => handleDeepSync(currentPath)}
                          disabled={syncing}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-amber-700 text-white px-3.5 sm:px-4.5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[9px] sm:text-[10px] hover:bg-amber-800 transition-all shadow-md shadow-amber-700/20 active:scale-95 disabled:opacity-50"
                          title="Recursively scan folders inside this directory first"
                        >
                          <Folder className="w-3.5 h-3.5" /> Deep
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Sync Status Badge */}
        {syncStatus && (
          <div className="mt-4 sm:mt-6 flex flex-col gap-3 sm:gap-4 bg-orange-50/50 p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2.5rem] border border-orange-100 animate-in zoom-in-95">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-3">
                <div className="bg-white p-2 rounded-xl shadow-sm">
                  {deepSyncing ? <Loader2 className="w-3.5 h-3.5 text-orange-500 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-orange-500" />}
                </div>
                <div>
                  <p className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Library Size</p>
                  <p className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">{syncStatus.total} Items</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="bg-white p-2 rounded-xl shadow-sm">
                  <Folder className="w-3.5 h-3.5 text-orange-500" />
                </div>
                <div>
                  <p className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Sync</p>
                  <p className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">{syncStatus.pending} Folders</p>
                </div>
              </div>
            </div>
            
            {deepSyncing && syncStatus.next && (
              <div className="w-full pt-3 sm:pt-4 border-t border-orange-100/50">
                <div className="flex items-center justify-between mb-2 gap-4">
                  <p className="text-[8px] sm:text-[9px] font-black text-orange-500 uppercase tracking-widest flex items-center gap-2 shrink-0">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                    </span>
                    Now Discovering
                  </p>
                  <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 truncate flex-1 text-right">{syncStatus.next}</span>
                </div>
                <div className="h-1 sm:h-1.5 bg-white rounded-full overflow-hidden shadow-inner">
                  <div className="h-full bg-linear-to-r from-orange-400 to-orange-600 w-full animate-progress" />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="absolute top-0 right-0 w-64 h-64 bg-linear-to-bl from-orange-100/30 to-transparent rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-100 p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] flex items-center gap-4 animate-in slide-in-from-top-4 duration-500">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
            <X className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
          </div>
          <div className="min-w-0">
            <h4 className="text-[11px] sm:text-sm font-black text-red-900 uppercase tracking-tight">System Error</h4>
            <p className="text-[10px] sm:text-[11px] font-bold text-red-600 mt-0.5 truncate">{error}</p>
          </div>
        </div>
      )}



      {/* Explorer Content */}
      <div className="bg-white/40 backdrop-blur-sm rounded-[2rem] sm:rounded-[3rem] border border-white/40 overflow-hidden shadow-sm">
        
        {/* Breadcrumbs */}
        <div className="px-5 sm:px-10 py-4 sm:py-5 bg-white/60 border-b border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              <button 
                onClick={() => {
                  if (crumb === "Home") navigateTo("/");
                  else {
                    const idxInPath = breadcrumbs.indexOf(crumb);
                    const newPath = "/" + breadcrumbs.slice(1, idxInPath + 1).join("/");
                    navigateTo(newPath + "/");
                  }
                }}
                className={`text-[9px] sm:text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors ${idx === breadcrumbs.length - 1 ? "text-orange-600" : "text-slate-400 hover:text-slate-900"}`}
              >
                {crumb}
              </button>
              {idx < breadcrumbs.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />}
            </React.Fragment>
          ))}
        </div>

        {/* List View */}
        <div className="min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 sm:p-32 gap-4">
              <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-orange-200 animate-spin" />
              <p className="text-[9px] sm:text-[10px] font-black text-slate-300 uppercase tracking-widest text-center">Scanning Repository...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 sm:p-32 text-center space-y-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center mb-2 border border-slate-100">
                <Search className="w-6 h-6 sm:w-8 sm:h-8 text-slate-200" />
              </div>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase">No content found</h3>
              <p className="text-slate-400 font-bold text-[11px] sm:text-xs max-w-xs mx-auto">This folder hasn't been synced yet or there are no lectures matching your search.</p>
              {isSuperAdmin && (
                <div className="mt-8 flex flex-col items-center w-full max-w-sm mx-auto bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm">
                  <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Manual Override</p>
                  <p className="text-[9px] sm:text-[10px] text-slate-500 mb-4 px-2 italic">Some top-level folders are hidden. Manually inject a sub-folder to bridge the gap.</p>
                  <div className="flex w-full gap-2">
                    <input
                      type="text"
                      placeholder="Folder name..."
                      value={manualPath}
                      onChange={(e) => setManualPath(e.target.value)}
                      className="flex-1 min-w-0 bg-slate-50 border border-slate-100 px-4 py-3 rounded-xl outline-none font-bold text-xs focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all"
                    />
                    <button 
                      onClick={handleInjectFolder}
                      disabled={!manualPath.trim() || loading}
                      className="bg-indigo-600 text-white px-4 py-3 rounded-xl font-black uppercase tracking-widest text-[9px] hover:bg-indigo-700 transition-all shadow-md active:scale-95 disabled:opacity-50 shrink-0"
                    >
                      Inject
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 sm:p-5 space-y-3 sm:space-y-4 bg-slate-50/70">
              {items.map((item) => (
                <div 
                  key={item.id} 
                  className={`group flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:px-6 sm:py-5 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md hover:border-orange-300 transition-all cursor-pointer gap-3 sm:gap-4 ${
                    currentTrack?.id === item.id ? "ring-2 ring-orange-500/50 border-orange-300 bg-orange-50/30" : ""
                  } ${item.is_hidden ? "opacity-40 grayscale-[0.5]" : ""}`}
                  onClick={() => {
                    if (item.type === "folder") {
                      navigateTo(item.full_path);
                    } else {
                      // Check if we have progress data for this track
                      const favVersion = favoriteItems.find(f => f.id === item.id);
                      // Only include audio items in the playlist
                      const audioPlaylist = items.filter((i: any) => i.type === "audio");
                      playTrack(favVersion || item, audioPlaylist);
                    }
                  }}
                >
                  {/* Top Section: Icon & Full Width Title */}
                  <div className="flex items-start sm:items-center gap-2.5 sm:gap-5 min-w-0 flex-1 w-full">
                    <div className={`w-9 h-9 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl shrink-0 shadow-xs transition-all group-hover:scale-105 mt-0.5 sm:mt-0 ${item.type === "folder" ? "bg-orange-50 text-orange-600 border border-orange-100" : "bg-indigo-50 text-indigo-600 border border-indigo-100"}`}>
                      {item.type === "folder" ? <Folder className="w-4.5 h-4.5 sm:w-6 sm:h-6" /> : <Music className="w-4.5 h-4.5 sm:w-6 sm:h-6" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className={`font-bold text-[13px] sm:text-base leading-snug line-clamp-2 sm:line-clamp-1 transition-colors ${currentTrack?.id === item.id ? "text-orange-600" : "text-slate-900 group-hover:text-orange-600"}`}>
                          {item.name}
                        </h4>
                        {item.is_hidden && (
                          <span className="bg-slate-900 text-white text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0">Hidden</span>
                        )}
                      </div>
                      <p className="hidden sm:block text-[9px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 sm:mt-1">
                        {getSpeakerName(item)}
                      </p>
                    </div>
                  </div>

                  {/* Bottom Row on Mobile / Right Controls on Desktop */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <p className="sm:hidden text-[9px] font-extrabold text-slate-500 uppercase tracking-wider truncate max-w-[170px]">
                      {getSpeakerName(item)}
                    </p>

                    <div className="flex items-center gap-1.5 sm:gap-4 ml-auto">
                      {/* Admin Actions */}
                      {isSuperAdmin && (
                        <div className="flex items-center gap-1 sm:gap-2 mr-1 sm:mr-2 border-r border-slate-100 pr-1.5 sm:pr-4">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleManageItem(item, item.is_hidden ? 'unhide' : 'hide');
                            }}
                            className={`p-1.5 sm:p-2 rounded-lg transition-all ${item.is_hidden ? "bg-orange-500 text-white" : "bg-slate-50 text-slate-400 hover:bg-slate-900 hover:text-white"}`}
                            title={item.is_hidden ? "Show to public" : "Hide from public"}
                          >
                            {item.is_hidden ? <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleManageItem(item, 'delete');
                            }}
                            className="p-1.5 sm:p-2 bg-slate-50 text-slate-400 hover:bg-red-600 hover:text-white rounded-lg transition-all"
                            title="Delete recursively"
                          >
                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                        </div>
                      )}

                      {item.type === "audio" && (
                        <>
                          <button 
                            onClick={(e) => toggleWatchLater(e, item.id)}
                            className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl transition-all border ${
                              favoriteIds.includes(item.id) 
                                ? "bg-orange-600 border-orange-600 text-white" 
                                : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-orange-50 hover:text-orange-600"
                            }`}
                            title={favoriteIds.includes(item.id) ? "Remove from Hear Later" : "Add to Hear Later"}
                          >
                            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const audioPlaylist = items.filter((i: any) => i.type === "audio");
                              playTrack(item, audioPlaylist);
                            }}
                            className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl transition-all ${currentTrack?.id === item.id && isPlaying ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"}`}
                          >
                            <PlayCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                          <a 
                            href={item.url} 
                            target="_blank" 
                            onClick={(e) => e.stopPropagation()}
                            className="hidden sm:flex p-2.5 bg-slate-50 text-slate-400 hover:bg-indigo-100 hover:text-indigo-600 rounded-xl transition-all"
                            title="Direct Link"
                          >
                            <ExternalLink className="w-5 h-5" />
                          </a>
                        </>
                      )}
                      {item.type === "folder" && (
                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-200 group-hover:text-orange-400 transition-colors" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
