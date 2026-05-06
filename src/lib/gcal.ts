// gcal-push is DISABLED — the app no longer writes to Google Calendar.
// This file is kept for backward compatibility but does nothing.

import { supabase } from "@/integrations/supabase/client";

export async function syncAtendimentoToGCal(
  _atendimentoId: string,
  _action: "create" | "update" | "delete"
): Promise<void> {
  // No-op: calendar events are managed directly in Google Calendar
}
