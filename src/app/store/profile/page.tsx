"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, User, Save, CheckCircle2 } from "lucide-react";
import { useStoreAuth } from "@/components/StoreGuard";

export default function StoreProfile() {
  const [session, setSession] = useState<any>(null);
  const { storeUser, loading: authLoading } = useStoreAuth();
  
  const [kurtaSize, setKurtaSize] = useState("");
  const [chappalSize, setChappalSize] = useState("");
  const [colorPref, setColorPref] = useState("White");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  useEffect(() => {
    if (storeUser) {
      setKurtaSize(storeUser.kurta_size || "");
      setChappalSize(storeUser.chappal_size || "");
      setColorPref(storeUser.color_preference || "White");
    }
  }, [storeUser]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setSaving(true);
    setSuccess(false);
  
    try {
      const res = await fetch("/api/store/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          kurta_size: kurtaSize,
          chappal_size: chappalSize,
          color_preference: colorPref
        })
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        alert("Failed to save profile.");
      }
    } catch (err) {
      alert("Network error.");
    }
    setSaving(false);
  };

  if (authLoading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-devo-500" /></div>;

  return (
    <div>
      <h1 className="text-3xl font-black font-outfit text-slate-800 flex items-center gap-3 mb-6">
        <User className="w-8 h-8 text-devo-500" />
        Store Profile & Sizes
      </h1>
        
        {storeUser && (
          <div className="bg-white p-4 rounded-2xl border border-slate-100 mb-6 flex items-center gap-4 shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-black font-outfit text-lg">
              {storeUser.full_name ? storeUser.full_name.slice(0, 2).toUpperCase() : "U"}
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-base">{storeUser.full_name || "User"}</h2>
              <p className="text-xs text-slate-500 font-medium">{storeUser.email}</p>
            </div>
          </div>
        )}
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <form onSubmit={handleSave} className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Kurta Size</label>
                <select 
                  value={kurtaSize}
                  onChange={(e) => setKurtaSize(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-devo-500 font-medium text-slate-800"
                >
                  <option value="">Select Size</option>
                  {[34, 36, 38, 40, 42, 44].map(s => (
                    <option key={s} value={s.toString()}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Chappal Size</label>
                <select 
                  value={chappalSize}
                  onChange={(e) => setChappalSize(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-devo-500 font-medium text-slate-800"
                >
                  <option value="">Select Size</option>
                  {[6, 7, 8, 9, 10, 11].map(s => <option key={s} value={s.toString()}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Color Preference</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer p-3 border border-slate-200 rounded-xl flex-1 hover:bg-slate-50">
                  <input type="radio" name="color" value="White" checked={colorPref === "White"} onChange={(e) => setColorPref(e.target.value)} className="w-4 h-4 text-devo-500" />
                  <span className="font-bold text-slate-700">White</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer p-3 border border-slate-200 rounded-xl flex-1 hover:bg-slate-50">
                  <input type="radio" name="color" value="Saffron" checked={colorPref === "Saffron"} onChange={(e) => setColorPref(e.target.value)} className="w-4 h-4 text-orange-500" />
                  <span className="font-bold text-slate-700">Saffron</span>
                </label>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={saving}
              className={`w-full font-black py-4 rounded-xl flex justify-center items-center gap-2 transition-all ${
                success ? 'bg-green-500 text-white' : 'bg-devo-600 hover:bg-devo-700 text-white'
              }`}
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 
               success ? <CheckCircle2 className="w-5 h-5" /> : <Save className="w-5 h-5" />}
              {success ? "Saved Successfully!" : "Save Profile"}
            </button>
          </form>
        </div>
    </div>
  );
}
