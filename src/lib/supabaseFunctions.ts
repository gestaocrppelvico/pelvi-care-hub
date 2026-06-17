import { supabase } from "@/integrations/supabase/client";

export async function buscarAtendimentosComEvolucao(pacienteId: string) {
  const { data, error } = await supabase
    .from('atendimentos')
    .select(`
      id,
      data_inicio,
      status,
      profissional:profissionais(nome),
      prontuarios ( id )
    `)
    .eq('paciente_id', pacienteId)
    .order('data_inicio', { ascending: false });

  if (error) {
    console.error('Erro ao buscar atendimentos:', error);
    return [];
  }
  return data || [];
}

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

export async function salvarProntuario(dados: any) {
  const { data, error } = await supabase
    .from('prontuarios')
    .insert(dados)
    .select()
    .single();
  if (error) throw error;
  return data;
}

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
