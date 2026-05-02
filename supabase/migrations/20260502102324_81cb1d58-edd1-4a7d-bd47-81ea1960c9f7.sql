ALTER TYPE public.status_atendimento ADD VALUE IF NOT EXISTS 'em_andamento' BEFORE 'realizado';

-- Permitir fisios deletar pacientes sob sua responsabilidade
CREATE POLICY "fisio delete own pacientes" ON public.pacientes
FOR DELETE TO authenticated
USING (
  is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'::app_role)
);

-- Permitir fisios e sec deletar médicos
CREATE POLICY "admin sec delete medicos" ON public.medicos
FOR DELETE TO authenticated
USING (
  is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'::app_role)
);

-- Permitir fisios atualizar médicos (para marcar visita)
CREATE POLICY "fisio update medicos" ON public.medicos
FOR UPDATE TO authenticated
USING (
  is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'::app_role) OR has_role(auth.uid(), 'fisio'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR has_role(auth.uid(), 'secretaria'::app_role) OR has_role(auth.uid(), 'fisio'::app_role)
);