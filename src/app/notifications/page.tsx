"use client";

import React from "react";
import NotificationsHistoryList from "@/components/NotificationsHistoryList";
import { Bell, ShieldCheck } from "lucide-react";

export default function NotificationsPage() {
  return (
    <div>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        
        {/* Header Section */}
        <div className="mb-12 relative overflow-hidden bg-gradient-to-br from-purple-900 via-indigo-950 to-slate-900 rounded-[2.5rem] p-8 sm:p-12 text-white shadow-2xl border border-white/5">
           <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-purple-500/20 rounded-full -mr-[200px] -mt-[200px] blur-[100px]" />
           <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-3">
                 <div className="w-12 h-12 bg-white/10 backdrop-blur-2xl rounded-2xl flex items-center justify-center border border-white/10 shadow-inner">
                    <Bell className="w-6 h-6 text-purple-300" />
                 </div>
                 <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-purple-300 opacity-60">Communication Hub</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                       <ShieldCheck className="w-3 h-3 text-emerald-400" />
                       <span className="text-[9px] font-bold text-emerald-400/80 uppercase tracking-widest">Official Broadcasts</span>
                    </div>
                 </div>
              </div>
              <h1 className="text-4xl sm:text-6xl font-black tracking-tighter font-outfit leading-none">News & <span className="text-purple-400">Updates</span></h1>
              <p className="text-slate-300 font-bold max-w-xl text-sm sm:text-base opacity-70 leading-relaxed font-outfit">
                Stay connected with the latest announcements, schedule changes, and community updates delivered directly to your device.
              </p>
           </div>
        </div>

        {/* History List Section */}
        <div className="space-y-6">
           <div className="flex items-center justify-between px-4">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 italic">Recent Activity</h2>
              <div className="h-px bg-slate-200 flex-1 ml-6 hidden sm:block opacity-50" />
           </div>
           
           <NotificationsHistoryList limit={20} />
        </div>

        {/* Footer Info */}
        <div className="mt-16 text-center">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">
               End of history • All times in local timezone
            </p>
        </div>
      </main>
    </div>
  );
}
