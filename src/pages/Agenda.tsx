import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, Plus, Clock, FileText, X, RefreshCw, Play, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { syncAtendimentoToGCal } from "@/lib/gcal";

interface Atendimento {
  id: string;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  tipo: string;
  paciente: { nome: string } | null;
  profissional: { nome: string; cor_agenda: string } | null;
}

const statusLabel: Record<string, string> = {
  agendado: "Agendado",
  em_andamento: "Em andamento",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

const statusColor: Record<string, string> = {
  agendado: "secondary",
  em_andamento: "default",
  realizado: "default",
  cancelado: "destructive",
};

export default function Agenda() {
  const [day, setDay] = useState<Date>(new Date());
  const [list, setList] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 1)), []);

  function reload() {
    setLoading(true);
    supabase
      .from("atendimentos")
      .select("id, data_inicio, data_fim, status, tipo, paciente:pacientes(nome), profissional:profissionais(nome, cor_agenda)")
      .gte("data_inicio", startOfDay(day).toISOString())
      .lte("data_inicio", endOfDay(day).toISOString())
      .order("data_inicio")
      .then(({ data }) => {
        setList((data as any) ?? []);
        setLoading(false);
      });
  }

  async function mudarStatus(id: string, novoStatus: string) {
    const { error } = await supabase.from("atendimentos").update({ status: novoStatus as any }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status alterado para "${statusLabel[novoStatus]}"`);
    reload();
  }

  async function cancelar(id: string) {
    if (!confirm("Cancelar este atendimento? Será removido também do Google Calendar.")) return;
    const { error } = await supabase.from("atendimentos").update({ status: "cancelado" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await syncAtendimentoToGCal(id, "delete");
    toast.success("Atendimento cancelado e removido do Google.");
    reload();
  }

  async function syncNow() {
    toast.info("Sincronizando com Google Calendar...");
    const { error } = await supabase.functions.invoke("gcal-pull");
    if (error) toast.error("Falha na sincronização: " + error.message);
    else { toast.success("Sincronização concluída"); reload(); }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={syncNow} aria-label="Sincronizar com Google">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button asChild size="sm">
            <Link to="/agenda/novo"><Plus className="w-4 h-4 mr-1" /> Novo</Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
        {days.map((d) => {
          const isSel = format(d, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
          return (
            <button
              key={d.toISOString()}
              onClick={() => setDay(d)}
              className={`flex-shrink-0 w-14 h-16 rounded-xl flex flex-col items-center justify-center transition-all ${
                isSel ? "gradient-primary text-primary-foreground shadow-elegant" : "bg-card text-foreground hover:bg-secondary"
              }`}
            >
              <span className="text-[10px] uppercase">{format(d, "EEE", { locale: ptBR })}</span>
              <span className="text-lg font-bold">{format(d, "d")}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-8">Carregando...</p>
      ) : list.length === 0 ? (
        <Card className="p-8 text-center">
          <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhum atendimento neste dia.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((a) => (
            <Card key={a.id} className="p-4 shadow-card space-y-2">
              <div className="flex items-center gap-3">
                <div
                  className="w-1 h-12 rounded-full flex-shrink-0"
                  style={{ backgroundColor: a.profissional?.cor_agenda ?? "#3B82F6" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {format(new Date(a.data_inicio), "HH:mm")}
                    {a.data_fim ? ` – ${format(new Date(a.data_fim), "HH:mm")}` : ""}
                    <Badge variant={statusColor[a.status] as any} className="ml-auto text-[10px]">
                      {statusLabel[a.status] ?? a.status}
                    </Badge>
                  </div>
                  <div className="font-semibold truncate">{a.paciente?.nome ?? "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">{a.profissional?.nome} • {a.tipo}</div>
                </div>
              </div>

              <div className="flex gap-1 flex-wrap">
                {a.status === "agendado" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => mudarStatus(a.id, "em_andamento")}>
                    <Play className="w-3 h-3 mr-1" /> Iniciar
                  </Button>
                )}
                {a.status === "em_andamento" && (
                  <Button size="sm" asChild className="h-7 text-xs">
                    <Link to={`/atendimentos/${a.id}/prontuario`}>
                      <FileText className="w-3 h-3 mr-1" /> Evoluir e finalizar
                    </Link>
                  </Button>
                )}
                {(a.status === "agendado" || a.status === "em_andamento") && (
                  <>
                    <Button size="sm" variant="ghost" asChild className="h-7 text-xs">
                      <Link to={`/atendimentos/${a.id}/prontuario`}>
                        <FileText className="w-3 h-3 mr-1" /> Prontuário
                      </Link>
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => cancelar(a.id)}>
                      <X className="w-3 h-3 mr-1" /> Cancelar
                    </Button>
                  </>
                )}
                {a.status === "realizado" && (
                  <Button size="sm" variant="ghost" asChild className="h-7 text-xs">
                    <Link to={`/atendimentos/${a.id}/prontuario`}>
                      <FileText className="w-3 h-3 mr-1" /> Ver evolução
                    </Link>
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
