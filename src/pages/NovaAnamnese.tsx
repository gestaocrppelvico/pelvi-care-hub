import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { salvarProntuario } from '@/lib/supabaseFunctions';

const schema = z.object({
  queixa_principal: z.string().min(1, 'Queixa principal é obrigatória'),
  diagnostico: z.string().optional(),
  escala_dor: z.coerce.number().min(0).max(10).optional(),
  idade: z.coerce.number().min(0).optional(),
  sexo: z.string().optional(),
  medico_indicou: z.string().optional(),
  observacoes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NovaAnamnese() {
  const { id: pacienteId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    if (!pacienteId || !user) {
      toast.error('Dados insuficientes');
      return;
    }

    setLoading(true);
    try {
      // Buscar primeiro atendimento (checkin) do paciente
      const { data: primeiroAtendimento, error: atendError } = await supabase
        .from('atendimentos')
        .select('id')
        .eq('paciente_id', pacienteId)
        .eq('status', 'realizado')
        .order('data_inicio', { ascending: true })
        .limit(1);

      if (atendError) throw atendError;
      let atendimentoId;
      if (!primeiroAtendimento || primeiroAtendimento.length === 0) {
        // Criar atendimento automático para avaliação
        const { data: novoAtend, error: createError } = await supabase
          .from('atendimentos')
          .insert({
            paciente_id: pacienteId,
            profissional_id: user.id,
            data_inicio: new Date().toISOString(),
            tipo: 'avaliacao',
            status: 'realizado',
          })
          .select('id')
          .single();

        if (createError) throw createError;
        atendimentoId = novoAtend.id;
      } else {
        atendimentoId = primeiroAtendimento[0].id;
      }

      await salvarProntuario({
        atendimento_id: atendimentoId,
        paciente_id: pacienteId,
        profissional_id: user.id,
        tipo: 'avaliacao',
        queixa_principal: data.queixa_principal,
        escala_dor: data.escala_dor,
        diagnostico: data.diagnostico,
        idade: data.idade,
        sexo: data.sexo,
        medico_indicou: data.medico_indicou,
        observacoes: data.observacoes,
      });

      toast.success('Anamnese salva com sucesso!');
      navigate(`/paciente/${pacienteId}`);
    } catch (error: any) {
      toast.error('Erro ao salvar anamnese: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container max-w-2xl py-8">
      <h1 className="text-2xl font-bold mb-6">Nova Anamnese</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="queixa_principal">Queixa principal *</Label>
          <Textarea id="queixa_principal" {...register('queixa_principal')} />
          {errors.queixa_principal && <p className="text-red-500 text-sm">{errors.queixa_principal.message}</p>}
        </div>
        <div>
          <Label htmlFor="diagnostico">Diagnóstico</Label>
          <Input id="diagnostico" {...register('diagnostico')} />
        </div>
        <div>
          <Label htmlFor="escala_dor">Escala de dor (0-10)</Label>
          <Input id="escala_dor" type="number" {...register('escala_dor')} />
        </div>
        <div>
          <Label htmlFor="idade">Idade</Label>
          <Input id="idade" type="number" {...register('idade')} />
        </div>
        <div>
          <Label htmlFor="sexo">Sexo</Label>
          <Select onValueChange={(val) => setValue('sexo', val)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="feminino">Feminino</SelectItem>
              <SelectItem value="masculino">Masculino</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="medico_indicou">Médico que indicou</Label>
          <Input id="medico_indicou" {...register('medico_indicou')} />
        </div>
        <div>
          <Label htmlFor="observacoes">Observações complementares</Label>
          <Textarea id="observacoes" {...register('observacoes')} />
        </div>
        <div className="flex gap-2 pt-4">
          <Button type="submit" disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar Anamnese'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(`/paciente/${pacienteId}`)}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
