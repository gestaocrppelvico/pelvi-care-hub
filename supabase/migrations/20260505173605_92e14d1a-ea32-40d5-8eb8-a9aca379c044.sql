
-- Restore permissive SELECT so the view works for all authenticated users
DROP POLICY IF EXISTS "auth view profissionais" ON public.profissionais;

CREATE POLICY "auth view profissionais" ON public.profissionais
  FOR SELECT TO authenticated USING (true);
