// Pull events from Google Calendar -> app (incremental sync via syncToken)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const isIncremental = !!state.sync_token;
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    let processed = 0;
    let updatedInApp = 0, deletedInApp = 0, skippedExternal = 0;
    const startedAt = Date.now();
    const MAX_RUNTIME_MS = 120_000; // bail before 150s hard limit

    do {
      // Bail early if approaching the edge-function timeout
      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        console.warn(`[gcal-pull] approaching timeout after ${processed} events – saving progress`);
        break;
      }

      const params = new URLSearchParams();
      params.set("singleEvents", "true");
      params.set("maxResults", "50");
      if (pageToken) params.set("pageToken", pageToken);
      if (isIncremental && !pageToken) {
        params.set("syncToken", state.sync_token!);
      } else if (!isIncremental && !pageToken) {
        // Initial full sync: narrow window
        params.set("timeMin", new Date(Date.now() - 1 * 24 * 60 * 60_000).toISOString());
        params.set("timeMax", new Date(Date.now() + 14 * 24 * 60 * 60_000).toISOString());
      }

      const url = `${GATEWAY}/calendars/${calendarId}/events?${params.toString()}`;
      console.log(`[gcal-pull] fetching: ${url}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      let r: Response;
      try {
        r = await fetch(url, { headers: gHeaders, signal: controller.signal });
      } catch (fetchErr) {
        clearTimeout(timeout);
        console.error("[gcal-pull] fetch aborted/failed:", fetchErr);
        break; // save progress so far
      }
      clearTimeout(timeout);

      if (r.status === 410) {
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

        // Cancelled event
        if (ev.status === "cancelled") {
          if (appId) {
            await admin.from("atendimentos")
              .update({ status: "cancelado", last_synced_at: new Date().toISOString() })
              .eq("id", appId);
            deletedInApp++;
          } else if (ev.id && isIncremental) {
            // Only look up by google_event_id during incremental sync (small changeset)
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

        if (!ev.start?.dateTime || !ev.end?.dateTime) continue;

        // Event linked to an app atendimento -> update
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

        // During incremental sync, check if event is already tracked
        if (isIncremental && ev.id) {
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
            continue;
          }
        }

        // External event without app match — skip silently during initial sync
        skippedExternal++;
      }

      pageToken = data.nextPageToken;
      nextSyncToken = data.nextSyncToken ?? nextSyncToken;
    } while (pageToken);

    await admin.from("gcal_sync_state").update({
      sync_token: nextSyncToken ?? state.sync_token,
      last_incremental_at: new Date().toISOString(),
      last_full_sync_at: isIncremental ? state.last_full_sync_at : new Date().toISOString(),
    }).eq("id", "default");

    return new Response(JSON.stringify({
      ok: true, processed, updatedInApp, deletedInApp, skippedExternal,
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
