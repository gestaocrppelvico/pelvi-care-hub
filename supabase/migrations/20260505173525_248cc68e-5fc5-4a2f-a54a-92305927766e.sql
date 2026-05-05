
-- Create a public view of profissionais that excludes financial fields
CREATE OR REPLACE VIEW public.profissionais_public AS
SELECT id, user_id, nome, email, especialidade, cor_agenda, google_calendar_color_id, unidade, ativo, created_at, updated_at
FROM public.profissionais;

-- Grant access to authenticated users
GRANT SELECT ON public.profissionais_public TO authenticated;

-- Tighten the SELECT policy: admins/secretarias see all, fisios see only their own row
DROP POLICY IF EXISTS "auth view profissionais" ON public.profissionais;

CREATE POLICY "auth view profissionais" ON public.profissionais
  FOR SELECT TO authenticated USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'secretaria')
    OR (user_id = auth.uid())
  );
