"use client";

import React, { useState } from "react";
import { Loader2, AlertCircle, UserPlus } from "lucide-react";

interface ProfileCompletionProps {
  session: any;
  profile?: any;
  refreshProfile: () => void;
}

export default function ProfileCompletion({ session, profile, refreshProfile }: ProfileCompletionProps) {
  const [regName, setRegName] = useState(profile?.full_name || session?.user?.user_metadata?.full_name || "");
  const [regMobile, setRegMobile] = useState(profile?.mobile || "");
  const [regTemple, setRegTemple] = useState(profile?.temple || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");

  const handleProfileComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setAuthError("");
    try {
      const response = await fetch("/api/admin/profile", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          full_name: regName.trim(),
          mobile: regMobile.trim(),
          temple: regTemple.trim()
        })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update profile");
      }
      
      // Refresh global profile state
      refreshProfile();
    } catch (err: any) {
      console.error("Profile update error:", err);
      setAuthError(err.message || "Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-20 px-4">
      <div className="bg-white/80 backdrop-blur-2xl p-10 rounded-[2rem] sm:rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(249,115,22,0.15)] border border-white ring-1 ring-slate-200 space-y-8 animate-in zoom-in duration-300">
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-orange-200 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-100">
            <UserPlus className="w-10 h-10 text-orange-600" />
          </div>
          <h2 className="text-3xl font-outfit font-black text-slate-900 tracking-tight">Finish Registration</h2>
          <p className="text-slate-400 mt-2 font-medium">Please provide your details to access the dashboard</p>
        </div>

        <form onSubmit={handleProfileComplete} className="space-y-6">
          {authError && (
            <div className="p-4 bg-red-50 text-red-700 text-sm rounded-2xl flex items-center border border-red-100 animate-shake">
              <AlertCircle className="w-5 h-5 mr-3 shrink-0" />
              {authError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-2 font-outfit">Full Name</label>
              <input 
                type="text" 
                required 
                placeholder="Srinivasa Ramanujan" 
                value={regName} 
                onChange={(e) => setRegName(e.target.value)} 
                className="w-full px-8 py-5 bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-2xl focus:border-orange-400 focus:ring-4 focus:ring-orange-50 outline-none transition-all font-bold text-lg text-slate-800 placeholder:text-slate-200 hover:border-slate-300" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-2 font-outfit">Mobile Number</label>
              <input 
                type="tel" 
                required 
                placeholder="+91 98765 43210" 
                value={regMobile} 
                onChange={(e) => setRegMobile(e.target.value)} 
                className="w-full px-8 py-5 bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-2xl focus:border-orange-400 focus:ring-4 focus:ring-orange-50 outline-none transition-all font-bold text-lg text-slate-800 placeholder:text-slate-200 hover:border-slate-300" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-2 font-outfit">Temple/Center</label>
              <input 
                type="text" 
                required 
                placeholder="NVCC Pune / Akurdi Center" 
                value={regTemple} 
                onChange={(e) => setRegTemple(e.target.value)} 
                className="w-full px-8 py-5 bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-2xl focus:border-orange-400 focus:ring-4 focus:ring-orange-50 outline-none transition-all font-bold text-lg text-slate-800 placeholder:text-slate-200 hover:border-slate-300" 
              />
            </div>
            <div className="space-y-2 grayscale opacity-40">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-2 font-outfit">Email (Verified)</label>
              <input 
                type="email" 
                readOnly 
                value={session?.user?.email || ""} 
                className="w-full px-8 py-5 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-slate-500" 
              />
            </div>
          </div>

          <button 
            disabled={isSubmitting} 
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-extrabold py-6 rounded-2xl transition-all shadow-xl shadow-orange-100 active:scale-[0.98] disabled:opacity-70 flex justify-center items-center gap-3 text-xl tracking-tight"
          >
            {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : "Complete My Registration"}
          </button>
        </form>
      </div>
    </div>
  );
}
