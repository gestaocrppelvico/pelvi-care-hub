
CREATE TABLE IF NOT EXISTS public.crm_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL UNIQUE, -- 'lembrete' | 'retorno' | 'aniversario'
  nome TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view crm templates" ON public.crm_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage crm templates" ON public.crm_templates
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER set_crm_templates_updated_at
  BEFORE UPDATE ON public.crm_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.crm_templates (tipo, nome, conteudo) VALUES
  ('lembrete', 'Lembrete 24h antes',
   'Olá {paciente}! 👋 Passando para confirmar sua sessão de fisioterapia amanhã, {data} às {hora}, com {profissional}. Posso confirmar?'),
  ('retorno', 'Retorno de paciente inativo',
   'Olá {paciente}! 💜 Sentimos sua falta na clínica. Faz {dias_sem_atendimento} dias desde sua última sessão. Que tal agendarmos um retorno para continuar seu tratamento?'),
  ('aniversario', 'Mensagem de aniversário',
   'Feliz aniversário, {paciente}! 🎉🎂 Toda a equipe da clínica deseja um dia incrível e muita saúde. Conte sempre conosco!')
ON CONFLICT (tipo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.crm_envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL,
  tipo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  enviado_por UUID,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view crm envios" ON public.crm_envios
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'secretaria')
    OR EXISTS (
      SELECT 1 FROM public.pacientes p
      WHERE p.id = crm_envios.paciente_id
        AND p.profissional_responsavel_id = public.current_profissional_id()
    )
  );

CREATE POLICY "insert crm envios" ON public.crm_envios
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'secretaria')
    OR EXISTS (
      SELECT 1 FROM public.pacientes p
      WHERE p.id = crm_envios.paciente_id
        AND p.profissional_responsavel_id = public.current_profissional_id()
    )
  );

CREATE INDEX IF NOT EXISTS idx_crm_envios_paciente ON public.crm_envios(paciente_id, enviado_em DESC);

-- Função para data_nascimento do paciente (já existe na tabela). Adicionar coluna se necessário (já existe pelo schema).

-- Helper view: última sessão por paciente
CREATE OR REPLACE VIEW public.v_paciente_ultima_sessao AS
SELECT
  p.id AS paciente_id,
  MAX(a.data_inicio) AS ultima_sessao
FROM public.pacientes p
LEFT JOIN public.atendimentos a
  ON a.paciente_id = p.id AND a.status IN ('realizado','agendado')
GROUP BY p.id;
