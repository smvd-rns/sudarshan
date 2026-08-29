"use client";

import React, { useState, useEffect, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/useProfile";
import { useVmInchargeAccess } from "@/hooks/useVmInchargeAccess";
import Navbar from "@/components/Navbar";
import AttendanceTracing from "@/components/AttendanceTracing";
import AttendanceExceptionForm from "@/components/AttendanceExceptionForm";
import AttendanceInchargeForm from "@/components/AttendanceInchargeForm";
import HarinamSelfMarkingForm from "@/components/HarinamSelfMarkingForm";
import VirtualMachineAttendanceForm from "@/components/VirtualMachineAttendanceForm";
import HarinamBulkImport from "@/components/HarinamBulkImport";
import { Loader2, ShieldAlert, LogIn, ArrowRight } from "lucide-react";

export default function PersonalAttendancePage() {
  const [session, setSession] = useState<any>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitializing(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setInitializing(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const { profile, isBcdb, isSuperAdmin, isAttendanceIncharge, loading: loadingProfile } = useProfile(session);
  const hasVmInchargeAccess = useVmInchargeAccess(session);
  const isVirtualMachineIncharge = hasVmInchargeAccess;
  const canViewFullAttendance = isBcdb || isSuperAdmin;

  const [refreshKey, setRefreshKey] = useState(0);

  if (initializing || !session || loadingProfile) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="text-slate-600 font-black uppercase tracking-widest text-[10px] animate-pulse">Establishing Secure Connection...</p>
      </div>
    );
  }

  if (!isBcdb && !isAttendanceIncharge && !isVirtualMachineIncharge && !isSuperAdmin) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center pt-24">
          <div className="w-20 h-20 bg-rose-50 rounded-[2rem] shadow-xl flex items-center justify-center mb-8 border border-rose-100">
            <ShieldAlert className="w-10 h-10 text-rose-500" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter mb-4">Access Restricted</h1>
          <p className="text-slate-500 font-bold max-w-md mb-8">This portal is specifically reserved for active members of the BCDB. If you believe this is an error, please contact your administrative temple in-charge.</p>
          <button
            onClick={() => window.location.href = "/"}
            className="text-slate-400 font-black uppercase tracking-widest text-xs hover:text-indigo-600 transition-colors"
          >
            Return to Homepage
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-slate-50 pt-16 sm:pt-20 pb-24 md:pb-20 overflow-x-hidden">
        <div className="max-w-[1700px] mx-auto px-3 sm:px-6 lg:px-12 min-w-0">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 xl:gap-10 items-start min-w-0">
            {/* Main Attendance Section - Left side */}
            {canViewFullAttendance && (
              <div className="col-span-1 xl:col-span-8 2xl:col-span-9 space-y-6 sm:space-y-8 xl:space-y-10 min-w-0">
                <div className="animate-in fade-in slide-in-from-left-4 duration-700">
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter mb-2 font-outfit uppercase">My Attendance</h1>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm">
                      <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(79,70,229,0.5)]"></span>
                      <p className="text-slate-500 font-black text-[9px] uppercase tracking-[0.2em]">Official BCDB Record</p>
                    </div>
                  </div>
                </div>

                <Suspense fallback={
                  <div className="p-32 flex flex-col items-center justify-center gap-6 bg-white/50 rounded-[3rem] border-4 border-dashed border-slate-200">
                    <Loader2 className="w-12 h-12 text-indigo-200 animate-spin" />
                    <p className="font-black text-slate-300 uppercase tracking-widest text-xs">Synchronizing Records...</p>
                  </div>
                }>
                  <AttendanceTracing
                    key={refreshKey}
                    isAdmin={isSuperAdmin}
                    forceUserView={!isSuperAdmin}
                    session={session}
                    profile={profile}
                  />
                </Suspense>
              </div>
            )}

            {/* Sidebar Space - Now housing the Exception Reporting Form */}
            <div className={`flex flex-col ${canViewFullAttendance ? "xl:col-span-4 2xl:col-span-3" : "xl:col-span-12 2xl:col-span-12 max-w-3xl mx-auto w-full"} xl:sticky xl:top-28 gap-6 animate-in fade-in slide-in-from-bottom-4 xl:slide-in-from-right-4 duration-1000 delay-300 min-w-0`}>
              {canViewFullAttendance && (
                <AttendanceExceptionForm
                  userEmail={profile?.email || ""}
                  session={session}
                  onSuccess={() => setRefreshKey(prev => prev + 1)}
                />
              )}

              {isAttendanceIncharge && (
                <AttendanceInchargeForm
                  session={session}
                  onSuccess={() => setRefreshKey((prev) => prev + 1)}
                />
              )}

              {isSuperAdmin && (
                <HarinamBulkImport
                  session={session}
                  onSuccess={() => setRefreshKey((prev) => prev + 1)}
                />
              )}

              {isVirtualMachineIncharge && (
                <VirtualMachineAttendanceForm
                  session={session}
                  onSuccess={() => setRefreshKey((prev) => prev + 1)}
                />
              )}

              {isBcdb && (
                <HarinamSelfMarkingForm
                  session={session}
                  onSuccess={() => setRefreshKey((prev) => prev + 1)}
                />
              )}

              {canViewFullAttendance && (
                <div className="bg-white/40 backdrop-blur-sm border border-slate-100 rounded-[2.5rem] p-8 flex flex-col items-center text-center gap-4 opacity-60">
                  <p className="font-black text-slate-400 uppercase tracking-[0.3em] text-[8px]">Wisdom Analytics</p>
                  <p className="text-slate-300 font-bold text-[10px] leading-relaxed">Additional patterns and insights will appear here as your data grows.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
