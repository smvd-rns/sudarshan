"use client";

import { 
  Globe, 
  ExternalLink, 
  BookOpen, 
  Sparkles, 
  ArrowLeft, 
  Headphones, 
  GraduationCap, 
  CalendarDays,
  ShieldCheck,
  ChevronRight,
  Info
} from "lucide-react";
import NextLink from "next/link";

const RSD_URL = "https://www.radheshyamdas.com/";

export default function RadheshyamDasPage() {
  const handleLaunchInApp = () => {
    // Same-window navigation so the Android Web APK keeps the user inside the app
    window.location.href = RSD_URL;
  };

  return (
    <div className="min-h-screen bg-slate-50/70 font-outfit pb-24">
      <main className="max-w-4xl mx-auto w-full p-4 sm:p-6">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
          <NextLink href="/" className="hover:text-orange-600 transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Home</span>
          </NextLink>
          <ChevronRight className="w-3 h-3" />
          <span>More</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-orange-600">Radheshyam Das</span>
        </div>

        {/* Hero Card */}
        <div className="bg-gradient-to-br from-amber-500 via-orange-600 to-amber-700 text-white rounded-3xl sm:rounded-[2.5rem] p-6 sm:p-10 shadow-xl shadow-orange-500/20 relative overflow-hidden mb-6">
          {/* Decorative glowing circles */}
          <div className="absolute top-0 right-0 -translate-y-1/3 translate-x-1/3 w-72 h-72 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 translate-y-1/3 -translate-x-1/3 w-64 h-64 bg-amber-400/20 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-black uppercase tracking-wider mb-4 border border-white/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Official Website Portal</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight mb-2">
              HG Radheshyam Das
            </h1>

            <p className="text-white/85 text-xs sm:text-sm font-medium leading-relaxed max-w-xl mb-6">
              Founding Director of VOICE, Temple President at ISKCON NVCC Pune, M.Tech from IIT Bombay, and mentor to thousands of spiritual seekers worldwide.
            </p>

            {/* Launch In-App Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                onClick={handleLaunchInApp}
                className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-white text-orange-900 hover:bg-orange-50 font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg transition-all active:scale-95 group"
              >
                <Globe className="w-4 h-4 text-orange-600 group-hover:rotate-12 transition-transform" />
                <span>Launch Website Inside App</span>
                <ExternalLink className="w-4 h-4 text-orange-400 ml-1" />
              </button>

              <span className="text-[11px] text-white/80 font-medium text-center sm:text-left">
                Loads seamlessly inside this app. Tap Android Back to return.
              </span>
            </div>
          </div>
        </div>

        {/* Notice for Web APK users */}
        <div className="bg-orange-50/80 border border-orange-200/80 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <Info className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <div className="text-xs text-orange-950 leading-relaxed">
            <p className="font-bold mb-0.5">Ashram Device &amp; Web APK Friendly</p>
            <p className="text-orange-900/80">
              This portal navigates directly within your Web APK without opening any external browser, in full compliance with Ashram device policy. Tap the device Back button anytime to return here.
            </p>
          </div>
        </div>

        {/* Highlights / Content Features */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div 
            onClick={handleLaunchInApp}
            className="bg-white rounded-2xl p-5 border border-slate-200/80 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <BookOpen className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-1">
              Spiritual Books
            </h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Explore best-selling publications including The Art of Mind Control, Essence of Bhagavad Gita, and Vedic Wisdom series.
            </p>
          </div>

          <div 
            onClick={handleLaunchInApp}
            className="bg-white rounded-2xl p-5 border border-slate-200/80 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Headphones className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-1">
              Discourses &amp; Podcasts
            </h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Comprehensive audio classes, Srimad Bhagavatam seminars, and spiritual answers for modern day lifestyle challenges.
            </p>
          </div>

          <div 
            onClick={handleLaunchInApp}
            className="bg-white rounded-2xl p-5 border border-slate-200/80 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <GraduationCap className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-1">
              VOICE Youth Ministry
            </h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Discover student empowerment initiatives, hostel communities, and character development workshops across India.
            </p>
          </div>

          <div 
            onClick={handleLaunchInApp}
            className="bg-white rounded-2xl p-5 border border-slate-200/80 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <CalendarDays className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-1">
              Schedules &amp; Yatras
            </h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Stay updated on upcoming retreats, holy dham pilgrimages, festivals, and spiritual discourse tours.
            </p>
          </div>
        </div>

        {/* Bottom Call to Action */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100/70 text-orange-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-slate-900">
                Ready to explore?
              </p>
              <p className="text-[11px] text-slate-500 font-medium">
                Visit radheshyamdas.com directly inside your app
              </p>
            </div>
          </div>

          <button
            onClick={handleLaunchInApp}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95"
          >
            <span>Open Website Now</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

      </main>
    </div>
  );
}
