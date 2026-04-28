import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  queixa_principal: z.string().trim().max(2000).optional().nullable(),
  escala_dor: z.coerce.number().int().min(0).max(10).optional().nullable(),
  avaliacao_funcional: z.string().trim().max(4000).optional().nullable(),
  conduta: z.string().trim().max(4000).optional().nullable(),
  exercicios_prescritos: z.string().trim().max(4000).optional().nullable(),
  evolucao_livre: z.string().trim().max(8000).optional().nullable(),
  proximos_passos: z.string().trim().max(2000).optional().nullable(),
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
    queixa_principal: "",
    escala_dor: "",
    avaliacao_funcional: "",
    conduta: "",
    exercicios_prescritos: "",
    evolucao_livre: "",
    proximos_passos: "",
  });
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!atendimentoId) return;
    (async () => {
      const { data: a } = await supabase
        .from("atendimentos")
        .select("id, data_inicio, paciente_id, profissional_id, paciente:pacientes(nome), profissional:profissionais(nome)")
        .eq("id", atendimentoId)
        .maybeSingle();
      setAtend(a as any);

      const { data: p } = await supabase
        .from("prontuarios")
        .select("*")
        .eq("atendimento_id", atendimentoId)
        .maybeSingle();
      if (p) {
        setExistingId(p.id);
        setForm({
          queixa_principal: p.queixa_principal ?? "",
          escala_dor: p.escala_dor?.toString() ?? "",
          avaliacao_funcional: p.avaliacao_funcional ?? "",
          conduta: p.conduta ?? "",
          exercicios_prescritos: p.exercicios_prescritos ?? "",
          evolucao_livre: p.evolucao_livre ?? "",
          proximos_passos: p.proximos_passos ?? "",
        });
      }
      setLoading(false);
    })();
  }, [atendimentoId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!atend) return;
    const payload = {
      queixa_principal: form.queixa_principal || null,
      escala_dor: form.escala_dor === "" ? null : Number(form.escala_dor),
      avaliacao_funcional: form.avaliacao_funcional || null,
      conduta: form.conduta || null,
      exercicios_prescritos: form.exercicios_prescritos || null,
      evolucao_livre: form.evolucao_livre || null,
      proximos_passos: form.proximos_passos || null,
    };
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    let error;
    if (existingId) {
      ({ error } = await supabase.from("prontuarios").update(parsed.data).eq("id", existingId));
    } else {
      ({ error } = await supabase.from("prontuarios").insert({
        ...parsed.data,
        atendimento_id: atend.id,
        paciente_id: atend.paciente_id,
        profissional_id: atend.profissional_id,
        created_by: user?.id,
      }));
      // Marca o atendimento como realizado quando a evolução é registrada
      await supabase.from("atendimentos").update({ status: "realizado" }).eq("id", atend.id);
    }
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Evolução salva!");
    navigate(`/pacientes/${atend.paciente_id}`);
  }

  if (loading) return <p className="text-muted-foreground text-center py-8">Carregando...</p>;
  if (!atend) return <p className="text-muted-foreground text-center py-8">Atendimento não encontrado.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-xl font-bold">Evolução clínica</h1>
          <p className="text-xs text-muted-foreground">
            {atend.paciente?.nome} • {format(new Date(atend.data_inicio), "dd 'de' MMM yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Card className="p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="queixa">Queixa principal</Label>
            <Textarea id="queixa" rows={2} value={form.queixa_principal}
              onChange={(e) => setForm({ ...form, queixa_principal: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dor">Escala de dor (0–10)</Label>
            <Input id="dor" type="number" min={0} max={10} className="h-12 w-24"
              value={form.escala_dor}
              onChange={(e) => setForm({ ...form, escala_dor: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aval">Avaliação funcional</Label>
            <Textarea id="aval" rows={3} placeholder="Tônus, força, mobilidade pélvica, PERFECT, etc."
              value={form.avaliacao_funcional}
              onChange={(e) => setForm({ ...form, avaliacao_funcional: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cond">Conduta realizada</Label>
            <Textarea id="cond" rows={3} placeholder="Técnicas aplicadas, eletroestimulação, biofeedback, terapia manual..."
              value={form.conduta}
              onChange={(e) => setForm({ ...form, conduta: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex">Exercícios prescritos</Label>
            <Textarea id="ex" rows={3} placeholder="Para casa: Kegel, hipopressivos, diário miccional..."
              value={form.exercicios_prescritos}
              onChange={(e) => setForm({ ...form, exercicios_prescritos: e.target.value })} />
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="livre">Evolução (texto livre)</Label>
            <Textarea id="livre" rows={5} placeholder="Observações complementares, intercorrências, reação da paciente..."
              value={form.evolucao_livre}
              onChange={(e) => setForm({ ...form, evolucao_livre: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prox">Próximos passos</Label>
            <Textarea id="prox" rows={2} value={form.proximos_passos}
              onChange={(e) => setForm({ ...form, proximos_passos: e.target.value })} />
          </div>
        </Card>

        <Button type="submit" className="w-full h-12" disabled={busy}>
          <Save className="w-4 h-4 mr-2" />
          {busy ? "Salvando..." : existingId ? "Atualizar evolução" : "Salvar evolução"}
        </Button>
      </form>
    </div>
  );
}
