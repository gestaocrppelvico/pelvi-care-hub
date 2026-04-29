// Push atendimento changes to Google Calendar (clinic single calendar)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

interface PushBody {
  atendimento_id: string;
  action: "create" | "update" | "delete";
}

const PALETTE = ["1","2","3","4","5","6","7","8","9","10","11"]; // Google colorIds

function colorIdFor(hex: string | null | undefined): string {
  if (!hex) return "1";
  // simple deterministic mapping based on hex hash
  let h = 0;
  for (const c of hex) h = (h * 31 + c.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GCAL_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!GCAL_KEY) throw new Error("GOOGLE_CALENDAR_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // auth: validate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as PushBody;
    if (!body.atendimento_id || !body.action) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: state } = await admin.from("gcal_sync_state").select("calendar_id").eq("id", "default").single();
    const calendarId = encodeURIComponent(state?.calendar_id ?? "primary");

    const { data: at, error: atErr } = await admin
      .from("atendimentos")
      .select("id, data_inicio, data_fim, status, tipo, observacoes, google_event_id, paciente:pacientes(nome), profissional:profissionais(nome, cor_agenda)")
      .eq("id", body.atendimento_id)
      .maybeSingle();

    if (atErr) throw atErr;

    const gHeaders = {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GCAL_KEY,
      "Content-Type": "application/json",
    };

    // DELETE
    if (body.action === "delete") {
      if (!at?.google_event_id) {
        return new Response(JSON.stringify({ ok: true, skipped: "no event" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const r = await fetch(`${GATEWAY}/calendars/${calendarId}/events/${at.google_event_id}`, {
        method: "DELETE", headers: gHeaders,
      });
      if (!r.ok && r.status !== 410 && r.status !== 404) {
        const t = await r.text();
        throw new Error(`delete failed [${r.status}]: ${t}`);
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!at) {
      return new Response(JSON.stringify({ error: "atendimento not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CREATE / UPDATE payload
    const pacienteNome = (at as any).paciente?.nome ?? "Paciente";
    const profNome = (at as any).profissional?.nome ?? "";
    const profCor = (at as any).profissional?.cor_agenda ?? null;
    const event = {
      summary: `${pacienteNome} — ${at.tipo}`,
      description: [
        `Profissional: ${profNome}`,
        `Status: ${at.status}`,
        at.observacoes ? `Obs: ${at.observacoes}` : "",
        `\nID app: ${at.id}`,
      ].filter(Boolean).join("\n"),
      start: { dateTime: at.data_inicio, timeZone: "America/Sao_Paulo" },
      end: { dateTime: at.data_fim ?? new Date(new Date(at.data_inicio).getTime() + 40 * 60_000).toISOString(), timeZone: "America/Sao_Paulo" },
      colorId: colorIdFor(profCor),
      extendedProperties: { private: { appAtendimentoId: at.id } },
      status: at.status === "cancelado" ? "cancelled" : "confirmed",
    };

    let resp: Response;
    if (body.action === "update" && at.google_event_id) {
      resp = await fetch(`${GATEWAY}/calendars/${calendarId}/events/${at.google_event_id}`, {
        method: "PATCH", headers: gHeaders, body: JSON.stringify(event),
      });
    } else {
      resp = await fetch(`${GATEWAY}/calendars/${calendarId}/events`, {
        method: "POST", headers: gHeaders, body: JSON.stringify(event),
      });
    }

    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`gcal write failed [${resp.status}]: ${t}`);
    }
    const ev = await resp.json();

    await admin.from("atendimentos").update({
      google_event_id: ev.id,
      last_synced_at: new Date().toISOString(),
    }).eq("id", at.id);

    return new Response(JSON.stringify({ ok: true, eventId: ev.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gcal-push error:", e);
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
