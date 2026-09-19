import { supabaseIdktAdmin } from '@/lib/supabaseIdkt';
import { supabaseAdmin } from '@/lib/supabase';

export interface LogStoreActivityParams {
  userId?: string;
  user_id?: string;
  userName?: string;
  user_name?: string;
  userEmail?: string;
  user_email?: string;
  action: string;
  details: string;
  metadata?: any;
}

export async function logStoreActivity(params: LogStoreActivityParams) {
  try {
    if (!supabaseIdktAdmin) return;

    const uId = params.userId || params.user_id || null;
    let uName = params.userName || params.user_name || "";
    let uEmail = params.userEmail || params.user_email || "";

    if (uId && (!uName || uName.includes('@') || uName === 'Admin' || uName === 'User/Admin')) {
      const { data: su } = await supabaseIdktAdmin
        .from('store_users')
        .select('full_name, email')
        .eq('id', uId)
        .maybeSingle();

      if (su && su.full_name) {
        uName = su.full_name;
        if (su.email) uEmail = su.email;
      } else if (supabaseAdmin) {
        const { data: prof } = await supabaseAdmin
          .from('profiles')
          .select('full_name, email')
          .eq('id', uId)
          .maybeSingle();

        if (prof && prof.full_name) {
          uName = prof.full_name;
          if (prof.email) uEmail = prof.email;
        }
      }
    }

    const payload = {
      user_id: uId,
      user_name: uName || (uEmail ? uEmail.split('@')[0] : "System / Guest"),
      user_email: uEmail || "N/A",
      action: params.action,
      details: params.details,
      created_at: new Date().toISOString()
    };

    const { error } = await supabaseIdktAdmin
      .from('store_activity_logs')
      .insert(payload);

    if (error) {
      console.warn("[StoreActivityLogger] DB Insert Notice:", error.message);
    }
  } catch (err) {
    console.error("[StoreActivityLogger] Error logging activity:", err);
  }
}
