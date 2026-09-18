"use client";

import React, { useState, useEffect } from "react";
import { 
  Users, Calendar, Clock, ChevronLeft, ChevronRight, 
  Loader2, RefreshCcw, UtensilsCrossed, Info
} from "lucide-react";
import { getPrasadamCounts, PrasadamCountHistory } from "./actions";

export default function PrasadamCountPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    history: PrasadamCountHistory[];
    totalCount: number;
    totalPages: number;
    settings?: {
      startTime: string;
      endTime: string;
      machineCount: number;
    }
  } | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetchData();
  }, [page]);

  const fetchData = async () => {
    setLoading(true);
    const result: any = await getPrasadamCounts(page);
    if (result && !result.error) {
      setData(result);
    }
    setLoading(false);
  };

  const todayData = data?.history[0];
  const historyData = data?.history.slice(1) || [];

  return (
    <div className="min-h-screen bg-[#fcf9f2] font-outfit text-slate-800 pb-20 overflow-hidden relative">
      {/* Dynamic Background Elements */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-orange-100/50 to-transparent -z-10" />
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-orange-200/20 rounded-full blur-3xl -z-10" />
      <div className="absolute top-1/2 -left-48 w-[30rem] h-[30rem] bg-indigo-100/30 rounded-full blur-3xl -z-10" />

      <div className="max-w-4xl mx-auto px-6 pt-12 sm:pt-20 space-y-12">
        {/* Header Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-3 bg-white/50 backdrop-blur-md px-6 py-2 rounded-full border border-orange-100 shadow-sm mb-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
            <UtensilsCrossed className="w-5 h-5 text-orange-600" />
            <span className="text-xs font-black uppercase tracking-widest text-orange-800">Prasadam Service Dashboard</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight leading-tight">
            Prasadam <span className="text-orange-600">Count</span>
          </h1>
          <p className="max-w-lg mx-auto text-slate-500 font-bold text-sm sm:text-base leading-relaxed">
            Real-time breakfast aggregation based on morning attendance logs.
          </p>
        </div>

        {/* Today's Hero Card */}
        <div className="relative group animate-in zoom-in-95 duration-1000">
           <div className="absolute -inset-1 bg-gradient-to-r from-orange-600 to-amber-600 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
           <div className="relative bg-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl overflow-hidden border border-orange-50">
              {/* Card Pattern */}
              <div className="absolute top-0 right-0 p-8 opacity-[0.03] select-none pointer-events-none">
                <Users className="w-64 h-64 -rotate-12" />
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-8 relative z-10">
                <div className="text-center sm:text-left space-y-6">
                  <div>
                    <div className="text-orange-600 font-black text-xs uppercase tracking-widest mb-2 flex items-center justify-center sm:justify-start gap-2">
                       <div className="w-2 h-2 rounded-full bg-orange-600 animate-pulse" />
                       Today's Live Count
                    </div>
                    <div className="text-6xl sm:text-8xl font-black text-slate-900 tracking-tighter">
                      {loading ? (
                        <Loader2 className="w-16 h-16 animate-spin text-slate-200" />
                      ) : (
                        todayData?.count || 0
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap justify-center sm:justify-start gap-4">
                     <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                       <Calendar className="w-4 h-4 text-slate-400" />
                       <span className="text-xs font-black text-slate-600">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                     </div>
                     <div className="flex items-center gap-2 bg-orange-50 px-4 py-2 rounded-xl border border-orange-100">
                       <Clock className="w-4 h-4 text-orange-400" />
                       <span className="text-xs font-black text-orange-600">
                         {data?.settings?.startTime.slice(0, 5)} - {data?.settings?.endTime.slice(0, 5)}
                       </span>
                     </div>
                  </div>
                </div>

                <div className="w-full sm:w-auto">
                   <button 
                     onClick={() => fetchData()}
                     className="w-full sm:w-auto flex items-center justify-center gap-3 bg-slate-900 hover:bg-orange-600 text-white px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-95 group"
                   >
                     {loading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <RefreshCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />}
                     Refresh Now
                   </button>
                </div>
              </div>

              {/* Settings Info Bar */}
              <div className="mt-10 pt-8 border-t border-slate-50 flex items-center gap-4 text-slate-400">
                 <Info className="w-4 h-4 shrink-0" />
                 <p className="text-[10px] font-bold uppercase tracking-wider leading-relaxed">
                   Aggregated across <span className="text-slate-900">{data?.settings?.machineCount || 0} configured machines</span>. 
                   Unique users are identified by their biometric ID.
                 </p>
              </div>
           </div>
        </div>

        {/* History Table Section */}
        <div className="space-y-6">
          <div className="flex justify-between items-end px-2">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Count History</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Previous days logs</p>
            </div>
            
            <div className="flex gap-2">
               <button 
                 disabled={page === 0 || loading}
                 onClick={() => setPage(p => p - 1)}
                 className="p-3 bg-white border border-slate-200 rounded-xl hover:border-orange-600 hover:text-orange-600 disabled:opacity-30 transition-all shadow-sm"
               >
                 <ChevronLeft className="w-5 h-5" />
               </button>
               <button 
                 disabled={page === (data?.totalPages || 1) - 1 || loading}
                 onClick={() => setPage(p => p + 1)}
                 className="p-3 bg-white border border-slate-200 rounded-xl hover:border-orange-600 hover:text-orange-600 disabled:opacity-30 transition-all shadow-sm"
               >
                 <ChevronRight className="w-5 h-5" />
               </button>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
            <div className="overflow-x-auto overflow-visible">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-separate border-slate-50">
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-left">Date</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Daily Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-8 py-8"><div className="h-4 bg-slate-100 rounded w-24"></div></td>
                        <td className="px-8 py-8 flex justify-end"><div className="h-4 bg-slate-100 rounded w-12"></div></td>
                      </tr>
                    ))
                  ) : historyData.length > 0 ? (
                    historyData.map((day) => (
                      <tr key={day.date} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-8">
                          <div className="font-black text-slate-900 text-lg">{day.date}</div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                            {new Date(day.date).toLocaleDateString([], { weekday: 'long' })}
                          </div>
                        </td>
                        <td className="px-8 py-8 text-right">
                          <div className="inline-flex items-center gap-3 bg-slate-50 px-5 py-2.5 rounded-2xl border border-slate-100 group-hover:bg-orange-50 group-hover:border-orange-100 transition-colors">
                            <Users className="w-4 h-4 text-slate-400 group-hover:text-orange-400" />
                            <span className="text-base font-black text-slate-900 group-hover:text-orange-600">{day.count}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="px-8 py-20 text-center font-bold text-slate-400 italic">No historical data found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Footer */}
            <div className="p-8 bg-slate-50/30 border-t border-slate-50 flex justify-between items-center">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                 Page <span className="text-slate-900">{page + 1}</span> of {data?.totalPages || 1}
               </p>
               <div className="flex gap-4">
                  <div className="flex h-2 w-24 bg-slate-200 rounded-full overflow-hidden">
                    <div 
                      className="bg-orange-600 transition-all duration-500" 
                      style={{ width: `${((page + 1) / (data?.totalPages || 1)) * 100}%` }}
                    />
                  </div>
               </div>
            </div>
          </div>
        </div>
        

      </div>
    </div>
  );
}
