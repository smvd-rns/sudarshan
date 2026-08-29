import { Calendar, User, Pencil, Trash2, X, Loader2, Save, AlertCircle, Heart } from "lucide-react";
import { useState, useEffect } from "react";
import Image from "next/image";
import { normalizeDate } from "@/lib/dateHelper";

export interface Lecture {
  id: string;
  youtube_id: string;
  title: string;
  speaker_name: string;
  date: string;
  created_at: string;
}

export default function VideoCard({ 
  lecture, 
  onPlay, 
  userRole, 
  onUpdate, 
  accessToken,
  isFavorite,
  onToggleFavorite
}: { 
  lecture: Lecture, 
  onPlay: (id: string) => void,
  userRole?: number,
  onUpdate?: () => void,
  accessToken?: string,
  isFavorite?: boolean,
  onToggleFavorite?: (videoId: string) => void
}) {
  const [thumbUrl, setThumbUrl] = useState(`https://i.ytimg.com/vi/${lecture.youtube_id}/maxresdefault.jpg`);
  const [fallbackStage, setFallbackStage] = useState(0);

  useEffect(() => {
    setThumbUrl(`https://i.ytimg.com/vi/${lecture.youtube_id}/maxresdefault.jpg`);
    setFallbackStage(0);
  }, [lecture.youtube_id]);
  
  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(lecture.title);
  const [editSpeaker, setEditSpeaker] = useState(lecture.speaker_name);
  const [editDate, setEditDate] = useState(lecture.date);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canEdit = userRole === 1 || userRole === 2;

  const handleThumbError = () => {
    if (fallbackStage === 0) {
      setThumbUrl(`https://i.ytimg.com/vi/${lecture.youtube_id}/sddefault.jpg`);
      setFallbackStage(1);
    } else if (fallbackStage === 1) {
      setThumbUrl(`https://i.ytimg.com/vi/${lecture.youtube_id}/hqdefault.jpg`);
      setFallbackStage(2);
    } else if (fallbackStage === 2) {
      setThumbUrl(`https://i.ytimg.com/vi/${lecture.youtube_id}/mqdefault.jpg`);
      setFallbackStage(3);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/admin/lectures", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          id: lecture.id,
          title: editTitle,
          speaker_name: editSpeaker,
          date: normalizeDate(editDate)
        })
      });

      if (!response.ok) throw new Error("Failed to update lecture");
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!accessToken || !window.confirm("Are you sure you want to delete this lecture?")) return;
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/lectures?id=${lecture.id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${accessToken}` }
      });

      if (!response.ok) throw new Error("Failed to delete lecture");
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div 
        className="bg-white rounded-xl sm:rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden border border-devo-100 group cursor-pointer flex flex-col h-full relative"
      >
        {/* Play trigger area */}
        <div className="flex flex-col h-full" onClick={() => onPlay(lecture.youtube_id)}>
          <div className="relative w-full pb-[56.25%] overflow-hidden bg-slate-100">
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors z-10" />
            <Image 
              src={thumbUrl} 
              alt={lecture.title}
              onError={handleThumbError}
              fill
              className="object-cover object-center group-hover:scale-105 transition-all duration-700 opacity-0 data-[loaded=true]:opacity-100"
              onLoadingComplete={(img) => img.setAttribute('data-loaded', 'true')}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              priority={false}
              unoptimized
            />
            <div className="absolute inset-0 flex items-center justify-center z-20 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="bg-devo-500/90 text-white rounded-full p-4 shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                <svg className="w-8 h-8 fill-current ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              </div>
            </div>
          </div>
          
          <div className="p-2.5 sm:p-5 flex-grow flex flex-col">
            <h3 className="font-outfit font-semibold text-[13px] sm:text-lg text-devo-950 leading-tight mb-2 sm:mb-3 line-clamp-2 min-h-[2.5rem] sm:min-h-0">
              {lecture.title}
            </h3>
            
            <div className="mt-auto space-y-1 sm:space-y-2">
              <div className="flex items-center text-[10px] sm:text-sm text-devo-800">
                <User className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 opacity-70 shrink-0" />
                <span className="font-medium text-devo-900 truncate">{lecture.speaker_name}</span>
              </div>
              <div className="flex items-center text-[10px] sm:text-sm text-devo-600">
                <Calendar className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 opacity-70 shrink-0" />
                <span className="truncate">{new Date(lecture.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Button - Static positioned relative to card */}
        {canEdit && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="absolute top-2 right-2 z-30 p-2 sm:p-2.5 bg-white/90 backdrop-blur-sm text-devo-600 rounded-lg shadow-sm hover:bg-devo-600 hover:text-white transition-all scale-90 sm:scale-100 border border-devo-50"
            title="Edit Lecture"
          >
            <Pencil className="w-4 h-4 sm:w-4 sm:h-4" />
          </button>
        )}

        {/* Favorite Button */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            if (onToggleFavorite) onToggleFavorite(lecture.youtube_id);
          }}
          className={`absolute top-2 left-2 z-30 p-2 sm:p-2.5 rounded-lg shadow-sm transition-all scale-90 sm:scale-100 border border-devo-50 ${
            isFavorite ? "bg-red-50 text-red-600" : "bg-white/90 backdrop-blur-sm text-slate-400 hover:text-red-500"
          }`}
          title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
        >
          <Heart className={`w-4 h-4 ${isFavorite ? "fill-red-600" : ""}`} />
        </button>
      </div>

      {/* Quick Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-devo-950/60 backdrop-blur-md" onClick={() => setIsEditing(false)} />
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md relative z-10 overflow-hidden border border-devo-100 animate-in zoom-in-95 duration-200">
             <div className="p-6 sm:p-8 space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-outfit font-black text-devo-950 flex items-center gap-2">
                    <Pencil className="w-5 h-5 text-devo-600" /> Edit Details
                  </h3>
                  <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-lg flex items-center border border-red-100">
                    <AlertCircle className="w-4 h-4 mr-2 shrink-0" /> {error}
                  </div>
                )}

                <form onSubmit={handleUpdate} className="grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-devo-400 uppercase tracking-widest pl-1">Speech Title</label>
                    <input type="text" required value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:bg-white focus:ring-4 focus:ring-devo-100 focus:border-devo-400 outline-none transition-all font-semibold" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-devo-400 uppercase tracking-widest pl-1">Speaker Name</label>
                    <input type="text" required value={editSpeaker} onChange={(e) => setEditSpeaker(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:bg-white focus:ring-4 focus:ring-devo-100 focus:border-devo-400 outline-none transition-all font-semibold" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-devo-400 uppercase tracking-widest pl-1">Date</label>
                    <input type="date" required value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:bg-white focus:ring-4 focus:ring-devo-100 focus:border-devo-400 outline-none transition-all font-semibold" />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button 
                      type="button" 
                      onClick={handleDelete}
                      disabled={isSubmitting}
                      className="py-3 bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                    <button 
                      type="submit"
                      disabled={isSubmitting}
                      className="py-3 bg-devo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-devo-200 hover:shadow-devo-400 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save</>}
                    </button>
                  </div>
                </form>
             </div>
          </div>
        </div>
      )}
    </>
  );
}
