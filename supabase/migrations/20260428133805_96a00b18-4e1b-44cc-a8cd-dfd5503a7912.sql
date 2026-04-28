-- Tabela de prontuários (uma evolução por atendimento)
CREATE TABLE public.prontuarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  atendimento_id UUID NOT NULL UNIQUE,
  paciente_id UUID NOT NULL,
  profissional_id UUID NOT NULL,
  queixa_principal TEXT,
  escala_dor SMALLINT CHECK (escala_dor >= 0 AND escala_dor <= 10),
  avaliacao_funcional TEXT,
  conduta TEXT,
  exercicios_prescritos TEXT,
  evolucao_livre TEXT,
  proximos_passos TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prontuarios_paciente ON public.prontuarios(paciente_id);
CREATE INDEX idx_prontuarios_atendimento ON public.prontuarios(atendimento_id);
CREATE INDEX idx_prontuarios_profissional ON public.prontuarios(profissional_id);

ALTER TABLE public.prontuarios ENABLE ROW LEVEL SECURITY;

-- Acesso: admin OU fisio responsável pelo paciente
CREATE POLICY "view prontuarios"
ON public.prontuarios
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.pacientes p
    WHERE p.id = prontuarios.paciente_id
      AND p.profissional_responsavel_id = current_profissional_id()
  )
);

CREATE POLICY "insert prontuarios"
ON public.prontuarios
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.pacientes p
    WHERE p.id = prontuarios.paciente_id
      AND p.profissional_responsavel_id = current_profissional_id()
  )
);

CREATE POLICY "update prontuarios"
ON public.prontuarios
FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.pacientes p
    WHERE p.id = prontuarios.paciente_id
      AND p.profissional_responsavel_id = current_profissional_id()
  )
);

CREATE POLICY "delete prontuarios"
ON public.prontuarios
FOR DELETE
TO authenticated
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.pacientes p
    WHERE p.id = prontuarios.paciente_id
      AND p.profissional_responsavel_id = current_profissional_id()
  )
);

CREATE TRIGGER trg_prontuarios_updated_at
BEFORE UPDATE ON public.prontuarios
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();