
ALTER TABLE public.atendimentos ALTER COLUMN paciente_id DROP NOT NULL;

ALTER TABLE public.atendimentos ADD COLUMN IF NOT EXISTS nome_paciente_livre text;
ALTER TABLE public.atendimentos ADD COLUMN IF NOT EXISTS telefone_contato text;
