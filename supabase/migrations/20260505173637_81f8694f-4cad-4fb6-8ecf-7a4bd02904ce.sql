
-- Revoke all column access, then re-grant only safe columns to authenticated
REVOKE SELECT ON public.profissionais FROM authenticated;

GRANT SELECT (id, user_id, nome, email, especialidade, cor_agenda, google_calendar_color_id, unidade, ativo, created_at, updated_at)
ON public.profissionais TO authenticated;

-- Admins access financial fields via service role in edge functions or via the admin manage policy
-- For admin UI pages that need financial data, they can use the profissionais table directly
-- since the admin manage policy + column grants work together
GRANT SELECT (valor_repasse, tipo_repasse) ON public.profissionais TO authenticated;

-- Actually, we can't selectively grant per-role at column level without more complexity.
-- Let's revert and keep the view approach as defense-in-depth since all client code already selects safe columns.
REVOKE SELECT (valor_repasse, tipo_repasse) ON public.profissionais FROM authenticated;
