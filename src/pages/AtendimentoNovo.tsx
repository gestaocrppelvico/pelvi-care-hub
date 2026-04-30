import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { syncAtendimentoToGCal } from "@/lib/gcal";

const schema = z.object({
  paciente_id: z.string().uuid("Selecione um paciente"),
  profissional_id: z.string().uuid("Selecione um profissional"),
  data_inicio: z.string().min(1, "Informe a data/hora"),
  duracao: z.coerce.number().min(15).max(240).default(40),
  tipo: z.enum(["Plano", "Particular"]),
});

interface PacientePacote {
  id: string;
  sessoes_restantes: number;
  pacote: { nome: string; numero_sessoes: number } | null;
}
interface PacienteServico {
  id: string;
  utilizado: boolean;
  servico: { nome: string } | null;
}

export default function AtendimentoNovo() {
  const navigate = useNavigate();
  const [pacientes, setPacientes] = useState<{ id: string; nome: string }[]>([]);
  const [profs, setProfs] = useState<{ id: string; nome: string }[]>([]);
  const [servicos, setServicos] = useState<{ id: string; nome: string }[]>([]);
  const [pacientePacotes, setPacientePacotes] = useState<PacientePacote[]>([]);
  const [pacienteServicos, setPacienteServicos] = useState<PacienteServico[]>([]);
  const [paciente, setPaciente] = useState("");
  const [prof, setProf] = useState("");
  const [tipo, setTipo] = useState<"Plano" | "Particular">("Plano");
  const [vinculo, setVinculo] = useState<string>("none"); // "none" | "pp:<id>" | "ps:<id>"
  const [servicoId, setServicoId] = useState<string>("none");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("pacientes").select("id, nome").eq("ativo", true).order("nome").then(({ data }) => setPacientes(data ?? []));
    supabase.from("profissionais").select("id, nome").eq("ativo", true).order("nome").then(({ data }) => setProfs(data ?? []));
    supabase.from("servicos").select("id, nome").eq("ativo", true).order("nome").then(({ data }) => setServicos(data ?? []));
  }, []);

  // Carrega ficha do paciente
  useEffect(() => {
    setVinculo("none");
    if (!paciente) {
      setPacientePacotes([]);
      setPacienteServicos([]);
      return;
    }
    (async () => {
      const [pp, ps] = await Promise.all([
        supabase.from("paciente_pacotes").select("id, sessoes_restantes, pacote:pacotes(nome, numero_sessoes)").eq("paciente_id", paciente).gt("sessoes_restantes", 0),
        supabase.from("paciente_servicos").select("id, utilizado, servico:servicos(nome)").eq("paciente_id", paciente).eq("utilizado", false),
      ]);
      setPacientePacotes((pp.data as any) ?? []);
      setPacienteServicos((ps.data as any) ?? []);
    })();
  }, [paciente]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const obj = { ...Object.fromEntries(fd), paciente_id: paciente, profissional_id: prof, tipo };
    const parsed = schema.safeParse(obj);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    const inicio = new Date(parsed.data.data_inicio);
    const fim = new Date(inicio.getTime() + parsed.data.duracao * 60_000);

    const payload: any = {
      paciente_id: parsed.data.paciente_id,
      profissional_id: parsed.data.profissional_id,
      data_inicio: inicio.toISOString(),
      data_fim: fim.toISOString(),
      tipo: parsed.data.tipo,
      status: "agendado",
    };
    if (servicoId !== "none") payload.servico_id = servicoId;
    if (vinculo.startsWith("pp:")) payload.paciente_pacote_id = vinculo.slice(3);
    if (vinculo.startsWith("ps:")) payload.paciente_servico_id = vinculo.slice(3);

    const { data: created, error } = await supabase.from("atendimentos").insert(payload).select("id").single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (created?.id) {
      syncAtendimentoToGCal(created.id, "create");
    }
    toast.success("Atendimento agendado e sincronizado com o Google!");
    navigate("/agenda");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-2xl font-bold">Novo atendimento</h1>
      </div>

      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Paciente *</Label>
            <Select value={paciente} onValueChange={setPaciente}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Escolha o paciente" /></SelectTrigger>
              <SelectContent>
                {pacientes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Profissional *</Label>
            <Select value={prof} onValueChange={setProf}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Escolha o profissional" /></SelectTrigger>
              <SelectContent>
                {profs.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="data_inicio">Data e hora *</Label>
            <Input id="data_inicio" name="data_inicio" type="datetime-local" required className="h-12" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duracao">Duração (min)</Label>
            <Input id="duracao" name="duracao" type="number" defaultValue={40} min={15} max={240} step={5} className="h-12" />
            <p className="text-xs text-muted-foreground">Padrão da clínica: 40 minutos por sessão.</p>
          </div>

          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
              <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Plano">Plano</SelectItem>
                <SelectItem value="Particular">Particular</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Serviço (opcional)</Label>
            <Select value={servicoId} onValueChange={setServicoId}>
              <SelectTrigger className="h-12"><SelectValue placeholder="— nenhum —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— nenhum —</SelectItem>
                {servicos.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {paciente && (pacientePacotes.length > 0 || pacienteServicos.length > 0) && (
            <div className="space-y-2">
              <Label>Consumir da ficha financeira</Label>
              <Select value={vinculo} onValueChange={setVinculo}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— não consumir —</SelectItem>
                  {pacientePacotes.map((pp) => (
                    <SelectItem key={pp.id} value={`pp:${pp.id}`}>
                      Pacote: {pp.pacote?.nome} ({pp.sessoes_restantes} restantes)
                    </SelectItem>
                  ))}
                  {pacienteServicos.map((ps) => (
                    <SelectItem key={ps.id} value={`ps:${ps.id}`}>
                      Serviço avulso: {ps.servico?.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">A sessão será descontada quando o atendimento for marcado como realizado.</p>
            </div>
          )}

          <Button type="submit" className="w-full h-12" disabled={busy}>
            {busy ? "Salvando..." : "Agendar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
