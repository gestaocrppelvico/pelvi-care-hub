import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, Plus, Clock, FileText, X, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export default function Agenda() {
  const [day, setDay] = useState<Date>(new Date());
  const [list, setList] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 1)), []);

  useEffect(() => {
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
  }, [day]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <Button asChild size="sm">
          <Link to="/agenda/novo"><Plus className="w-4 h-4 mr-1" /> Novo</Link>
        </Button>
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
            <Card key={a.id} className="p-4 shadow-card flex items-center gap-3">
              <div
                className="w-1 h-12 rounded-full"
                style={{ backgroundColor: a.profissional?.cor_agenda ?? "#3B82F6" }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {format(new Date(a.data_inicio), "HH:mm")}
                  {a.data_fim ? ` – ${format(new Date(a.data_fim), "HH:mm")}` : ""}
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-secondary text-foreground">{a.tipo}</span>
                </div>
                <div className="font-semibold truncate">{a.paciente?.nome ?? "—"}</div>
                <div className="text-xs text-muted-foreground truncate">{a.profissional?.nome}</div>
              </div>
              <Button asChild size="icon" variant="ghost" aria-label="Abrir prontuário">
                <Link to={`/atendimentos/${a.id}/prontuario`}>
                  <FileText className="w-4 h-4" />
                </Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
