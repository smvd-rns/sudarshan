"use client";

import { useState } from "react";
import { X, Plus, Video, Calendar, User, FileText, Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";

interface AddBcClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken?: string;
  onSuccess?: () => void;
}

export default function AddBcClassModal({
  isOpen,
  onClose,
  accessToken,
  onSuccess
}: AddBcClassModalProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [speaker, setSpeaker] = useState("HG Radheshyam Das");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Extract YouTube ID helper
  const extractYouTubeId = (inputUrl: string): string => {
    if (!inputUrl) return "";
    const trimmed = inputUrl.trim();
    if (trimmed.length === 11 && !trimmed.includes("/") && !trimmed.includes(".")) {
      return trimmed;
    }
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = trimmed.match(regExp);
    return match && match[2].length === 11 ? match[2] : "";
  };

  const videoId = extractYouTubeId(url);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!videoId) {
      setErrorMsg("Please enter a valid YouTube Video Link or ID.");
      return;
    }

    if (!title.trim()) {
      setErrorMsg("Please enter a title for the BC class.");
      return;
    }

    if (!speaker.trim()) {
      setErrorMsg("Please enter the speaker name.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/lectures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          youtube_id: videoId,
          title: title.trim(),
          speaker_name: speaker.trim(),
          date: date
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to publish BC class recording.");
      }

      setSuccessMsg("BC Class Recording entry added successfully!");
      setUrl("");
      setTitle("");
      setSpeaker("HG Radheshyam Das");
      setDate(new Date().toISOString().split("T")[0]);

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1500);

    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred while saving.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
    >
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 bg-gradient-to-r from-amber-500/10 via-slate-50 to-orange-500/10 border-b border-slate-200/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-600/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-outfit font-black text-slate-900 text-lg sm:text-xl leading-tight">
                Add New BC Class Entry
              </h3>
              <p className="text-xs font-semibold text-slate-500">SuperAdmin Quick Upload</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all active:scale-95 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2.5 text-red-700 text-xs font-bold animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-emerald-800 text-xs font-bold animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* YouTube Link / ID */}
          <div>
            <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Video className="w-4 h-4 text-red-600" />
              YouTube Video Link / ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ or Video ID"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium text-slate-900 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all"
            />
          </div>

          {/* Live Thumbnail Preview */}
          {videoId ? (
            <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 flex items-center gap-3">
              <div className="relative w-24 h-14 bg-black rounded-xl overflow-hidden shrink-0 border border-white/10">
                <img
                  src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
                  alt="Thumbnail Preview"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as any).src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=300&q=80"; }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className="inline-block px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-bold text-[10px] rounded-md mb-1 border border-emerald-500/30">
                  Valid Video ID Detected
                </span>
                <p className="text-white text-xs font-mono truncate">{videoId}</p>
              </div>
            </div>
          ) : null}

          {/* Title */}
          <div>
            <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-amber-600" />
              Class Title / Topic <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. SB 1.2.17 - Cleaning the Dust from the Heart"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium text-slate-900 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all"
            />
          </div>

          {/* Speaker & Date Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Speaker Name */}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <User className="w-4 h-4 text-amber-600" />
                Speaker Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
                placeholder="e.g. HG Radheshyam Das"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium text-slate-900 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all"
              />
            </div>

            {/* Class Date */}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-amber-600" />
                Class Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium text-slate-900 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all"
              />
            </div>
          </div>

          {/* Footer Submit Button */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-amber-600/20 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Publishing BC Class...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Publish BC Class Recording</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
