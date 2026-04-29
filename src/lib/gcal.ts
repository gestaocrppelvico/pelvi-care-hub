import { supabase } from "@/integrations/supabase/client";

/**
 * Sincroniza um atendimento com o Google Calendar da clínica.
 * Falhas são logadas mas não interrompem o fluxo do usuário (best-effort).
 */
export async function syncAtendimentoToGCal(
  atendimentoId: string,
  action: "create" | "update" | "delete"
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("gcal-push", {
      body: { atendimento_id: atendimentoId, action },
    });
    if (error) console.warn("[gcal-push]", error.message);
  } catch (e) {
    console.warn("[gcal-push] failed", e);
  }
}
