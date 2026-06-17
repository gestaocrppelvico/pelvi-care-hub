import { supabase } from '@/integrations/supabase/client';

// Buscar atendimentos do paciente que não têm evolução
export async function buscarAtendimentosSemEvolucao(pacienteId: string) {
  const { data, error } = await supabase
    .from('atendimentos')
    .select(`
      id,
      data_inicio,
      status,
      tipo,
      paciente_pacotes ( pacotes ( nome ) )
    `)
    .eq('paciente_id', pacienteId)
    .eq('status', 'realizado')
    .is('prontuarios.id', null) // LEFT JOIN implícito via relação
    .order('data_inicio', { ascending: false });

  if (error) throw error;
  return data;
}

// Buscar pacote ativo do paciente
export async function buscarPacoteAtivo(pacienteId: string) {
  const { data, error } = await supabase
    .from('paciente_pacotes')
    .select(`
      id,
      sessoes_totais,
      sessoes_restantes,
      data_validade,
      status_pagamento,
      pacotes ( nome )
    `)
    .eq('paciente_id', pacienteId)
    .gt('sessoes_restantes', 0)
    .in('status_pagamento', ['pago', 'pendente'])
    .or(`data_validade.is.null,data_validade.gte.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

// Salvar novo prontuário (evolução ou anamnese)
export async function salvarProntuario(dados: {
  atendimento_id: string;
  paciente_id: string;
  profissional_id: string;
  tipo: 'avaliacao' | 'evolucao';
  queixa_principal?: string;
  escala_dor?: number;
  conduta?: string;
  evolucao_livre?: string;
  diagnostico?: string;
  idade?: number;
  sexo?: string;
  medico_indicou?: string;
  observacoes?: string;
  alta_medica?: boolean;
}) {
  const { data, error } = await supabase
    .from('prontuarios')
    .insert({
      atendimento_id: dados.atendimento_id,
      paciente_id: dados.paciente_id,
      profissional_id: dados.profissional_id,
      tipo: dados.tipo,
      queixa_principal: dados.queixa_principal || null,
      escala_dor: dados.escala_dor || null,
      conduta: dados.conduta || null,
      evolucao_livre: dados.evolucao_livre || null,
      diagnostico: dados.diagnostico || null,
      idade: dados.idade || null,
      sexo: dados.sexo || null,
      medico_indicou: dados.medico_indicou || null,
      avaliacao_funcional: dados.observacoes || null, // reuso do campo existente
      alta_medica: dados.alta_medica || false,
      created_by: dados.profissional_id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Criar tarefa para secretária
export async function criarTarefaSecretaria({
  paciente_id,
  tipo,
  profissional_id,
  observacoes = '',
}: {
  paciente_id: string;
  tipo: 'renovacao' | 'alta';
  profissional_id: string;
  observacoes?: string;
}) {
  const { data, error } = await supabase
    .from('tarefas_secretaria')
    .insert({
      paciente_id,
      tipo,
      profissional_id,
      observacoes,
      status: 'pendente',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
