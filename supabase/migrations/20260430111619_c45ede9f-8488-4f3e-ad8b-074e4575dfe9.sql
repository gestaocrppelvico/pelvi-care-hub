-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE public.tipo_item_financeiro AS ENUM ('servico', 'pacote');
CREATE TYPE public.forma_pagamento AS ENUM ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia', 'plano_saude', 'outro');
CREATE TYPE public.status_pagamento AS ENUM ('pendente', 'pago', 'parcial', 'cancelado');
CREATE TYPE public.status_repasse AS ENUM ('pendente', 'pago', 'cancelado');

-- ============================================
-- CATÁLOGO: SERVIÇOS
-- ============================================
CREATE TABLE public.servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  preco NUMERIC(10,2) NOT NULL DEFAULT 0,
  duracao_minutos INTEGER NOT NULL DEFAULT 40,
  plano TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view servicos" ON public.servicos FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin sec manage servicos" ON public.servicos FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'));
CREATE TRIGGER trg_servicos_updated BEFORE UPDATE ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- CATÁLOGO: PACOTES
-- ============================================
CREATE TABLE public.pacotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  servico_id UUID REFERENCES public.servicos(id) ON DELETE SET NULL,
  numero_sessoes INTEGER NOT NULL CHECK (numero_sessoes > 1),
  preco_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  validade_dias INTEGER,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pacotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view pacotes" ON public.pacotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin sec manage pacotes" ON public.pacotes FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'));
CREATE TRIGGER trg_pacotes_updated BEFORE UPDATE ON public.pacotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- REPASSE: por (serviço OU pacote) × fisio
-- ============================================
CREATE TABLE public.repasses_servico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id UUID NOT NULL,
  item_tipo public.tipo_item_financeiro NOT NULL,
  servico_id UUID REFERENCES public.servicos(id) ON DELETE CASCADE,
  pacote_id UUID REFERENCES public.pacotes(id) ON DELETE CASCADE,
  tipo_repasse public.tipo_repasse NOT NULL DEFAULT 'percentual',
  valor_repasse NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (item_tipo = 'servico' AND servico_id IS NOT NULL AND pacote_id IS NULL) OR
    (item_tipo = 'pacote' AND pacote_id IS NOT NULL AND servico_id IS NULL)
  )
);
CREATE UNIQUE INDEX idx_repasse_servico_unique ON public.repasses_servico(profissional_id, servico_id) WHERE servico_id IS NOT NULL;
CREATE UNIQUE INDEX idx_repasse_pacote_unique ON public.repasses_servico(profissional_id, pacote_id) WHERE pacote_id IS NOT NULL;
ALTER TABLE public.repasses_servico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view repasses servico" ON public.repasses_servico FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria') OR profissional_id = current_profissional_id());
CREATE POLICY "admin manage repasses servico" ON public.repasses_servico FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE TRIGGER trg_repasses_servico_updated BEFORE UPDATE ON public.repasses_servico
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- FICHA FINANCEIRA: PACOTES DO PACIENTE
-- ============================================
CREATE TABLE public.paciente_pacotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL,
  pacote_id UUID NOT NULL REFERENCES public.pacotes(id) ON DELETE RESTRICT,
  data_compra DATE NOT NULL DEFAULT CURRENT_DATE,
  data_validade DATE,
  sessoes_totais INTEGER NOT NULL,
  sessoes_restantes INTEGER NOT NULL,
  preco_pago NUMERIC(10,2) NOT NULL DEFAULT 0,
  status_pagamento public.status_pagamento NOT NULL DEFAULT 'pendente',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
CREATE INDEX idx_paciente_pacotes_paciente ON public.paciente_pacotes(paciente_id);
ALTER TABLE public.paciente_pacotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view paciente pacotes" ON public.paciente_pacotes FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria') OR
    EXISTS (SELECT 1 FROM pacientes p WHERE p.id = paciente_pacotes.paciente_id AND p.profissional_responsavel_id = current_profissional_id())
  );
CREATE POLICY "admin sec manage paciente pacotes" ON public.paciente_pacotes FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'));
CREATE TRIGGER trg_paciente_pacotes_updated BEFORE UPDATE ON public.paciente_pacotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- FICHA FINANCEIRA: SERVIÇOS AVULSOS DO PACIENTE
-- ============================================
CREATE TABLE public.paciente_servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL,
  servico_id UUID NOT NULL REFERENCES public.servicos(id) ON DELETE RESTRICT,
  data_compra DATE NOT NULL DEFAULT CURRENT_DATE,
  preco_pago NUMERIC(10,2) NOT NULL DEFAULT 0,
  status_pagamento public.status_pagamento NOT NULL DEFAULT 'pendente',
  utilizado BOOLEAN NOT NULL DEFAULT false,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
CREATE INDEX idx_paciente_servicos_paciente ON public.paciente_servicos(paciente_id);
ALTER TABLE public.paciente_servicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view paciente servicos" ON public.paciente_servicos FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria') OR
    EXISTS (SELECT 1 FROM pacientes p WHERE p.id = paciente_servicos.paciente_id AND p.profissional_responsavel_id = current_profissional_id())
  );
CREATE POLICY "admin sec manage paciente servicos" ON public.paciente_servicos FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'));
CREATE TRIGGER trg_paciente_servicos_updated BEFORE UPDATE ON public.paciente_servicos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- PAGAMENTOS DO PACIENTE
-- ============================================
CREATE TABLE public.pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL,
  paciente_pacote_id UUID REFERENCES public.paciente_pacotes(id) ON DELETE SET NULL,
  paciente_servico_id UUID REFERENCES public.paciente_servicos(id) ON DELETE SET NULL,
  valor NUMERIC(10,2) NOT NULL,
  forma public.forma_pagamento NOT NULL DEFAULT 'pix',
  data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
CREATE INDEX idx_pagamentos_paciente ON public.pagamentos(paciente_id);
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view pagamentos" ON public.pagamentos FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria') OR
    EXISTS (SELECT 1 FROM pacientes p WHERE p.id = pagamentos.paciente_id AND p.profissional_responsavel_id = current_profissional_id())
  );
CREATE POLICY "admin sec manage pagamentos" ON public.pagamentos FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'));

-- ============================================
-- REPASSES POR ATENDIMENTO (gerado automático)
-- ============================================
CREATE TABLE public.repasses_atendimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id UUID NOT NULL UNIQUE,
  profissional_id UUID NOT NULL,
  servico_id UUID REFERENCES public.servicos(id) ON DELETE SET NULL,
  pacote_id UUID REFERENCES public.pacotes(id) ON DELETE SET NULL,
  valor_atendimento NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_repasse NUMERIC(10,2) NOT NULL DEFAULT 0,
  status public.status_repasse NOT NULL DEFAULT 'pendente',
  data_pagamento DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_repasses_atend_prof ON public.repasses_atendimento(profissional_id, status);
ALTER TABLE public.repasses_atendimento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view repasses atend" ON public.repasses_atendimento FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria') OR profissional_id = current_profissional_id());
CREATE POLICY "admin sec manage repasses atend" ON public.repasses_atendimento FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'));
CREATE TRIGGER trg_repasses_atend_updated BEFORE UPDATE ON public.repasses_atendimento
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- ATENDIMENTOS: vincular serviço/pacote
-- ============================================
ALTER TABLE public.atendimentos
  ADD COLUMN IF NOT EXISTS servico_id UUID REFERENCES public.servicos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paciente_pacote_id UUID REFERENCES public.paciente_pacotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paciente_servico_id UUID REFERENCES public.paciente_servicos(id) ON DELETE SET NULL;

-- ============================================
-- TRIGGER: ao concluir atendimento, descontar pacote + gerar repasse
-- ============================================
CREATE OR REPLACE FUNCTION public.processar_atendimento_realizado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valor_base NUMERIC(10,2);
  v_repasse_tipo public.tipo_repasse;
  v_repasse_valor NUMERIC(10,2);
  v_repasse_calculado NUMERIC(10,2);
  v_servico_id UUID;
  v_pacote_id UUID;
BEGIN
  -- Só processa quando muda PARA 'realizado'
  IF NEW.status <> 'realizado' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'realizado' THEN RETURN NEW; END IF;

  -- Identifica serviço/pacote
  v_servico_id := NEW.servico_id;
  IF NEW.paciente_pacote_id IS NOT NULL THEN
    SELECT pacote_id INTO v_pacote_id FROM public.paciente_pacotes WHERE id = NEW.paciente_pacote_id;
    -- Desconta 1 sessão (não negativo)
    UPDATE public.paciente_pacotes
       SET sessoes_restantes = GREATEST(sessoes_restantes - 1, 0)
     WHERE id = NEW.paciente_pacote_id;
    -- Valor base = preço unitário do pacote
    SELECT CASE WHEN p.numero_sessoes > 0 THEN p.preco_total / p.numero_sessoes ELSE 0 END
      INTO v_valor_base FROM public.pacotes p WHERE p.id = v_pacote_id;
  ELSIF NEW.paciente_servico_id IS NOT NULL THEN
    UPDATE public.paciente_servicos SET utilizado = true WHERE id = NEW.paciente_servico_id;
    SELECT preco_pago INTO v_valor_base FROM public.paciente_servicos WHERE id = NEW.paciente_servico_id;
  ELSIF v_servico_id IS NOT NULL THEN
    SELECT preco INTO v_valor_base FROM public.servicos WHERE id = v_servico_id;
  ELSE
    v_valor_base := COALESCE(NEW.valor, 0);
  END IF;

  -- Override: se atendimento.valor preenchido, usa
  IF NEW.valor IS NOT NULL AND NEW.valor > 0 THEN
    v_valor_base := NEW.valor;
  END IF;

  -- Busca repasse específico (servico+fisio ou pacote+fisio)
  IF v_pacote_id IS NOT NULL THEN
    SELECT tipo_repasse, valor_repasse INTO v_repasse_tipo, v_repasse_valor
      FROM public.repasses_servico
     WHERE profissional_id = NEW.profissional_id AND pacote_id = v_pacote_id AND ativo = true
     LIMIT 1;
  ELSIF v_servico_id IS NOT NULL THEN
    SELECT tipo_repasse, valor_repasse INTO v_repasse_tipo, v_repasse_valor
      FROM public.repasses_servico
     WHERE profissional_id = NEW.profissional_id AND servico_id = v_servico_id AND ativo = true
     LIMIT 1;
  END IF;

  -- Fallback: repasse do cadastro do profissional
  IF v_repasse_tipo IS NULL THEN
    SELECT tipo_repasse, valor_repasse INTO v_repasse_tipo, v_repasse_valor
      FROM public.profissionais WHERE id = NEW.profissional_id;
  END IF;

  IF v_repasse_tipo = 'percentual' THEN
    v_repasse_calculado := COALESCE(v_valor_base, 0) * COALESCE(v_repasse_valor, 0) / 100.0;
  ELSE
    v_repasse_calculado := COALESCE(v_repasse_valor, 0);
  END IF;

  -- Upsert repasse_atendimento
  INSERT INTO public.repasses_atendimento (atendimento_id, profissional_id, servico_id, pacote_id, valor_atendimento, valor_repasse)
  VALUES (NEW.id, NEW.profissional_id, v_servico_id, v_pacote_id, COALESCE(v_valor_base, 0), ROUND(v_repasse_calculado, 2))
  ON CONFLICT (atendimento_id) DO UPDATE
    SET valor_atendimento = EXCLUDED.valor_atendimento,
        valor_repasse = EXCLUDED.valor_repasse,
        servico_id = EXCLUDED.servico_id,
        pacote_id = EXCLUDED.pacote_id,
        profissional_id = EXCLUDED.profissional_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_atend_realizado
AFTER INSERT OR UPDATE OF status, valor, servico_id, paciente_pacote_id, paciente_servico_id
ON public.atendimentos
FOR EACH ROW EXECUTE FUNCTION public.processar_atendimento_realizado();