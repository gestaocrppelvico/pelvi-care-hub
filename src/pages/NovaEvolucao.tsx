import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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

export default function NovaEvolucao() {
  const { id: pacienteId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const atendimentoId = searchParams.get("atendimento");
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [pacoteInfo, setPacoteInfo] = useState<any>(null);
  const [dataSessao, setDataSessao] = useState<string | null>(null);

  const [conduta, setConduta] = useState("");
  const [evolucaoLivre, setEvolucaoLivre] = useState("");
  const [escalaDor, setEscalaDor] = useState<number | null>(null);
  const [altaMedica, setAltaMedica] = useState(false);
  const [exerciciosPrescritos, setExerciciosPrescritos] = useState("");
  const [proximosPassos, setProximosPassos] = useState("");

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

  useEffect(() => {
    if (!pacienteId || !atendimentoId) return;

    const fetchDados = async () => {
      const { data, error } = await supabase
        .from("atendimentos")
        .select(`
          data_inicio,
          paciente_pacote_id,
          paciente_pacotes (
            sessoes_restantes,
            sessoes_totais,
            pacote:pacotes(nome),
            servico:servicos(nome)
          )
        `)
        .eq("id", atendimentoId)
        .maybeSingle();

      if (error) {
        console.error("Erro ao buscar atendimento:", error);
        return;
      }
      if (data) {
        setDataSessao(data.data_inicio);
        if (data.paciente_pacotes) {
          setPacoteInfo(data.paciente_pacotes);
        }
      }
    };

    fetchDados();
  }, [pacienteId, atendimentoId]);

  const handleSalvar = async () => {
    if (!pacienteId) {
      toast.error("Paciente não identificado.");
      return;
    }
    if (!profissionalId) {
      toast.error("Profissional não identificado. Faça login novamente.");
      return;
    }
    if (!conduta.trim()) {
      toast.error("A conduta é obrigatória.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        paciente_id: pacienteId,
        profissional_id: profissionalId,
        atendimento_id: atendimentoId || null,
        tipo: "evolucao",
        conduta: conduta.trim(),
        evolucao_livre: evolucaoLivre.trim() || null,
        escala_dor: escalaDor,
        alta_medica: altaMedica,
        exercicios_prescritos: exerciciosPrescritos.trim() || null,
        proximos_passos: proximosPassos.trim() || null,
        data_sessao: dataSessao,
      };

      const { error } = await supabase.from("prontuarios").insert(payload);
      if (error) throw error;

      toast.success("Evolução salva com sucesso!");
      navigate(`/pacientes/${pacienteId}`);
    } catch (err: any) {
      toast.error("Erro ao salvar evolução: " + err.message);
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

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold">Nova Evolução</h1>
      </div>

      {dataSessao && (
        <Card className="p-3 border-l-4 border-l-amber-500 bg-amber-50/30">
          <div className="text-sm">
            <span className="font-semibold">Sessão de </span>
            {format(parseISO(dataSessao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </div>
        </Card>
      )}

      {pacoteInfo && (
        <Card className="p-4 border-l-4 border-l-blue-500 bg-blue-50/30">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-slate-700">
                {pacoteInfo.pacote?.nome || pacoteInfo.servico?.nome || "Pacote"}
              </span>
              <div className="text-xs text-muted-foreground mt-1">
                Sessões restantes:{" "}
                <Badge variant="default" className="bg-blue-600">
                  {pacoteInfo.sessoes_restantes} de {pacoteInfo.sessoes_totais}
                </Badge>
              </div>
            </div>
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
            {loading ? "Salvando..." : <><Save className="w-4 h-4 mr-2" /> Salvar Sessão</>}
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
