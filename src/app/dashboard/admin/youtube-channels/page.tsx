"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Search, Plus, Trash2, Edit3, Globe, Save, RefreshCw, Upload, X, Check } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Channel {
  id: string;
  channel_id: string;
  name: string;
  handle: string;
  custom_logo: string;
  banner_style: string;
  is_active: boolean;
  order_index: number;
}

export default function YouTubeAdmin() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<Partial<Channel> | null>(null);
  const [fetching, setFetching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchChannels(session);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchChannels(session);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchChannels = async (currentSession = session) => {
    if (!currentSession) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/youtube-channels", {
        headers: {
          "Authorization": `Bearer ${currentSession.access_token}`
        }
      });
      const data = await res.json();
      setChannels(data.channels || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchYoutube = async () => {
    if (!activeItem?.channel_id) return;
    setFetching(true);
    try {
      const headers: Record<string, string> = {};
      if (session) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`/api/youtube?channelId=${activeItem.channel_id}`, { headers });
      const data = await res.json();
      if (data.channelTitle) {
        setActiveItem(prev => ({
          ...prev,
          name: data.channelTitle,
          handle: data.channelTitle.replace(/\s+/g, ""), // approximation or just name
          custom_logo: data.channelLogo
        }));
      }
    } catch (err) {
      alert("Failed to fetch channel data");
    } finally {
      setFetching(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${activeItem?.channel_id || Date.now()}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from('youtube-assets')
        .upload(`logos/${fileName}`, file, { upsert: true });

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('youtube-assets')
        .getPublicUrl(`logos/${fileName}`);

      setActiveItem(prev => ({ ...prev, custom_logo: publicUrl }));
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!session) {
      alert("You must be logged in to save channels");
      return;
    }
    try {
      const method = activeItem?.id ? "PUT" : "POST";
      const res = await fetch("/api/admin/youtube-channels", {
        method,
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify(activeItem)
      });
      if (res.ok) {
        setModalOpen(false);
        fetchChannels(session);
      } else {
        const data = await res.json();
        alert(data.error || "Save failed");
      }
    } catch (err) {
      alert("Save failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!session) {
      alert("You must be logged in to delete channels");
      return;
    }
    if (!confirm("Delete this channel?")) return;
    try {
      const res = await fetch(`/api/admin/youtube-channels?id=${id}`, { 
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });
      if (res.ok) {
        fetchChannels(session);
      } else {
        const data = await res.json();
        alert(data.error || "Delete failed");
      }
    } catch (err) {
      alert("Delete failed");
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">YouTube Hub Manager</h1>
          <p className="text-slate-500 text-sm">Manage devotional channels and portal metadata</p>
        </div>
        <button 
          onClick={() => { setActiveItem({ is_active: true, banner_style: "linear-gradient(135deg, #f97316 0%, #fbbf24 100%)" }); setModalOpen(true); }}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md active:scale-95"
        >
          <Plus className="w-5 h-5" /> Add New Channel
        </button>
      </div>

      <div className="grid gap-6">
        {loading ? (
          <div className="flex justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-indigo-600" /></div>
        ) : channels.map((channel) => (
          <div key={channel.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-6 group hover:border-indigo-200 transition-all">
            <div className={`w-16 h-16 rounded-xl overflow-hidden shadow-md border-2 border-slate-100 shrink-0 ${!channel.is_active && 'grayscale opacity-50'}`}>
              {channel.custom_logo ? (
                <Image src={channel.custom_logo} alt={channel.name} width={64} height={64} className="object-cover" unoptimized />
              ) : (
                <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300 font-black">?</div>
              )}
            </div>
            <div className="flex-grow">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800">{channel.name}</h3>
                {!channel.is_active && <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase">Inactive</span>}
              </div>
              <p className="text-slate-400 text-xs font-mono">{channel.channel_id}</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => { setActiveItem(channel); setModalOpen(true); }}
                className="p-3 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-xl transition-all"
              >
                <Edit3 className="w-5 h-5" />
              </button>
              <button 
                onClick={() => handleDelete(channel.id)}
                className="p-3 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-xl transition-all"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-800">{activeItem?.id ? 'Edit' : 'Add'} Channel</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">YouTube Channel ID</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={activeItem?.channel_id || ""} 
                    onChange={e => setActiveItem(prev => ({ ...prev, channel_id: e.target.value }))}
                    placeholder="UC..."
                    className="flex-grow p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                  />
                  <button 
                    onClick={handleFetchYoutube}
                    disabled={fetching || !activeItem?.channel_id}
                    className="px-4 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                  >
                    {fetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Fetch"}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Display Name</label>
                <input 
                  type="text" 
                  value={activeItem?.name || ""} 
                  onChange={e => setActiveItem(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Logo (Permanent Host)</label>
                <div className="flex items-center gap-4 p-4 bg-indigo-50/50 border-2 border-dashed border-indigo-200 rounded-2xl">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-white shadow-sm shrink-0">
                    {activeItem?.custom_logo ? (
                      <Image src={activeItem.custom_logo} alt="Logo" width={64} height={64} className="object-cover" unoptimized />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-indigo-200"><Globe className="w-8 h-8" /></div>
                    )}
                  </div>
                  <div className="flex-grow space-y-1">
                    <p className="text-xs font-bold text-indigo-800">Manually upload for stability</p>
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-lg cursor-pointer hover:bg-indigo-700 transition-all">
                      <Upload className="w-3.5 h-3.5" />
                      {uploading ? "Uploading..." : "Replace Logo"}
                      <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*" />
                    </label>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Or Paste Image URL (Supports Google Drive share links)</label>
                  <input
                    type="text"
                    value={activeItem?.custom_logo || ""}
                    onChange={e => {
                      let val = e.target.value.trim();
                      // Auto-convert Google Drive links to direct public usercontent URLs
                      const driveMatch = val.match(/\/d\/([a-zA-Z0-9_-]+)/);
                      if (driveMatch) {
                        val = `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
                      }
                      setActiveItem(prev => ({ ...prev, custom_logo: val }));
                    }}
                    placeholder="https://lh3.googleusercontent.com/d/... or any public image URL"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <input 
                  type="checkbox" 
                  checked={activeItem?.is_active ?? true}
                  onChange={e => setActiveItem(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="w-5 h-5 accent-indigo-600"
                />
                <span className="text-sm font-bold text-slate-700">Display in Portal Sidebar</span>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
              <button 
                onClick={() => setModalOpen(false)}
                className="flex-grow py-4 border border-slate-200 text-slate-600 font-black uppercase text-[10px] tracking-widest rounded-2xl hover:bg-white transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="flex-[2] py-4 bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <Save className="w-4 h-4" /> Save Channel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
