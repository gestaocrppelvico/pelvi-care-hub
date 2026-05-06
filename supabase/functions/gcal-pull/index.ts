// Mirror Google Calendar events → atendimentos (read-only sync)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

interface PullBody {
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

    let body: PullBody = {};
    try { body = await req.json(); } catch { /* ok */ }

    // Build calendar list from profissionais
    interface CalEntry { calendar_id: string; profissional_id: string }
    let calendarEntries: CalEntry[] = [];

    if (body.profissional_id) {
      const { data: prof } = await admin.from("profissionais").select("id, google_calendar_id").eq("id", body.profissional_id).maybeSingle();
      if (prof?.google_calendar_id) {
        calendarEntries.push({ calendar_id: prof.google_calendar_id, profissional_id: prof.id });
      }
    } else {
      const { data: profs } = await admin.from("profissionais").select("id, google_calendar_id").eq("ativo", true);
      if (profs) {
        for (const p of profs) {
          if (p.google_calendar_id) {
            calendarEntries.push({ calendar_id: p.google_calendar_id, profissional_id: p.id });
          }
        }
      }
    }

    if (calendarEntries.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No calendars configured" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate
    const seen = new Set<string>();
    calendarEntries = calendarEntries.filter((e) => {
      if (seen.has(e.calendar_id)) return false;
      seen.add(e.calendar_id);
      return true;
    });

    // Load all patients for name matching
    const { data: allPacientes } = await admin.from("pacientes").select("id, nome").eq("ativo", true);
    const pacienteMap = new Map<string, string>(); // lowercase name -> id
    for (const p of allPacientes ?? []) {
      pacienteMap.set(p.nome.toLowerCase().trim(), p.id);
    }

    const gHeaders = {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GCAL_KEY,
    };

    const startedAt = Date.now();
    const MAX_MS = 110_000;
    let created = 0, updated = 0, skipped = 0;

    for (const entry of calendarEntries) {
      if (Date.now() - startedAt > MAX_MS) break;

      const calId = encodeURIComponent(entry.calendar_id);
      let pageToken: string | undefined;

      do {
        if (Date.now() - startedAt > MAX_MS) break;

        const params = new URLSearchParams();
        params.set("singleEvents", "true");
        params.set("maxResults", "50");
        params.set("timeMin", new Date(Date.now() - 1 * 24 * 60 * 60_000).toISOString());
        params.set("timeMax", new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString());
        if (pageToken) params.set("pageToken", pageToken);

        const url = `${GATEWAY}/calendars/${calId}/events?${params}`;
        console.log(`[gcal-pull] fetching: ${url}`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        let r: Response;
        try {
          r = await fetch(url, { headers: gHeaders, signal: controller.signal });
        } catch (err) {
          clearTimeout(timeout);
          console.error(`[gcal-pull] fetch failed ${entry.calendar_id}:`, err);
          break;
        }
        clearTimeout(timeout);

        if (!r.ok) {
          console.error(`[gcal-pull] ${entry.calendar_id} [${r.status}]: ${await r.text()}`);
          break;
        }

        const data = await r.json();

        for (const ev of data.items ?? []) {
          if (!ev.start?.dateTime || !ev.end?.dateTime) continue;
          if (!ev.id) continue;

          const googleEventId = ev.id as string;

          // Handle cancelled events
          if (ev.status === "cancelled") {
            const { data: existing } = await admin
              .from("atendimentos").select("id").eq("google_event_id", googleEventId).maybeSingle();
            if (existing) {
              await admin.from("atendimentos")
                .update({ status: "cancelado", last_synced_at: new Date().toISOString() })
                .eq("id", existing.id);
              updated++;
            }
            continue;
          }

          // Check if atendimento already exists for this event
          const { data: existing } = await admin
            .from("atendimentos").select("id, status").eq("google_event_id", googleEventId).maybeSingle();

          const summary = (ev.summary ?? "").trim();

          if (existing) {
            // Update time only (don't overwrite status if user changed it)
            await admin.from("atendimentos").update({
              data_inicio: ev.start.dateTime,
              data_fim: ev.end.dateTime,
              last_synced_at: new Date().toISOString(),
            }).eq("id", existing.id);
            updated++;
          } else {
            // Try to match patient by name
            // GCal summary often is "Patient Name — Service" or just "Patient Name"
            const namePart = summary.split("—")[0].split("-")[0].trim();
            const matchedPacienteId = pacienteMap.get(namePart.toLowerCase()) ?? null;

            await admin.from("atendimentos").insert({
              google_event_id: googleEventId,
              data_inicio: ev.start.dateTime,
              data_fim: ev.end.dateTime,
              profissional_id: entry.profissional_id,
              paciente_id: matchedPacienteId,
              nome_paciente_livre: matchedPacienteId ? null : (namePart || summary || null),
              status: "agendado",
              tipo: "Plano",
              observacoes: ev.description ?? null,
              last_synced_at: new Date().toISOString(),
            });
            created++;
          }
        }

        pageToken = data.nextPageToken;
      } while (pageToken);
    }

    return new Response(JSON.stringify({ ok: true, created, updated, skipped }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gcal-pull error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
