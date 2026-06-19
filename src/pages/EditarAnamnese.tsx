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

export default function EditarAnamnese() {
  const { id: pacienteId, prontuarioId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [profissionalId, setProfissionalId] = useState<string | null>(null);

  const [form, setForm] = useState({
    queixa_principal: "",
    diagnostico: "",
    escala_dor: null as number | null,
    idade: null as number | null,
    sexo: "",
    medico_indicou: "",
    evolucao_livre: "",
  });

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
        toast.error("Você não está vinculado a um profissional.");
        return;
      }
      if (data) setProfissionalId(data.id);
    };
    fetchProfissional();
  }, [user]);

  // Carregar dados da anamnese
  useEffect(() => {
    if (!prontuarioId) return;
    const fetchAnamnese = async () => {
      const { data, error } = await supabase
        .from("prontuarios")
        .select("*")
        .eq("id", prontuarioId)
        .maybeSingle();
      if (error) {
        toast.error("Erro ao carregar anamnese: " + error.message);
        return;
      }
      if (data) {
        setForm({
          queixa_principal: data.queixa_principal || "",
          diagnostico: data.diagnostico || "",
          escala_dor: data.escala_dor || null,
          idade: data.idade || null,
          sexo: data.sexo || "",
          medico_indicou: data.medico_indicou || "",
          evolucao_livre: data.evolucao_livre || "",
        });
      }
      setCarregandoDados(false);
    };
    fetchAnamnese();
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
    if (!form.queixa_principal.trim()) {
      toast.error("A queixa principal é obrigatória.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        queixa_principal: form.queixa_principal.trim(),
        diagnostico: form.diagnostico.trim() || null,
        escala_dor: form.escala_dor,
        idade: form.idade,
        sexo: form.sexo || null,
        medico_indicou: form.medico_indicou.trim() || null,
        evolucao_livre: form.evolucao_livre.trim() || null,
      };

      const { error } = await supabase
        .from("prontuarios")
        .update(payload)
        .eq("id", prontuarioId);

      if (error) throw error;

      toast.success("Anamnese atualizada com sucesso!");
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
    return <div className="p-8 text-center text-muted-foreground">Carregando anamnese...</div>;
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold">Editar Anamnese</h1>
      </div>

      <Card className="p-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="queixa">Queixa principal *</Label>
          <Textarea
            id="queixa"
            placeholder="Descreva a queixa do paciente..."
            value={form.queixa_principal}
            onChange={(e) => setForm({ ...form, queixa_principal: e.target.value })}
            rows={3}
            className="resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="diagnostico">Diagnóstico</Label>
          <Input
            id="diagnostico"
            placeholder="Diagnóstico clínico..."
            value={form.diagnostico}
            onChange={(e) => setForm({ ...form, diagnostico: e.target.value })}
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
              value={form.escala_dor ?? ""}
              onChange={(e) => setForm({ ...form, escala_dor: Number(e.target.value) || null })}
              placeholder="0-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="idade">Idade</Label>
            <Input
              id="idade"
              type="number"
              min={0}
              value={form.idade ?? ""}
              onChange={(e) => setForm({ ...form, idade: Number(e.target.value) || null })}
              placeholder="Idade"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="sexo">Sexo</Label>
            <Select value={form.sexo} onValueChange={(v) => setForm({ ...form, sexo: v })}>
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
            <Label htmlFor="medico">Médico que indicou</Label>
            <Input
              id="medico"
              placeholder="Nome do médico"
              value={form.medico_indicou}
              onChange={(e) => setForm({ ...form, medico_indicou: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="observacoes">Observações complementares</Label>
          <Textarea
            id="observacoes"
            placeholder="Observações adicionais..."
            value={form.evolucao_livre}
            onChange={(e) => setForm({ ...form, evolucao_livre: e.target.value })}
            rows={3}
            className="resize-none"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            onClick={handleSalvar}
            disabled={loading || !form.queixa_principal.trim() || !profissionalId}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            {loading ? "Salvando..." : <><Save className="w-4 h-4 mr-2" /> Atualizar Anamnese</>}
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
