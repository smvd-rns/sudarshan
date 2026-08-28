import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import admin from "@/lib/firebase-admin";
import { isFcmTokenInvalid } from "@/lib/notifications";

import { getUserFromToken } from "@/lib/auth-utils";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Local JWT decode — zero network call to Supabase Auth
    const user = getUserFromToken(req);
    if (!user) {
       return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // Fetch all active subscriptions for this user
    const { data: subs, error: subError } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user.id);

    if (subError) throw subError;

    if (!subs || subs.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: "No push subscriptions found in database for your account. Please enable notifications first." 
      });
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    const results = await Promise.allSettled(
      subs.map(async (s) => {
        const payload = {
          title: "Diagnostic Test",
          body: `Testing ${s.provider} notification on ${s.device_type} (Time: ${new Date().toLocaleTimeString()})`,
          url: "/travel-desk",
          icon: "/favicon.ico",
        };

        try {
          if (!s.provider || s.provider === "web-push") {
            if (!publicKey || !privateKey)
              throw new Error("VAPID keys missing for Web Push");
            webpush.setVapidDetails(
              "mailto:shyam@ashramconnect.com",
              publicKey,
              privateKey,
            );
            return webpush.sendNotification(
              s.subscription,
              JSON.stringify(payload),
            );
          }

          if (s.provider === "fcm" && s.subscription?.token) {
            const message = {
              token: s.subscription.token,
              notification: {
                title: payload.title,
                body: payload.body,
              },
              data: {
                url: payload.url,
                icon: payload.icon,
              },
              android: {
                priority: "high" as const,
                notification: {
                  channelId: "default",
                },
              },
            };
            return admin.messaging().send(message);
          }

          throw new Error(`Unsupported provider: ${s.provider}`);
        } catch (err: any) {
          if (err?.statusCode === 410 && s.subscription?.endpoint) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("subscription_key", s.subscription.endpoint);
          } else if (
            s.provider === "fcm" &&
            isFcmTokenInvalid(err) &&
            (s.subscription_key || s.subscription?.token)
          ) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq(
                "subscription_key",
                s.subscription_key || s.subscription.token,
              );
          }
          throw err;
        }
      }),
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return NextResponse.json({ 
      success: true, 
      details: {
        total_found: subs.length,
        sent_successfully: successful,
        failed_delivery: failed,
        individual_results: results.map((r, i) => ({
            provider: subs[i].provider,
            status: r.status,
            error: r.status === 'rejected' ? (r as PromiseRejectedResult).reason?.message : null
        }))
      }
    });

  } catch (error: any) {
    console.error("Test Push Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
