import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Save, ClipboardList, Flag } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Schema simplificado focado em agilidade
const schema = z.object({
  conduta: z.string().trim().max(4000).optional().nullable(),
  evolucao_livre: z.string().trim().max(8000).optional().nullable(),
});

interface Atendimento {
  id: string;
  data_inicio: string;
  paciente_id: string;
  profissional_id: string;
  paciente: { nome: string } | null;
  profissional: { nome: string } | null;
}

export default function Prontuario() {
  const { atendimentoId } = useParams<{ atendimentoId: string }>();
  const navigate = useNavigate();
  const [atend, setAtend] = useState<Atendimento | null>(null);
  
  const [form, setForm] = useState({
    conduta: "",
    evolucao_livre: "",
  });
  
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!atendimentoId) return;
    (async () => {
      // 1. Busca os dados do atendimento e paciente
      const { data: a } = await supabase
        .from("atendimentos")
        .select("id, data_inicio, paciente_id, profissional_id, paciente:pacientes(nome), profissional:profissionais(nome)")
        .eq("id", atendimentoId)
        .maybeSingle();
      setAtend(a as any);

      // 2. Verifica se já existe um prontuário/evolução salva para esta sessão
      const { data: p } = await supabase
        .from("prontuarios")
        .select("*")
        .eq("atendimento_id", atendimentoId)
        .maybeSingle();
      
      if (p) {
        setExistingId(p.id);
        setForm({
          conduta: p.conduta ?? "",
          evolucao_livre: p.evolucao_livre ?? "",
        });
      }
      setLoading(false);
    })();
  }, [atendimentoId]);

  // Função centralizada que salva tanto Evolução normal quanto Alta Médica
  async function salvarEvolucao(isAltaMedica: boolean) {
    if (!atend) return;

    const payload = {
      conduta: form.conduta || null,
      evolucao_livre: form.evolucao_livre || null,
    };

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    let error;

    // Adiciona o marcador de alta médica (Requer a coluna 'alta_medica' no Supabase)
    const payloadFinal = {
      ...parsed.data,
      alta_medica: isAltaMedica,
    };

    if (existingId) {
      ({ error } = await supabase.from("prontuarios").update(payloadFinal).eq("id", existingId));
    } else {
      ({ error } = await supabase.from("prontuarios").insert({
        ...payloadFinal,
        atendimento_id: atend.id,
        paciente_id: atend.paciente_id,
        profissional_id: atend.profissional_id,
        created_by: user?.id,
      }));
      // Marca o atendimento como realizado no momento que a evolução nasce
      await supabase.from("atendimentos").update({ status: "realizado" }).eq("id", atend.id);
    }

    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(isAltaMedica ? "Alta Médica registrada com sucesso! 🎉" : "Sessão salva com sucesso!");
    navigate(`/pacientes/${atend.paciente_id}`);
  }

  // Ação do Botão de Salvar Normal
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await salvarEvolucao(false);
  }

  // Ação do Botão de Alta Médica (Com confirmação)
  async function handleAltaMedica() {
    const confirmacao = window.confirm(
      `Deseja confirmar a ALTA MÉDICA para ${atend?.paciente?.nome}?\n\nIsso registrará o fim do ciclo de tratamento desta paciente.`
    );
    if (!confirmacao) return;
    
    await salvarEvolucao(true);
  }

  if (loading) return <p className="text-muted-foreground text-center py-8">Carregando dados da sessão...</p>;
  if (!atend) return <p className="text-muted-foreground text-center py-8">Atendimento não encontrado.</p>;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* CABEÇALHO */}
      <div className="flex items-center justify-between bg-white p-3 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Evolução Clínica</h1>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              {atend.paciente?.nome} • {format(new Date(atend.data_inicio), "dd/MM/yyyy 'às' HH:mm")}
            </p>
          </div>
        </div>
        
        {/* BOTÃO PARA ANAMNESE/AVALIAÇÃO */}
        <Button variant="outline" asChild className="border-blue-200 text-blue-700 hover:bg-blue-50">
          <Link to={`/pacientes/${atend.paciente_id}/anamnese`}>
            <ClipboardList className="w-4 h-4 mr-2" /> Ver Avaliação
          </Link>
        </Button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        
        {/* CAMPOS DE TEXTO LIMPISSÍMOS */}
        <Card className="p-5 space-y-5 shadow-sm border-t-4 border-t-blue-500">
          <div className="space-y-2">
            <Label htmlFor="cond" className="text-sm font-bold text-slate-700">Condutas fisioterapêuticas</Label>
            <Textarea 
              id="cond" 
              rows={5} 
              className="resize-y text-base bg-slate-50/50 focus:bg-white"
              placeholder="Técnicas aplicadas, eletroestimulação, biofeedback, terapia manual..."
              value={form.conduta}
              onChange={(e) => setForm({ ...form, conduta: e.target.value })} 
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="livre" className="text-sm font-bold text-slate-700">Observações complementares</Label>
            <Textarea 
              id="livre" 
              rows={5} 
              className="resize-y text-base bg-slate-50/50 focus:bg-white"
              placeholder="Observações complementares, intercorrências, evolução do quadro, reação da paciente..."
              value={form.evolucao_livre}
              onChange={(e) => setForm({ ...form, evolucao_livre: e.target.value })} 
            />
          </div>
        </Card>

        {/* BOTÕES DE AÇÃO */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          
          <Button 
            type="button" 
            variant="outline" 
            className="flex-1 h-14 border-emerald-500 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 font-bold text-base" 
            onClick={handleAltaMedica} 
            disabled={busy}
          >
            <Flag className="w-5 h-5 mr-2" />
            Dar Alta Médica
          </Button>

          <Button 
            type="submit" 
            className="flex-1 h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base shadow-sm" 
            disabled={busy}
          >
            <Save className="w-5 h-5 mr-2" />
            {busy ? "A salvar..." : existingId ? "Atualizar Sessão" : "Salvar Sessão"}
          </Button>
          
        </div>
      </form>
    </div>
  );
}
