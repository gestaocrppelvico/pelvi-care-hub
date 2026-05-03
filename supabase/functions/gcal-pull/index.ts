// Pull events from Google Calendar -> app (incremental sync via syncToken)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GCAL_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!GCAL_KEY) throw new Error("GOOGLE_CALENDAR_API_KEY not configured");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: state } = await admin.from("gcal_sync_state").select("*").eq("id", "default").single();
    if (!state) throw new Error("sync state missing");

    const calendarId = encodeURIComponent(state.calendar_id ?? "primary");
    const gHeaders = {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GCAL_KEY,
    };

    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    let processed = 0;
    let createdInApp = 0, updatedInApp = 0, deletedInApp = 0;

    do {
      const params = new URLSearchParams();
      params.set("singleEvents", "true");
      params.set("maxResults", "250");
      if (pageToken) params.set("pageToken", pageToken);
      if (state.sync_token && !pageToken) {
        params.set("syncToken", state.sync_token);
      } else if (!state.sync_token && !pageToken) {
        // initial full sync: bounded window to avoid timeout on recurring events
        params.set("timeMin", new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString());
        params.set("timeMax", new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString());
      }

      const url = `${GATEWAY}/calendars/${calendarId}/events?${params.toString()}`;
      const r = await fetch(url, { headers: gHeaders });

      if (r.status === 410) {
        // sync token invalid -> reset and full re-sync next call
        await admin.from("gcal_sync_state").update({ sync_token: null }).eq("id", "default");
        return new Response(JSON.stringify({ ok: true, reset: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`gcal list failed [${r.status}]: ${t}`);
      }
      const data = await r.json();

      for (const ev of data.items ?? []) {
        processed++;
        const appId = ev.extendedProperties?.private?.appAtendimentoId as string | undefined;

        // Cancelled event from Google
        if (ev.status === "cancelled") {
          if (appId) {
            await admin.from("atendimentos")
              .update({ status: "cancelado", last_synced_at: new Date().toISOString() })
              .eq("id", appId);
          } else if (ev.id) {
            const { data: existing } = await admin
              .from("atendimentos")
              .select("id")
              .eq("google_event_id", ev.id)
              .maybeSingle();
            if (existing) {
              await admin.from("atendimentos")
                .update({ status: "cancelado", last_synced_at: new Date().toISOString() })
                .eq("id", existing.id);
              deletedInApp++;
            }
          }
          continue;
        }

        // Skip events without proper time (all-day or invalid)
        if (!ev.start?.dateTime || !ev.end?.dateTime) continue;

        // Event already linked to an app atendimento -> update times/status
        if (appId) {
          await admin.from("atendimentos").update({
            data_inicio: ev.start.dateTime,
            data_fim: ev.end.dateTime,
            google_event_id: ev.id,
            last_synced_at: new Date().toISOString(),
          }).eq("id", appId);
          updatedInApp++;
          continue;
        }

        // External event (created directly in Google) -> create new atendimento if we can match a profissional, otherwise log and skip
        const { data: existing } = await admin
          .from("atendimentos")
          .select("id")
          .eq("google_event_id", ev.id)
          .maybeSingle();

        if (existing) {
          await admin.from("atendimentos").update({
            data_inicio: ev.start.dateTime,
            data_fim: ev.end.dateTime,
            last_synced_at: new Date().toISOString(),
          }).eq("id", existing.id);
          updatedInApp++;
        } else {
          // Need to create a placeholder atendimento. Without paciente/profissional we skip — clinic flow expects bookings via app for those.
          // Log so admin can see in pull logs.
          console.log("[gcal-pull] external event skipped (no app match):", ev.id, ev.summary);
        }
      }

      pageToken = data.nextPageToken;
      nextSyncToken = data.nextSyncToken ?? nextSyncToken;
    } while (pageToken);

    await admin.from("gcal_sync_state").update({
      sync_token: nextSyncToken ?? state.sync_token,
      last_incremental_at: new Date().toISOString(),
      last_full_sync_at: state.sync_token ? state.last_full_sync_at : new Date().toISOString(),
    }).eq("id", "default");

    return new Response(JSON.stringify({
      ok: true, processed, createdInApp, updatedInApp, deletedInApp,
      hasSyncToken: !!nextSyncToken,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gcal-pull error:", e);
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
