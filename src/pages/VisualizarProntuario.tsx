import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft } from 'lucide-react';

export default function VisualizarProntuario() {
  const { id: pacienteId, prontuarioId } = useParams();
  const navigate = useNavigate();
  const [prontuario, setProntuario] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!prontuarioId) return;
    carregarProntuario();
  }, [prontuarioId]);

  async function carregarProntuario() {
    const { data, error } = await supabase
      .from('prontuarios')
      .select('*')
      .eq('id', prontuarioId)
      .single();

    if (error) {
      console.error(error);
    } else {
      setProntuario(data);
    }
    setLoading(false);
  }

  if (loading) return <div>Carregando...</div>;
  if (!prontuario) return <div>Prontuário não encontrado.</div>;

  return (
    <div className="container max-w-3xl py-8">
      <Button variant="ghost" onClick={() => navigate(`/paciente/${pacienteId}`)}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Voltar à ficha
      </Button>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>
            {prontuario.tipo === 'avaliacao' ? 'Anamnese' : 'Evolução'}
            {prontuario.alta_medica && ' 🏁 Alta'}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {format(new Date(prontuario.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {prontuario.tipo === 'avaliacao' && (
            <>
              <div><strong>Queixa principal:</strong> {prontuario.queixa_principal}</div>
              <div><strong>Diagnóstico:</strong> {prontuario.diagnostico || '—'}</div>
              <div><strong>Escala de dor:</strong> {prontuario.escala_dor ?? '—'}</div>
              <div><strong>Idade:</strong> {prontuario.idade ?? '—'}</div>
              <div><strong>Sexo:</strong> {prontuario.sexo || '—'}</div>
              <div><strong>Médico indicou:</strong> {prontuario.medico_indicou || '—'}</div>
              <div><strong>Observações:</strong> {prontuario.avaliacao_funcional || '—'}</div>
            </>
          )}
          {prontuario.tipo === 'evolucao' && (
            <>
              <div><strong>Condutas:</strong> {prontuario.conduta}</div>
              <div><strong>Observações:</strong> {prontuario.evolucao_livre || '—'}</div>
              {prontuario.alta_medica && (
                <div className="text-red-600 font-bold">Alta médica registrada</div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
