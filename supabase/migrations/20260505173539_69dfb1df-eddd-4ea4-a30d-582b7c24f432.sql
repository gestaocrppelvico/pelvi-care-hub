
-- Recreate view with SECURITY INVOKER
DROP VIEW IF EXISTS public.profissionais_public;

CREATE VIEW public.profissionais_public
WITH (security_invoker = on) AS
SELECT id, user_id, nome, email, especialidade, cor_agenda, google_calendar_color_id, unidade, ativo, created_at, updated_at
FROM public.profissionais;

GRANT SELECT ON public.profissionais_public TO authenticated;
