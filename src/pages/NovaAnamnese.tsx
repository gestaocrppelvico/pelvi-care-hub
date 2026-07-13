import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function NovaAnamnese() {
  const { id: pacienteId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [profissionalId, setProfissionalId] = useState<string | null>(null);

  // Campos do formulário (com nomes reais da tabela)
  const [queixaPrincipal, setQueixaPrincipal] = useState("");
  const [diagnostico, setDiagnostico] = useState("");
  const [escalaDor, setEscalaDor] = useState<number | null>(null);
  const [idade, setIdade] = useState<number | null>(null);
  const [sexo, setSexo] = useState<string>("");
  const [medicoIndicou, setMedicoIndicou] = useState("");
  const [evolucaoLivre, setEvolucaoLivre] = useState(""); // antes "observacoes"

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

  const handleSalvar = async () => {
    if (!pacienteId) {
      toast.error("Paciente não identificado.");
      return;
    }
    if (!profissionalId) {
      toast.error("Profissional não identificado. Faça login novamente.");
      return;
    }
    if (!queixaPrincipal.trim()) {
      toast.error("A queixa principal é obrigatória.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        paciente_id: pacienteId,
        profissional_id: profissionalId,
        tipo: "avaliacao",
        queixa_principal: queixaPrincipal.trim(),
        diagnostico: diagnostico.trim() || null,
        escala_dor: escalaDor,
        idade: idade,
        sexo: sexo || null,
        medico_indicou: medicoIndicou.trim() || null,
        evolucao_livre: evolucaoLivre.trim() || null, // observações complementares
      };

      const { error } = await supabase.from("prontuarios").insert(payload);
      if (error) throw error;

      toast.success("Anamnese salva com sucesso!");
      navigate(`/pacientes/${pacienteId}`);
    } catch (err: any) {
      toast.error("Erro ao salvar anamnese: " + err.message);
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
        <h1 className="text-2xl font-bold">Nova Anamnese</h1>
      </div>

      <Card className="p-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="queixa">Queixa principal *</Label>
          <Textarea
            id="queixa"
            placeholder="Descreva a queixa do paciente..."
            value={queixaPrincipal}
            onChange={(e) => setQueixaPrincipal(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="diagnostico">Diagnóstico</Label>
          <Input
            id="diagnostico"
            placeholder="Diagnóstico clínico..."
            value={diagnostico}
            onChange={(e) => setDiagnostico(e.target.value)}
          />
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
          <div className="space-y-2">
            <Label htmlFor="idade">Idade</Label>
            <Input
              id="idade"
              type="number"
              min={0}
              value={idade ?? ""}
              onChange={(e) => setIdade(Number(e.target.value) || null)}
              placeholder="Idade"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="sexo">Sexo</Label>
            <Select value={sexo} onValueChange={setSexo}>
              <SelectTrigger id="sexo">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Masculino">Masculino</SelectItem>
                <SelectItem value="Feminino">Feminino</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
           <div className="space-y-2">
  <Label htmlFor="medico">Médico responsável</Label>
  <Input
    id="medico"
    placeholder="Nome do médico responsável"
    value={medicoIndicou}
    onChange={(e) => setMedicoIndicou(e.target.value)}
  />
</div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="observacoes">Observações complementares</Label>
          <Textarea
            id="observacoes"
            placeholder="Observações adicionais..."
            value={evolucaoLivre}
            onChange={(e) => setEvolucaoLivre(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            onClick={handleSalvar}
            disabled={loading || !queixaPrincipal.trim() || !profissionalId}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            {loading ? "Salvando..." : <><Save className="w-4 h-4 mr-2" /> Salvar Anamnese</>}
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
