"use client";

import { useState, useEffect } from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings, Monitor, UserCheck, CalendarDays, BookOpen, MoreHorizontal, X, User, Shield, Users, Plane, Bell, Music, Download, ExternalLink, Film, ShoppingCart } from "lucide-react";
import ProfileEdit from "./ProfileEdit";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/useProfile";
import { useVmInchargeAccess } from "@/hooks/useVmInchargeAccess";
import { useStoreAccess, clearStoreAccessCache } from "@/hooks/useStoreAccess";

export default function Navbar() {
  const pathname = usePathname();
  const [session, setSession] = useState<any>(null);
  const { profile, isBcdb, isManager, isSuperAdmin, isAttendanceIncharge, isVmIncharge, refreshProfile } = useProfile(session);
  const { hasStoreAccess } = useStoreAccess(session);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showDesktopMore, setShowDesktopMore] = useState(false);
  const canOpenAttendance = isBcdb || isSuperAdmin || isAttendanceIncharge || isVmIncharge;

  // New imports for mobile bar
  const HomeIcon = ({ active }: { active?: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-home">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
  
  const Youtube = ({ className, active }: { className?: string, active?: boolean }) => (
    <svg 
      viewBox="0 0 24 24" 
      fill={active ? "currentColor" : "none"} 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={`lucide lucide-youtube ${className}`}
    >
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.42a2.78 2.78 0 0 0-1.94 2C1 8.14 1 12 1 12s0 3.86.46 5.58a2.78 2.78 0 0 0 1.94 2c1.72.42 8.6.42 8.6.42s6.88 0 8.6-.42a2.78 2.78 0 0 0 1.94-2C23 15.86 23 12 23 12s0-3.86-.46-5.58z" />
      <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill={active ? "white" : "none"} />
    </svg>
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return session?.user?.email?.[0].toUpperCase() || "U";
  };

  const isHome = pathname === "/";
  const isClass = pathname === "/class";
  const isYatra = pathname.startsWith('/yatra');
  const isBcClass = pathname === '/bc-class';
  const isShorts = pathname === '/shorts';
  const isStore = pathname.startsWith('/store');
  const isAttendance = pathname === "/attendance";
  const isIdkt = pathname === "/iskcon-desire-tree";

  if (pathname === "/login" || pathname === "/register/bcdb" || pathname.startsWith("/store/quick-request")) {
    return null;
  }

  return (
    <>
      {/* ─── DESKTOP NAVBAR (Top) ─────────────────────────── */}
      <nav className="hidden md:flex justify-between items-center h-20 bg-white/90 backdrop-blur-lg sticky top-0 z-[100] border-b border-devo-100/50 shadow-sm px-8">
        <NextLink href="/" className="flex items-center gap-3 group shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-devo-500 to-orange-400 flex items-center justify-center text-white font-outfit font-bold shadow-md group-hover:shadow-lg transition-all group-hover:scale-110">
            SE
          </div>
          <span className="font-outfit text-xl font-bold text-devo-950 tracking-tight">
            Spiritual Echoes
          </span>
        </NextLink>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:bg-white hover:border-devo-200 transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-devo-100 flex items-center justify-center text-devo-600 font-black text-xs group-hover:bg-devo-600 group-hover:text-white transition-colors">
              {getInitials()}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-devo-900">My Profile</span>
          </button>


          <NextLink 
            href="/class" 
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all group shadow-sm ${isClass ? 'bg-orange-600 text-white border-orange-600 shadow-orange-200' : 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-600 hover:text-white'}`}
          >
            <div className="flex items-center justify-center relative">
               <Youtube className="w-5 h-5" active={isClass} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-inherit">BC Class</span>
          </NextLink>

          {isBcdb && (
            <NextLink 
              href="/shorts" 
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all group shadow-sm ${isShorts ? 'bg-orange-600 text-white border-orange-600 shadow-orange-200' : 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-600 hover:text-white'}`}
            >
              <div className="flex items-center justify-center relative">
                 <Film className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-inherit">Shorts</span>
            </NextLink>
          )}
          
          {canOpenAttendance && (
            <NextLink 
              href="/attendance" 
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all group shadow-sm ${isAttendance ? 'bg-orange-950 text-white border-orange-950 shadow-orange-100' : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-white hover:border-devo-200'}`}
            >
              <div className="flex items-center justify-center relative">
                 <CalendarDays className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-inherit">My Attendance</span>
            </NextLink>
          )}

          <NextLink 
            href="/iskcon-desire-tree" 
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all group shadow-sm ${isIdkt ? 'bg-orange-600 text-white border-orange-600 shadow-orange-200' : 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-white'}`}
          >
            <div className="flex items-center justify-center relative">
               <Music className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-inherit">Desire Tree</span>
          </NextLink>

          {hasStoreAccess && (
            <NextLink 
              href="/store/request" 
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all group shadow-sm ${isStore ? 'bg-teal-600 text-white border-teal-600 shadow-teal-200' : 'bg-teal-50 text-teal-600 border-teal-100 hover:bg-white'}`}
            >
              <div className="flex items-center justify-center relative">
                 <ShoppingCart className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-inherit">Samvardhan</span>
            </NextLink>
          )}

          {/* Desktop "More" Dropdown */}
          <div className="relative">
             <button 
               onClick={() => setShowDesktopMore(!showDesktopMore)}
               className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all shadow-sm ${showDesktopMore ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-white'}`}
             >
                <MoreHorizontal className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">More</span>
             </button>

             {showDesktopMore && (
               <>
                 <div className="fixed inset-0 z-10" onClick={() => setShowDesktopMore(false)} />
                 <div className="absolute top-full right-0 mt-3 w-64 bg-white/95 backdrop-blur-3xl rounded-3xl border border-slate-200/50 shadow-2xl p-2 z-20 animate-in zoom-in-95 fade-in duration-200">


                    <NextLink 
                      href="/notifications" 
                      onClick={() => setShowDesktopMore(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${pathname === '/notifications' ? 'bg-purple-50 text-purple-700' : 'hover:bg-slate-50 text-slate-600'}`}
                    >
                      <Bell className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest flex-1">Notifications</span>
                      <div className={`w-1 h-1 rounded-full bg-purple-500 ${pathname === '/notifications' ? 'opacity-100' : 'opacity-0'}`} />
                    </NextLink>

                    {isBcdb && (
                      <NextLink 
                        href="/prasadam-count" 
                        onClick={() => setShowDesktopMore(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${pathname === '/prasadam-count' ? 'bg-orange-50 text-orange-700' : 'hover:bg-slate-50 text-slate-600'}`}
                      >
                        <UserCheck className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest flex-1">Prasadam Count</span>
                        <div className={`w-1 h-1 rounded-full bg-orange-500 ${pathname === '/prasadam-count' ? 'opacity-100' : 'opacity-0'}`} />
                      </NextLink>
                    )}

                    {isBcdb && (
                      <NextLink 
                        href="/raise-prasadam" 
                        onClick={() => setShowDesktopMore(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${pathname === '/raise-prasadam' ? 'bg-orange-50 text-orange-700' : 'hover:bg-slate-50 text-slate-600'} group`}
                      >
                        <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-orange-600 transition-colors" />
                        <span className="text-[10px] font-black uppercase tracking-widest flex-1">ICS - Raise Prasadam Count</span>
                        <div className={`w-1 h-1 rounded-full bg-orange-500 ${pathname === '/raise-prasadam' ? 'opacity-100' : 'opacity-0'}`} />
                      </NextLink>
                    )}


                    {isBcdb && (
                      <NextLink 
                        href="/policy-manual" 
                        onClick={() => setShowDesktopMore(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${pathname === '/policy-manual' ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-600'}`}
                      >
                        <BookOpen className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest flex-1">Policy Manual</span>
                        <div className={`w-1 h-1 rounded-full bg-indigo-500 ${pathname === '/policy-manual' ? 'opacity-100' : 'opacity-0'}`} />
                      </NextLink>
                    )}

                    {isBcdb && (
                      <NextLink 
                        href="/directory" 
                        onClick={() => setShowDesktopMore(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${pathname === '/directory' ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50 text-slate-600'}`}
                      >
                        <Users className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest flex-1">Devotee Directory</span>
                        <div className={`w-1 h-1 rounded-full bg-emerald-500 ${pathname === '/directory' ? 'opacity-100' : 'opacity-0'}`} />
                      </NextLink>
                    )}

                    {(isBcdb || isManager) && (
                      <NextLink 
                        href="/travel-desk" 
                        onClick={() => setShowDesktopMore(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${pathname === '/travel-desk' ? 'bg-sky-50 text-sky-700' : 'hover:bg-slate-50 text-slate-600'}`}
                      >
                        <Plane className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest flex-1">Travel Desk</span>
                        <div className={`w-1 h-1 rounded-full bg-sky-500 ${pathname === '/travel-desk' ? 'opacity-100' : 'opacity-0'}`} />
                      </NextLink>
                    )}

                    {isManager && (
                      <NextLink 
                        href="/admin" 
                        onClick={() => setShowDesktopMore(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${pathname.startsWith('/admin') ? 'bg-devo-50 text-devo-700' : 'hover:bg-slate-50 text-slate-600'}`}
                      >
                        <Settings className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest flex-1">Admin Panel</span>
                        <div className={`w-1 h-1 rounded-full bg-devo-500 ${pathname.startsWith('/admin') ? 'opacity-100' : 'opacity-0'}`} />
                      </NextLink>
                    )}



                    <a 
                      href="https://drive.google.com/file/d/14zhPYRBLjcnSBgT7GHmAKpWDKvZ48L9k/view?usp=drive_link" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={() => setShowDesktopMore(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all hover:bg-emerald-50 text-slate-600 hover:text-emerald-700"
                    >
                      <Download className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest flex-1">Download Android App</span>
                    </a>

                    <div className="my-2 border-t border-slate-100" />
                    
                    <button 
                      onClick={async () => { clearStoreAccessCache(); await supabase.auth.signOut(); window.location.href = "/"; }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all text-left group"
                    >
                      <LogOut className="w-4 h-4 transition-colors" />
                      <span className="text-[10px] font-black uppercase tracking-widest flex-1">Logout Session</span>
                    </button>
                 </div>
               </>
             )}
          </div>
        </div>
      </nav>

      {/* ─── MOBILE TOP HEADER (Scrollable) ────────────────── */}
      <nav className="md:hidden relative h-16 z-[100] bg-white border-b border-slate-100 px-4 flex items-center justify-between">
        <NextLink href="/" className="flex items-center gap-2 group shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-devo-500 to-orange-400 flex items-center justify-center text-white font-outfit font-black text-[10px] shadow-sm">
            SE
          </div>
          <span className="font-outfit text-sm font-bold text-devo-950 tracking-tight">
            Spiritual Echoes
          </span>
        </NextLink>

        <div className="flex items-center gap-2">
          {isManager && (
            <NextLink href="/admin" className={`p-2 active:scale-95 transition-all ${pathname.startsWith('/admin') ? 'text-devo-600' : 'text-slate-400 hover:text-devo-600'}`}>
              <Settings className="w-5 h-5" />
            </NextLink>
          )}
          <button 
            onClick={() => setShowProfileModal(true)}
            className="w-9 h-9 rounded-full bg-devo-100 border-2 border-white shadow-sm flex items-center justify-center text-devo-700 font-black text-[10px] active:scale-90 transition-all overflow-hidden"
          >
            {getInitials()}
          </button>
        </div>
      </nav>

      {/* ─── MOBILE TAB BAR (Bottom) ─────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[1000] bg-white border-t border-slate-200 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] px-4 pt-3 pb-3 flex items-center justify-between gap-1" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        <NextLink href="/" className="flex flex-col items-center gap-1 group flex-1">
          <div className={`p-2 rounded-xl group-active:scale-95 transition-all ${isHome ? 'bg-devo-50 text-devo-600 shadow-inner' : 'text-slate-400'}`}>
            <HomeIcon active={isHome} /> 
          </div>
          <span className={`text-[9px] font-black uppercase tracking-widest ${isHome ? 'text-devo-600' : 'text-slate-400'}`}>Home</span>
        </NextLink>
        <NextLink href="/class" className="flex flex-col items-center gap-1 group flex-1">
          <div className={`p-2 rounded-xl group-active:scale-95 transition-all ${isClass ? 'bg-devo-50 text-devo-600 shadow-inner' : 'text-slate-400'}`}>
             <Youtube className="w-6 h-6" active={isClass} />
          </div>
          <span className={`text-[9px] font-black uppercase tracking-widest ${isClass ? 'text-devo-600' : 'text-slate-400'}`}>BC Class</span>
        </NextLink>

        <NextLink href="/shorts" className="flex flex-col items-center gap-1 group flex-1">
          <div className={`p-2 rounded-xl group-active:scale-95 transition-all ${isShorts ? 'bg-devo-50 text-devo-600 shadow-inner' : 'text-slate-400'}`}>
             <Film className="w-6 h-6" />
          </div>
          <span className={`text-[9px] font-black uppercase tracking-widest ${isShorts ? 'text-devo-600' : 'text-slate-400'}`}>Shorts</span>
        </NextLink>


        {hasStoreAccess ? (
          <NextLink href="/store/request" className="flex flex-col items-center gap-1 group flex-1">
            <div className={`p-2 rounded-xl group-active:scale-95 transition-all ${isStore ? 'bg-devo-50 text-devo-600 shadow-inner' : 'text-slate-400'}`}>
               <ShoppingCart className="w-6 h-6" />
            </div>
            <span className={`text-[9px] font-black uppercase tracking-widest ${isStore ? 'text-devo-600' : 'text-slate-400'}`}>Samvardhan</span>
          </NextLink>
        ) : (
          <NextLink href="/iskcon-desire-tree" className="flex flex-col items-center gap-1 group flex-1">
            <div className={`p-2 rounded-xl group-active:scale-95 transition-all ${isIdkt ? 'bg-devo-50 text-devo-600 shadow-inner' : 'text-slate-400'}`}>
               <Music className="w-6 h-6" />
            </div>
            <span className={`text-[9px] font-black uppercase tracking-widest ${isIdkt ? 'text-devo-600' : 'text-slate-400'}`}>Desire Tree</span>
          </NextLink>
        )}

        <button 
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          className="flex flex-col items-center gap-1 group flex-1"
        >
          <div className={`p-2 rounded-xl group-active:scale-95 transition-all ${showMoreMenu ? 'bg-indigo-50 text-indigo-600 shadow-inner' : 'text-slate-400'}`}>
             {showMoreMenu ? <X className="w-6 h-6" /> : <MoreHorizontal className="w-6 h-6" />}
          </div>
          <span className={`text-[9px] font-black uppercase tracking-widest ${showMoreMenu ? 'text-indigo-600' : 'text-slate-400'}`}>{showMoreMenu ? 'Close' : 'More'}</span>
        </button>
      </nav>

      {/* ─── MOBILE MORE MENU OVERLAY ──────────────────────── */}
      {showMoreMenu && (
        <div className="fixed inset-0 z-[1000] md:hidden animate-in fade-in duration-300">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowMoreMenu(false)}
          />
          <div className="absolute left-4 right-4 bg-white/95 backdrop-blur-3xl rounded-[2rem] border border-slate-200/50 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" }}>
            <div className="flex flex-col py-2">
              {canOpenAttendance && (
                <NextLink 
                  href="/attendance" 
                  onClick={() => setShowMoreMenu(false)}
                  className={`flex items-center gap-4 px-6 py-3.5 transition-all ${pathname === '/attendance' ? 'bg-orange-50/50 text-orange-900 border-l-4 border-orange-600' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                  <CalendarDays className={`w-4 h-4 ${pathname === '/attendance' ? 'text-orange-600' : 'text-slate-400'}`} />
                  <span className={`text-[11px] font-black uppercase tracking-widest flex-1 ${pathname === '/attendance' ? 'text-orange-900' : 'text-slate-600'}`}>My Attendance</span>
                  <div className={`w-1.5 h-1.5 rounded-full bg-orange-600 ${pathname === '/attendance' ? 'opacity-100' : 'opacity-0'}`} />
                </NextLink>
              )}


              <NextLink 
                href="/notifications" 
                onClick={() => setShowMoreMenu(false)}
                className={`flex items-center gap-4 px-6 py-3.5 transition-all ${pathname === '/notifications' ? 'bg-purple-50/50' : 'hover:bg-slate-50'}`}
              >
                <Bell className={`w-4 h-4 ${pathname === '/notifications' ? 'text-purple-600' : 'text-slate-400'}`} />
                <span className={`text-[11px] font-black uppercase tracking-widest flex-1 ${pathname === '/notifications' ? 'text-purple-900' : 'text-slate-600'}`}>Notifications</span>
                <div className={`w-1.5 h-1.5 rounded-full bg-purple-500 ${pathname === '/notifications' ? 'opacity-100' : 'opacity-0'}`} />
              </NextLink>

              {isBcdb && (
                <NextLink 
                  href="/prasadam-count" 
                  onClick={() => setShowMoreMenu(false)}
                  className={`flex items-center gap-4 px-6 py-3.5 transition-all ${pathname === '/prasadam-count' ? 'bg-orange-50/50' : 'hover:bg-slate-50'}`}
                >
                  <UserCheck className={`w-4 h-4 ${pathname === '/prasadam-count' ? 'text-orange-600' : 'text-slate-400'}`} />
                  <span className={`text-[11px] font-black uppercase tracking-widest flex-1 ${pathname === '/prasadam-count' ? 'text-orange-900' : 'text-slate-600'}`}>Prasadam Count</span>
                  <div className={`w-1.5 h-1.5 rounded-full bg-orange-500 ${pathname === '/prasadam-count' ? 'opacity-100' : 'opacity-0'}`} />
                </NextLink>
              )}

              {isBcdb && (
                <NextLink 
                  href="/raise-prasadam" 
                  onClick={() => setShowMoreMenu(false)}
                  className={`flex items-center gap-4 px-6 py-3.5 transition-all ${pathname === '/raise-prasadam' ? 'bg-orange-50/50' : 'hover:bg-slate-50'} group`}
                >
                  <ExternalLink className={`w-4 h-4 ${pathname === '/raise-prasadam' ? 'text-orange-600' : 'text-slate-400 group-hover:text-orange-600'} transition-colors`} />
                  <span className={`text-[11px] font-black uppercase tracking-widest flex-1 ${pathname === '/raise-prasadam' ? 'text-orange-900' : 'text-slate-600 group-hover:text-orange-900'} transition-colors`}>ICS - Raise Prasadam Count</span>
                  <div className={`w-1.5 h-1.5 rounded-full bg-orange-600 ${pathname === '/raise-prasadam' ? 'opacity-100' : 'opacity-0'}`} />
                </NextLink>
              )}


              {isBcdb && (
                <NextLink 
                  href="/policy-manual" 
                  onClick={() => setShowMoreMenu(false)}
                  className={`flex items-center gap-4 px-6 py-3.5 transition-all ${pathname === '/policy-manual' ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}
                >
                  <BookOpen className={`w-4 h-4 ${pathname === '/policy-manual' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className={`text-[11px] font-black uppercase tracking-widest flex-1 ${pathname === '/policy-manual' ? 'text-indigo-900' : 'text-slate-600'}`}>Policy Manual</span>
                  <div className={`w-1.5 h-1.5 rounded-full bg-indigo-500 ${pathname === '/policy-manual' ? 'opacity-100' : 'opacity-0'}`} />
                </NextLink>
              )}

              {isBcdb && (
                <NextLink 
                  href="/directory" 
                  onClick={() => setShowMoreMenu(false)}
                  className={`flex items-center gap-4 px-6 py-3.5 transition-all ${pathname === '/directory' ? 'bg-emerald-50/50' : 'hover:bg-slate-50'}`}
                >
                  <Users className={`w-4 h-4 ${pathname === '/directory' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className={`text-[11px] font-black uppercase tracking-widest flex-1 ${pathname === '/directory' ? 'text-emerald-900' : 'text-slate-600'}`}>Devotee Directory</span>
                  <div className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${pathname === '/directory' ? 'opacity-100' : 'opacity-0'}`} />
                </NextLink>
              )}

              {(isBcdb || isManager) && (
                <NextLink 
                  href="/travel-desk" 
                  onClick={() => setShowMoreMenu(false)}
                  className={`flex items-center gap-4 px-6 py-3.5 transition-all ${pathname === '/travel-desk' ? 'bg-sky-50/50' : 'hover:bg-slate-50'}`}
                >
                  <Plane className={`w-4 h-4 ${pathname === '/travel-desk' ? 'text-sky-600' : 'text-slate-400'}`} />
                  <span className={`text-[11px] font-black uppercase tracking-widest flex-1 ${pathname === '/travel-desk' ? 'text-sky-900' : 'text-slate-600'}`}>Travel Desk</span>
                  <div className={`w-1.5 h-1.5 rounded-full bg-sky-500 ${pathname === '/travel-desk' ? 'opacity-100' : 'opacity-0'}`} />
                </NextLink>
              )}

              {hasStoreAccess && (
                <NextLink 
                  href="/iskcon-desire-tree" 
                  onClick={() => setShowMoreMenu(false)}
                  className={`flex items-center gap-4 px-6 py-3.5 transition-all ${pathname === '/iskcon-desire-tree' ? 'bg-orange-50/50' : 'hover:bg-slate-50'}`}
                >
                  <Music className={`w-4 h-4 ${pathname === '/iskcon-desire-tree' ? 'text-orange-600' : 'text-slate-400'}`} />
                  <span className={`text-[11px] font-black uppercase tracking-widest flex-1 ${pathname === '/iskcon-desire-tree' ? 'text-orange-900' : 'text-slate-600'}`}>Desire Tree</span>
                  <div className={`w-1.5 h-1.5 rounded-full bg-orange-500 ${pathname === '/iskcon-desire-tree' ? 'opacity-100' : 'opacity-0'}`} />
                </NextLink>
              )}

              <button 
                onClick={() => { setShowProfileModal(true); setShowMoreMenu(false); }}
                className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-all text-left"
              >
                <User className="w-4 h-4 text-slate-400" />
                <span className="text-[11px] font-black uppercase tracking-widest flex-1 text-slate-600">My Profile</span>
              </button>

              {isManager && (
                <NextLink 
                  href="/admin" 
                  onClick={() => setShowMoreMenu(false)}
                  className={`flex items-center gap-4 px-6 py-3.5 transition-all ${pathname.startsWith('/admin') ? 'bg-devo-50/50' : 'hover:bg-slate-50'}`}
                >
                  <Shield className={`w-4 h-4 ${pathname.startsWith('/admin') ? 'text-devo-600' : 'text-slate-400'}`} />
                  <span className={`text-[11px] font-black uppercase tracking-widest flex-1 ${pathname.startsWith('/admin') ? 'text-devo-950' : 'text-slate-600'}`}>Admin Panel</span>
                  <div className={`w-1.5 h-1.5 rounded-full bg-devo-500 ${pathname.startsWith('/admin') ? 'opacity-100' : 'opacity-0'}`} />
                </NextLink>
              )}

              <a 
                href="https://drive.google.com/file/d/14zhPYRBLjcnSBgT7GHmAKpWDKvZ48L9k/view?usp=drive_link" 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={() => setShowMoreMenu(false)}
                className="flex items-center gap-4 px-6 py-3.5 hover:bg-emerald-50 transition-all text-left group"
              >
                <Download className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                <span className="text-[11px] font-black uppercase tracking-widest flex-1 text-slate-600 group-hover:text-emerald-700 transition-colors">Download Android App</span>
              </a>

              <div className="my-2 mx-4 border-t border-slate-100" />

              <button 
                onClick={async () => { clearStoreAccessCache(); await supabase.auth.signOut(); window.location.href = "/"; }}
                className="flex items-center gap-4 px-6 py-3.5 hover:bg-red-50 transition-all text-left group"
              >
                <LogOut className="w-4 h-4 text-slate-300 group-hover:text-red-500 transition-colors" />
                <span className="text-[11px] font-black uppercase tracking-widest flex-1 text-slate-400 group-hover:text-red-600 transition-colors">Logout Session</span>
              </button>
            </div>
            
            <div className="bg-slate-50/80 px-6 py-4 border-t border-slate-200/50 flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-devo-700 font-black text-[10px] border border-slate-200 shadow-sm">
                    {getInitials()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-black text-slate-900 truncate uppercase tracking-tighter leading-none">{profile?.full_name || 'Member'}</div>
                    <div className="text-[8px] font-bold text-slate-400 truncate uppercase mt-1 tracking-tight">{session?.user?.email}</div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {showProfileModal && (
        <ProfileEdit 
          session={session} 
          profile={profile} 
          isBcdb={isBcdb}
          onUpdate={refreshProfile} 
          onClose={() => setShowProfileModal(false)} 
        />
      )}
    </>
  );
}
