// Pull events from Google Calendar -> app (per-professional calendars)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

interface PullBody {
  // Optional: array of calendar IDs to sync. If empty, syncs all profissionais' calendars.
  calendar_ids?: string[];
  // Optional: profissional_id to sync only one professional's calendar
  profissional_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GCAL_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!GCAL_KEY) throw new Error("GOOGLE_CALENDAR_API_KEY not configured");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Parse optional body
    let body: PullBody = {};
    try { body = await req.json(); } catch { /* no body is fine */ }

    // Determine which calendars to pull
    let calendarEntries: { calendar_id: string; profissional_id: string | null }[] = [];

    if (body.profissional_id) {
      // Single professional
      const { data: prof } = await admin.from("profissionais").select("id, google_calendar_id").eq("id", body.profissional_id).maybeSingle();
      if (prof) {
        calendarEntries.push({ calendar_id: prof.google_calendar_id || "primary", profissional_id: prof.id });
      }
    } else if (body.calendar_ids && body.calendar_ids.length > 0) {
      // Explicit list
      for (const cid of body.calendar_ids) {
        calendarEntries.push({ calendar_id: cid, profissional_id: null });
      }
    } else {
      // All professionals with google_calendar_id set
      const { data: profs } = await admin.from("profissionais").select("id, google_calendar_id").eq("ativo", true);
      if (profs) {
        for (const p of profs) {
          if (p.google_calendar_id) {
            calendarEntries.push({ calendar_id: p.google_calendar_id, profissional_id: p.id });
          }
        }
      }
      // Also pull "primary" for events not tied to a specific calendar
      calendarEntries.push({ calendar_id: "primary", profissional_id: null });
    }

    // Deduplicate by calendar_id
    const seen = new Set<string>();
    calendarEntries = calendarEntries.filter((e) => {
      if (seen.has(e.calendar_id)) return false;
      seen.add(e.calendar_id);
      return true;
    });

    const gHeaders = {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GCAL_KEY,
    };

    const startedAt = Date.now();
    const MAX_RUNTIME_MS = 110_000;
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    const calendarResults: Record<string, { processed: number; updated: number }> = {};

    for (const entry of calendarEntries) {
      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        console.warn("[gcal-pull] approaching timeout, stopping calendar loop");
        break;
      }

      const calId = encodeURIComponent(entry.calendar_id);
      let pageToken: string | undefined;
      let calProcessed = 0;
      let calUpdated = 0;

      do {
        if (Date.now() - startedAt > MAX_RUNTIME_MS) break;

        const params = new URLSearchParams();
        params.set("singleEvents", "true");
        params.set("maxResults", "50");
        params.set("timeMin", new Date(Date.now() - 1 * 24 * 60 * 60_000).toISOString());
        params.set("timeMax", new Date(Date.now() + 14 * 24 * 60 * 60_000).toISOString());
        if (pageToken) params.set("pageToken", pageToken);

        const url = `${GATEWAY}/calendars/${calId}/events?${params.toString()}`;
        console.log(`[gcal-pull] fetching: ${url}`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        let r: Response;
        try {
          r = await fetch(url, { headers: gHeaders, signal: controller.signal });
        } catch (fetchErr) {
          clearTimeout(timeout);
          console.error(`[gcal-pull] fetch failed for ${entry.calendar_id}:`, fetchErr);
          break;
        }
        clearTimeout(timeout);

        if (!r.ok) {
          const t = await r.text();
          console.error(`[gcal-pull] calendar ${entry.calendar_id} error [${r.status}]: ${t}`);
          break;
        }

        const data = await r.json();

        for (const ev of data.items ?? []) {
          calProcessed++;

          if (!ev.start?.dateTime || !ev.end?.dateTime) continue;

          const appId = ev.extendedProperties?.private?.appAtendimentoId as string | undefined;

          // Cancelled
          if (ev.status === "cancelled") {
            if (appId) {
              await admin.from("atendimentos")
                .update({ status: "cancelado", last_synced_at: new Date().toISOString() })
                .eq("id", appId);
              calUpdated++;
            } else if (ev.id) {
              const { data: existing } = await admin
                .from("atendimentos").select("id").eq("google_event_id", ev.id).maybeSingle();
              if (existing) {
                await admin.from("atendimentos")
                  .update({ status: "cancelado", last_synced_at: new Date().toISOString() })
                  .eq("id", existing.id);
                calUpdated++;
              }
            }
            continue;
          }

          // Linked to app
          if (appId) {
            await admin.from("atendimentos").update({
              data_inicio: ev.start.dateTime,
              data_fim: ev.end.dateTime,
              google_event_id: ev.id,
              last_synced_at: new Date().toISOString(),
            }).eq("id", appId);
            calUpdated++;
            continue;
          }

          // Check by google_event_id
          if (ev.id) {
            const { data: existing } = await admin
              .from("atendimentos").select("id").eq("google_event_id", ev.id).maybeSingle();
            if (existing) {
              await admin.from("atendimentos").update({
                data_inicio: ev.start.dateTime,
                data_fim: ev.end.dateTime,
                last_synced_at: new Date().toISOString(),
              }).eq("id", existing.id);
              calUpdated++;
              continue;
            }
          }

          totalSkipped++;
        }

        pageToken = data.nextPageToken;
      } while (pageToken);

      calendarResults[entry.calendar_id] = { processed: calProcessed, updated: calUpdated };
      totalProcessed += calProcessed;
      totalUpdated += calUpdated;
    }

    return new Response(JSON.stringify({
      ok: true,
      calendars: calendarResults,
      totalProcessed,
      totalUpdated,
      totalSkipped,
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
