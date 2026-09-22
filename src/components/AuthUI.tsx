"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, AlertCircle, Globe } from "lucide-react";

interface AuthUIProps {
  redirectTo?: string;
}

export default function AuthUI({ redirectTo = "/admin" }: AuthUIProps) {
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    console.log("Google Login initiated...");
    setIsLoading(true);
    setAuthError("");
    try {
      const targetUrl = window.location.origin + redirectTo;
      console.log("Redirecting to:", targetUrl);
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { 
          redirectTo: targetUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      
      if (error) throw error;
      console.log("Supabase response:", data);
    } catch (err: any) {
      console.error("Google Auth Error:", err);
      setAuthError(err.message || "Failed to connect to Google");
      alert("Error: " + (err.message || "Failed to connect to Google"));
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 animate-in fade-in zoom-in duration-500">
      <div className="bg-white/80 backdrop-blur-xl p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] border border-white/20 ring-1 ring-black/5">
        <div className="text-center mb-6 sm:mb-10">
          <div className="w-14 h-14 sm:w-24 sm:h-24 bg-gradient-to-tr from-devo-50 to-devo-100 rounded-xl sm:rounded-[2rem] flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-sm">
            <Globe className="w-7 h-7 sm:w-12 sm:h-12 text-devo-600" />
          </div>
          <h2 className="text-2xl sm:text-5xl font-outfit font-black text-devo-950 tracking-tight">
            Devotional Hub
          </h2>
          <p className="text-devo-800 mt-1 sm:mt-3 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Secure Spiritual Access</p>
        </div>

        <div className="space-y-6 sm:space-y-8">
          {authError && (
            <div className="p-4 bg-red-50 text-red-700 text-[10px] sm:text-xs font-bold rounded-2xl flex items-center border border-red-100 animate-shake">
              <AlertCircle className="w-4 h-4 mr-3 shrink-0" />
              {authError}
            </div>
          )}

          <div className="text-center space-y-1">
            <h3 className="text-sm sm:text-xl font-bold text-slate-800">Sign in to continue</h3>
            <p className="text-slate-400 font-medium text-[10px] sm:text-sm">Access the lecture library</p>
          </div>

          <button 
            onClick={handleGoogleLogin} 
            disabled={isLoading}
            className="w-full relative group flex items-center justify-center gap-3 bg-white hover:bg-slate-50 border-2 border-slate-100 hover:border-devo-400 text-slate-800 font-black py-4 sm:py-6 rounded-xl sm:rounded-[2rem] transition-all hover:shadow-xl active:scale-[0.98] overflow-hidden disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-5 h-5 sm:w-8 sm:h-8 animate-spin text-devo-600" /> : (
              <svg className="w-5 h-5 sm:w-7 sm:h-7 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
            )}
            <span className="text-base sm:text-xl tracking-tight">Sign in with Google</span>
          </button>

          <p className="text-center text-[8px] sm:text-[10px] text-slate-300 font-bold uppercase tracking-[0.3em]">
            Official Devotional Admin
          </p>
        </div>
      </div>
    </div>
  );
}

