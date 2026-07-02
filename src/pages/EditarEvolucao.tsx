import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Save, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export default function EditarEvolucao() {
  const { id: pacienteId, prontuarioId } = useParams<{ id: string; prontuarioId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [dataSessao, setDataSessao] = useState<string | null>(null);

  // Campos do formulário
  const [conduta, setConduta] = useState("");
  const [evolucaoLivre, setEvolucaoLivre] = useState("");
  const [escalaDor, setEscalaDor] = useState<number | null>(null);
  const [altaMedica, setAltaMedica] = useState(false);
  const [exerciciosPrescritos, setExerciciosPrescritos] = useState("");
  const [proximosPassos, setProximosPassos] = useState("");

  // Buscar profissional logado
  useEffect(() => {
    if (!user) return;
    const fetchProfissional = async () => {
      const { data, error } = await supabase
        .from("profissionais")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        console.error("Erro ao buscar profissional:", error);
        toast.error("Você não está vinculado a um profissional. Contate o admin.");
        return;
      }
      if (data) setProfissionalId(data.id);
    };
    fetchProfissional();
  }, [user]);

  // Carregar dados da evolução
  useEffect(() => {
    if (!prontuarioId) return;
    const fetchEvolucao = async () => {
      const { data, error } = await supabase
        .from("prontuarios")
        .select("*, atendimento:atendimentos(data_inicio)")
        .eq("id", prontuarioId)
        .maybeSingle();
      if (error) {
        toast.error("Erro ao carregar evolução: " + error.message);
        return;
      }
      if (data) {
        setConduta(data.conduta || "");
        setEvolucaoLivre(data.evolucao_livre || "");
        setEscalaDor(data.escala_dor || null);
        setAltaMedica(data.alta_medica || false);
        setExerciciosPrescritos(data.exercicios_prescritos || "");
        setProximosPassos(data.proximos_passos || "");
        // Usar data_sessao se existir, senão a data do atendimento ou created_at
        const dataSessaoValue = data.data_sessao || data.atendimento?.data_inicio || data.created_at;
        setDataSessao(dataSessaoValue);
      }
      setCarregandoDados(false);
    };
    fetchEvolucao();
  }, [prontuarioId]);

  const handleSalvar = async () => {
    if (!pacienteId || !prontuarioId) {
      toast.error("Dados incompletos.");
      return;
    }
    if (!profissionalId) {
      toast.error("Profissional não identificado.");
      return;
    }
    if (!conduta.trim()) {
      toast.error("A conduta é obrigatória.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        conduta: conduta.trim(),
        evolucao_livre: evolucaoLivre.trim() || null,
        escala_dor: escalaDor,
        alta_medica: altaMedica,
        exercicios_prescritos: exerciciosPrescritos.trim() || null,
        proximos_passos: proximosPassos.trim() || null,
      };

      const { error } = await supabase
        .from("prontuarios")
        .update(payload)
        .eq("id", prontuarioId);

      if (error) throw error;

      toast.success("Evolução atualizada com sucesso!");
      navigate(`/pacientes/${pacienteId}`);
    } catch (err: any) {
      toast.error("Erro ao atualizar: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelar = () => {
    if (confirm("Deseja cancelar? As alterações não serão salvas.")) {
      navigate(-1);
    }
  };

  if (carregandoDados) {
    return <div className="p-8 text-center text-muted-foreground">Carregando evolução...</div>;
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold">Editar Evolução</h1>
      </div>

      {dataSessao && (
        <Card className="p-3 border-l-4 border-l-amber-500 bg-amber-50/30">
          <div className="text-sm">
            <span className="font-semibold">Sessão de </span>
            {format(parseISO(dataSessao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="conduta">Condutas fisioterapêuticas *</Label>
          <Textarea
            id="conduta"
            placeholder="Descreva as condutas realizadas..."
            value={conduta}
            onChange={(e) => setConduta(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="evolucao_livre">Evolução / Observações complementares</Label>
          <Textarea
            id="evolucao_livre"
            placeholder="Evolução do paciente, observações adicionais..."
            value={evolucaoLivre}
            onChange={(e) => setEvolucaoLivre(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="exercicios">Exercícios prescritos</Label>
            <Textarea
              id="exercicios"
              placeholder="Exercícios recomendados..."
              value={exerciciosPrescritos}
              onChange={(e) => setExerciciosPrescritos(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proximos_passos">Próximos passos</Label>
            <Textarea
              id="proximos_passos"
              placeholder="Plano para próxima sessão..."
              value={proximosPassos}
              onChange={(e) => setProximosPassos(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="escala_dor">Escala de dor (0-10)</Label>
            <Input
              id="escala_dor"
              type="number"
              min={0}
              max={10}
              value={escalaDor ?? ""}
              onChange={(e) => setEscalaDor(Number(e.target.value) || null)}
              placeholder="0-10"
            />
          </div>
          <div className="flex items-end space-x-2 pb-1">
            <Button
              variant={altaMedica ? "destructive" : "outline"}
              onClick={() => setAltaMedica(!altaMedica)}
              className="w-full"
            >
              {altaMedica ? "✅ Dar Alta" : "Dar Alta Médica"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            onClick={handleSalvar}
            disabled={loading || !conduta.trim() || !profissionalId}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            {loading ? "Salvando..." : <><Save className="w-4 h-4 mr-2" /> Atualizar Evolução</>}
          </Button>
          <Button variant="outline" onClick={handleCancelar} className="flex-1">
            <X className="w-4 h-4 mr-2" /> Cancelar
          </Button>
        </div>

        {!profissionalId && (
          <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Você não está vinculado a um profissional. Contate o administrador.
          </div>
        )}
      </Card>
    </div>
  );
}
