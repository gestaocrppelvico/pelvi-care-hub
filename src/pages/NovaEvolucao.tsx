import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { 
  buscarPacoteAtivo, 
  salvarProntuario, 
  criarTarefaSecretaria 
} from '@/lib/supabaseFunctions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const schema = z.object({
  conduta: z.string().min(1, 'Conduta é obrigatória'),
  observacoes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NovaEvolucao() {
  const { id: pacienteId } = useParams();
  const [searchParams] = useSearchParams();
  const atendimentoId = searchParams.get('atendimento');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [pacote, setPacote] = useState<any>(null);
  const [showContinuarDialog, setShowContinuarDialog] = useState(false);
  const [showAltaDialog, setShowAltaDialog] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!pacienteId) return;
    carregarPacote();
  }, [pacienteId]);

  async function carregarPacote() {
    const pacoteAtivo = await buscarPacoteAtivo(pacienteId!);
    setPacote(pacoteAtivo);
  }

  async function onSubmit(data: FormData, alta: boolean = false) {
    if (!pacienteId || !user || !atendimentoId) {
      toast.error('Dados insuficientes. Selecione um atendimento para evoluir.');
      return;
    }

    setLoading(true);
    try {
      const prontuario = await salvarProntuario({
        atendimento_id: atendimentoId,
        paciente_id: pacienteId,
        profissional_id: user.id,
        tipo: 'evolucao',
        conduta: data.conduta,
        evolucao_livre: data.observacoes,
        alta_medica: alta,
      });

      if (pacote && pacote.sessoes_restantes <= 2 && pacote.sessoes_restantes > 0) {
        setShowContinuarDialog(true);
        return;
      }

      if (pacote && pacote.sessoes_restantes === 0) {
        setShowContinuarDialog(true);
        return;
      }

      toast.success('Evolução salva com sucesso!');
      navigate(`/paciente/${pacienteId}`);
    } catch (error: any) {
      toast.error('Erro ao salvar evolução: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDecisao(decidir: 'continuar' | 'alta') {
    setShowContinuarDialog(false);
    if (decidir === 'continuar') {
      await criarTarefaSecretaria({
        paciente_id: pacienteId!,
        tipo: 'renovacao',
        profissional_id: user!.id,
        observacoes: `Paciente com ${pacote?.sessoes_restantes} sessões restantes. Solicitar renovação.`,
      });
      toast.success('Tarefa criada para Iris. Ela entrará em contato para renovação.');
    } else if (decidir === 'alta') {
      setShowAltaDialog(true);
    }
    navigate(`/paciente/${pacienteId}`);
  }

  async function confirmarAlta() {
    setShowAltaDialog(false);
    await criarTarefaSecretaria({
      paciente_id: pacienteId!,
      tipo: 'alta',
      profissional_id: user!.id,
      observacoes: 'Alta médica registrada. Cuidar da paciente para melhor experiência.',
    });
    toast.success('Alta registrada. Iris será notificada.');
    navigate(`/paciente/${pacienteId}`);
  }

  if (!atendimentoId) {
    return (
      <div className="container py-8">
        <p className="text-red-500">Nenhum atendimento selecionado. Volte ao histórico e escolha um atendimento para evoluir.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8">
      <h1 className="text-2xl font-bold mb-2">Nova Evolução</h1>
      {pacote && (
        <div className="bg-muted p-3 rounded mb-4 text-sm">
          <p><strong>Pacote ativo:</strong> {pacote.pacotes?.nome || 'Genérico'}</p>
          <p><strong>Sessões restantes:</strong> {pacote.sessoes_restantes} de {pacote.sessoes_totais}</p>
          {pacote.sessoes_restantes <= 2 && pacote.sessoes_restantes > 0 && (
            <p className="text-amber-600 font-semibold">⚠️ Atenção: faltam poucas sessões!</p>
          )}
          {pacote.sessoes_restantes === 0 && (
            <p className="text-red-600 font-semibold">⚠️ Pacote esgotado! Renove ou dê alta.</p>
          )}
        </div>
      )}
      <form onSubmit={handleSubmit((data) => onSubmit(data, false))} className="space-y-4">
        <div>
          <Label htmlFor="conduta">Condutas fisioterapêuticas *</Label>
          <Textarea id="conduta" rows={4} {...register('conduta')} placeholder="Descreva o que foi feito na sessão..." />
          {errors.conduta && <p className="text-red-500 text-sm">{errors.conduta.message}</p>}
        </div>
        <div>
          <Label htmlFor="observacoes">Observações complementares</Label>
          <Textarea id="observacoes" rows={3} {...register('observacoes')} placeholder="Queixas, relatos da paciente..." />
        </div>
        <div className="flex flex-wrap gap-3 pt-4">
          <Button type="submit" disabled={loading}>
            {loading ? 'Salvando...' : '💾 Salvar Sessão'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              handleSubmit((data) => {
                onSubmit(data, true);
              })();
            }}
          >
            🏁 Dar Alta Médica
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(`/paciente/${pacienteId}`)}>
            Cancelar
          </Button>
        </div>
      </form>

      <AlertDialog open={showContinuarDialog} onOpenChange={setShowContinuarDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Paciente está próximo do fim do pacote</AlertDialogTitle>
            <AlertDialogDescription>
              Restam apenas {pacote?.sessoes_restantes} sessões. Deseja que a Iris entre em contato para renovação ou prefere dar alta médica?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowContinuarDialog(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDecisao('continuar')}>
              Continuar tratamento
            </AlertDialogAction>
            <AlertDialogAction variant="destructive" onClick={() => handleDecisao('alta')}>
              Dar Alta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showAltaDialog} onOpenChange={setShowAltaDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Alta Médica</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja dar alta a este paciente? Esta ação irá encerrar o tratamento e notificar a Iris.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmarAlta}>
              Sim, dar alta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
