-- =========================================
-- ENUMS
-- =========================================
CREATE TYPE public.app_role AS ENUM ('admin', 'secretaria', 'fisio');
CREATE TYPE public.tipo_atendimento AS ENUM ('Plano', 'Particular');
CREATE TYPE public.status_atendimento AS ENUM ('agendado', 'realizado', 'cancelado', 'faltou');
CREATE TYPE public.status_autorizacao AS ENUM ('ativa', 'expirada', 'esgotada', 'pendente');
CREATE TYPE public.tipo_repasse AS ENUM ('fixo', 'percentual');
CREATE TYPE public.tipo_movimentacao AS ENUM ('entrada', 'saida');

-- =========================================
-- PROFILES (linked 1-1 to auth.users)
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  telefone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================================
-- USER ROLES (separate table — security best practice)
-- =========================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- =========================================
-- PROFISSIONAIS
-- =========================================
CREATE TABLE public.profissionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  email TEXT,
  especialidade TEXT,
  cor_agenda TEXT NOT NULL DEFAULT '#3B82F6',
  google_calendar_color_id TEXT,
  unidade TEXT,
  tipo_repasse public.tipo_repasse NOT NULL DEFAULT 'percentual',
  valor_repasse NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;

-- =========================================
-- MEDICOS
-- =========================================
CREATE TABLE public.medicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  especialidade TEXT,
  crm TEXT,
  telefone TEXT,
  whatsapp TEXT,
  email TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  planos_atendidos TEXT[] DEFAULT '{}',
  observacoes TEXT,
  ultima_visita DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.medicos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_medicos_coords ON public.medicos (latitude, longitude);

-- =========================================
-- PACIENTES
-- =========================================
CREATE TABLE public.pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cpf TEXT,
  data_nascimento DATE,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  plano_saude TEXT,
  numero_carteirinha TEXT,
  medico_solicitante_id UUID REFERENCES public.medicos(id) ON DELETE SET NULL,
  profissional_responsavel_id UUID REFERENCES public.profissionais(id) ON DELETE SET NULL,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;

-- =========================================
-- AUTORIZACOES
-- =========================================
CREATE TABLE public.autorizacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  plano TEXT NOT NULL,
  numero_guia TEXT,
  sessoes_autorizadas INT NOT NULL DEFAULT 0,
  sessoes_realizadas INT NOT NULL DEFAULT 0,
  data_emissao DATE,
  data_validade DATE,
  status public.status_autorizacao NOT NULL DEFAULT 'pendente',
  arquivo_pedido_url TEXT,
  arquivo_guia_url TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.autorizacoes ENABLE ROW LEVEL SECURITY;

-- =========================================
-- ATENDIMENTOS
-- =========================================
CREATE TABLE public.atendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  profissional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE RESTRICT,
  autorizacao_id UUID REFERENCES public.autorizacoes(id) ON DELETE SET NULL,
  data_inicio TIMESTAMPTZ NOT NULL,
  data_fim TIMESTAMPTZ,
  tipo public.tipo_atendimento NOT NULL DEFAULT 'Plano',
  status public.status_atendimento NOT NULL DEFAULT 'agendado',
  valor NUMERIC(10,2),
  unidade TEXT,
  evolucao TEXT,
  observacoes TEXT,
  assinatura_paciente_url TEXT,
  google_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_atend_data ON public.atendimentos (data_inicio);
CREATE INDEX idx_atend_prof ON public.atendimentos (profissional_id);

-- =========================================
-- MODELOS DE DOCUMENTOS
-- =========================================
CREATE TABLE public.modelos_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  nome TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.modelos_documentos ENABLE ROW LEVEL SECURITY;

-- =========================================
-- DOCUMENTOS DOS PACIENTES
-- =========================================
CREATE TABLE public.documentos_pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  modelo_id UUID REFERENCES public.modelos_documentos(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  nome TEXT NOT NULL,
  arquivo_url TEXT,
  conteudo_gerado TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.documentos_pacientes ENABLE ROW LEVEL SECURITY;

-- =========================================
-- ESTOQUE
-- =========================================
CREATE TABLE public.estoque_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  categoria TEXT,
  unidade TEXT NOT NULL DEFAULT 'un',
  quantidade_atual NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantidade_minima NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.estoque_insumos ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.movimentacao_estoque (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id UUID NOT NULL REFERENCES public.estoque_insumos(id) ON DELETE CASCADE,
  tipo public.tipo_movimentacao NOT NULL,
  quantidade NUMERIC(10,2) NOT NULL,
  atendimento_id UUID REFERENCES public.atendimentos(id) ON DELETE SET NULL,
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.movimentacao_estoque ENABLE ROW LEVEL SECURITY;

-- =========================================
-- TRIGGERS: updated_at
-- =========================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER t_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_profissionais_updated BEFORE UPDATE ON public.profissionais FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_medicos_updated BEFORE UPDATE ON public.medicos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_pacientes_updated BEFORE UPDATE ON public.pacientes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_autoriz_updated BEFORE UPDATE ON public.autorizacoes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_atend_updated BEFORE UPDATE ON public.atendimentos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_modelos_updated BEFORE UPDATE ON public.modelos_documentos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_estoque_updated BEFORE UPDATE ON public.estoque_insumos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- AUTO PROFILE ON SIGNUP
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome_completo)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome_completo', ''));
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- HELPER: get profissional_id of current user
-- =========================================
CREATE OR REPLACE FUNCTION public.current_profissional_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profissionais WHERE user_id = auth.uid() LIMIT 1
$$;

-- =========================================
-- RLS POLICIES
-- =========================================

-- profiles
CREATE POLICY "view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "admin all profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- user_roles: only admins can manage; users can view own
CREATE POLICY "view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- profissionais: all authenticated can view; only admin manages
CREATE POLICY "auth view profissionais" ON public.profissionais FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage profissionais" ON public.profissionais FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- medicos: admin + secretaria full; fisio read-only
CREATE POLICY "view medicos" ON public.medicos FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin sec manage medicos" ON public.medicos FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretaria'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretaria'));

-- pacientes: admin/secretaria all; fisio only theirs
CREATE POLICY "view pacientes" ON public.pacientes FOR SELECT TO authenticated USING (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'secretaria')
  OR profissional_responsavel_id = public.current_profissional_id()
);
CREATE POLICY "admin sec manage pacientes" ON public.pacientes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretaria'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretaria'));

-- autorizacoes
CREATE POLICY "view autorizacoes" ON public.autorizacoes FOR SELECT TO authenticated USING (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'secretaria')
  OR EXISTS (SELECT 1 FROM public.pacientes p WHERE p.id = paciente_id AND p.profissional_responsavel_id = public.current_profissional_id())
);
CREATE POLICY "admin sec manage autorizacoes" ON public.autorizacoes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretaria'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretaria'));

-- atendimentos: fisio sees own; secretaria sees all but evolution hidden in UI; admin all
CREATE POLICY "view atendimentos" ON public.atendimentos FOR SELECT TO authenticated USING (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'secretaria')
  OR profissional_id = public.current_profissional_id()
);
CREATE POLICY "fisio manage own atend" ON public.atendimentos FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'secretaria')
    OR profissional_id = public.current_profissional_id()
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'secretaria')
    OR profissional_id = public.current_profissional_id()
  );

-- modelos_documentos
CREATE POLICY "view modelos" ON public.modelos_documentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage modelos" ON public.modelos_documentos FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- documentos_pacientes
CREATE POLICY "view docs pacientes" ON public.documentos_pacientes FOR SELECT TO authenticated USING (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'secretaria')
  OR EXISTS (SELECT 1 FROM public.pacientes p WHERE p.id = paciente_id AND p.profissional_responsavel_id = public.current_profissional_id())
);
CREATE POLICY "create docs pacientes" ON public.documentos_pacientes FOR INSERT TO authenticated WITH CHECK (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'secretaria')
  OR EXISTS (SELECT 1 FROM public.pacientes p WHERE p.id = paciente_id AND p.profissional_responsavel_id = public.current_profissional_id())
);
CREATE POLICY "admin manage docs" ON public.documentos_pacientes FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- estoque
CREATE POLICY "view estoque" ON public.estoque_insumos FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin sec manage estoque" ON public.estoque_insumos FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretaria'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretaria'));

CREATE POLICY "view mov estoque" ON public.movimentacao_estoque FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth create mov" ON public.movimentacao_estoque FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin manage mov" ON public.movimentacao_estoque FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- =========================================
-- SEED: profissionais com cores
-- =========================================
INSERT INTO public.profissionais (nome, especialidade, cor_agenda, tipo_repasse, valor_repasse) VALUES
  ('Elizabeth', 'Fisioterapia Pélvica', '#22C55E', 'percentual', 50),
  ('Juliana',   'Fisioterapia Pélvica', '#FACC15', 'percentual', 50),
  ('Wilianne',  'Fisioterapia Pélvica', '#FA8072', 'percentual', 50),
  ('Bruna',     'Fisioterapia Pélvica', '#A855F7', 'percentual', 50);

-- Modelos básicos
INSERT INTO public.modelos_documentos (tipo, nome, conteudo) VALUES
  ('atestado',   'Atestado de Comparecimento', 'Atesto que {{paciente_nome}} compareceu à sessão de fisioterapia em {{data}}.'),
  ('alta',       'Relatório de Alta',         'Paciente {{paciente_nome}} recebeu alta em {{data}}.'),
  ('reembolso',  'Recibo para Reembolso',     'Recibo referente ao atendimento de {{paciente_nome}} em {{data}}, valor R$ {{valor}}.'),
  ('anamnese',   'Anamnese Padrão',           'Queixa principal:\n\nHistória clínica:\n\nAntecedentes:\n\nExame físico:\n\nHipótese diagnóstica:');