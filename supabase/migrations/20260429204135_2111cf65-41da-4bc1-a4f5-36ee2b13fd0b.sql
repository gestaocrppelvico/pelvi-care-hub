
-- Extensions for cron + http calls
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Track last sync per atendimento
ALTER TABLE public.atendimentos
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Global sync state for Google Calendar (single-tenant clinic calendar)
CREATE TABLE IF NOT EXISTS public.gcal_sync_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  sync_token TEXT,
  last_full_sync_at TIMESTAMPTZ,
  last_incremental_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.gcal_sync_state (id, calendar_id)
VALUES ('default', 'primary')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.gcal_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage sync state"
  ON public.gcal_sync_state
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER set_gcal_sync_state_updated_at
  BEFORE UPDATE ON public.gcal_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
