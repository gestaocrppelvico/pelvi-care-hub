import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  format, addDays, addWeeks, addMonths, startOfDay, endOfDay,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay,
  differenceInMinutes, eachDayOfInterval, isSameMonth, getDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { abrirWhatsapp } from "@/lib/crm";
import { syncAtendimentoToGCal } from "@/lib/gcal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Plus, Clock, FileText, X, RefreshCw, Play, UserPlus,
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, MessageCircle,
} from "lucide-react";

/* ───── types ───── */
interface Atendimento {
  id: string;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  tipo: string;
  nome_paciente_livre: string | null;
  telefone_contato: string | null;
  paciente_id: string | null;
  paciente: { nome: string; telefone: string | null } | null;
  profissional: { nome: string; cor_agenda: string } | null;
  profissional_id: string;
}

type ViewMode = "day" | "week" | "month";

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

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7h–20h

/* ───── helpers ───── */
function displayName(a: Atendimento) {
  return a.paciente?.nome ?? a.nome_paciente_livre ?? "—";
}
function eventColor(a: Atendimento) {
  return a.profissional?.cor_agenda ?? "#9CA3AF"; // gray-400 fallback
}
function cadastrarUrl(a: Atendimento) {
  const params = new URLSearchParams();
  if (a.nome_paciente_livre) params.set("nome", a.nome_paciente_livre);
  if (a.telefone_contato) params.set("telefone", a.telefone_contato);
  return `/pacientes/novo?${params.toString()}`;
}

/* ═══════════════════ Component ═══════════════════ */
export default function Agenda() {
  const navigate = useNavigate();
  const { isSecretaria, isAdmin, isFisio, user } = useAuth();
  const [myProfissionalId, setMyProfissionalId] = useState<string | null>(null);

  // Fetch current user's profissional record (for fisio role-based sync)
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profissionais")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setMyProfissionalId(data?.id ?? null));
  }, [user]);
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [list, setList] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Atendimento | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  /* ── computed range ── */
  const range = useMemo(() => {
    if (view === "day") return { start: startOfDay(anchor), end: endOfDay(anchor) };
    if (view === "week") {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      return { start: startOfDay(s), end: endOfDay(addDays(s, 6)) };
    }
    return { start: startOfDay(startOfMonth(anchor)), end: endOfDay(endOfMonth(anchor)) };
  }, [view, anchor]);

  /* ── fetch ── */
  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from("atendimentos")
      .select("id, data_inicio, data_fim, status, tipo, paciente_id, nome_paciente_livre, telefone_contato, profissional_id, paciente:pacientes(nome, telefone), profissional:profissionais(nome, cor_agenda)")
      .gte("data_inicio", range.start.toISOString())
      .lte("data_inicio", range.end.toISOString())
      .neq("status", "cancelado")
      .order("data_inicio");
    setList((data as any) ?? []);
    if (!silent) setLoading(false);
  }, [range]);

  useEffect(() => { reload(); }, [reload]);

  /* ── polling 5s ── */
  useEffect(() => {
    pollRef.current = setInterval(() => reload(true), 5000);
    return () => clearInterval(pollRef.current);
  }, [reload]);

  /* ── sync trigger ── */
  async function syncNow() {
    toast.info("Sincronizando com Google Calendar...");
    // For fisio: sync only their own calendar; for admin/secretaria: sync all
    const body: Record<string, unknown> = {};
    if (isFisio && !isAdmin && !isSecretaria && myProfissionalId) {
      body.profissional_id = myProfissionalId;
    }
    const { error } = await supabase.functions.invoke("gcal-pull", { body });
    if (error) toast.error("Falha: " + error.message);
    else { toast.success("Sincronização concluída"); reload(); }
  }

  /* ── navigation ── */
  function nav(dir: -1 | 1) {
    setAnchor((prev) => {
      if (view === "day") return addDays(prev, dir);
      if (view === "week") return addWeeks(prev, dir);
      return addMonths(prev, dir);
    });
  }
  function goToday() { setAnchor(new Date()); }

  /* ── status changes ── */
  async function mudarStatus(id: string, novoStatus: string) {
    const { error } = await supabase.from("atendimentos").update({ status: novoStatus as any }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status → "${statusLabel[novoStatus]}"`);
    setSelected(null);
    reload();
  }
  async function cancelar(id: string) {
    if (!confirm("Cancelar este atendimento?")) return;
    const { error } = await supabase.from("atendimentos").update({ status: "cancelado" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await syncAtendimentoToGCal(id, "delete");
    toast.success("Atendimento cancelado");
    setSelected(null);
    reload();
  }

  /* ── whatsapp ── */
  function confirmarWhatsapp(a: Atendimento) {
    const tel = a.paciente?.telefone ?? a.telefone_contato;
    const msg = `Olá ${displayName(a)}, confirmando seu atendimento em ${format(new Date(a.data_inicio), "dd/MM/yyyy 'às' HH:mm")}.`;
    if (!abrirWhatsapp(tel, msg, isSecretaria)) toast.error("Telefone não disponível");
  }

  /* ── title ── */
  const title = useMemo(() => {
    if (view === "day") return format(anchor, "dd 'de' MMMM, yyyy", { locale: ptBR });
    if (view === "week") {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      const e = addDays(s, 6);
      return `${format(s, "dd/MM")} – ${format(e, "dd/MM/yyyy")}`;
    }
    return format(anchor, "MMMM yyyy", { locale: ptBR });
  }, [view, anchor]);

  /* ── events by day map ── */
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Atendimento[]>();
    list.forEach((a) => {
      const key = format(new Date(a.data_inicio), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return map;
  }, [list]);

  /* ═════════════ RENDER ═════════════ */
  return (
    <div className="space-y-3">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Agenda</h1>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={syncNow}><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" asChild><Link to="/agenda/novo"><Plus className="w-4 h-4 mr-1" />Novo</Link></Button>
        </div>
      </div>

      {/* VIEW SELECTOR */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {(["day", "week", "month"] as ViewMode[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}
          </button>
        ))}
      </div>

      {/* NAV */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)}><ChevronLeft className="w-5 h-5" /></Button>
        <button onClick={goToday} className="text-sm font-semibold capitalize">{title}</button>
        <Button variant="ghost" size="icon" onClick={() => nav(1)}><ChevronRight className="w-5 h-5" /></Button>
      </div>

      {loading && list.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Carregando...</p>
      ) : (
        <>
          {view === "day" && <DayView events={list} onSelect={setSelected} />}
          {view === "week" && <WeekView anchor={anchor} eventsByDay={eventsByDay} onSelect={setSelected} />}
          {view === "month" && <MonthView anchor={anchor} eventsByDay={eventsByDay} onDayClick={(d) => { setAnchor(d); setView("day"); }} onSelect={setSelected} />}
        </>
      )}

      {/* EVENT DETAIL DRAWER */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl">
          {selected && (
            <div className="space-y-4 pb-6">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: eventColor(selected) }} />
                  {displayName(selected)}
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  {format(new Date(selected.data_inicio), "dd/MM/yyyy HH:mm")}
                  {selected.data_fim && ` – ${format(new Date(selected.data_fim), "HH:mm")}`}
                </div>
                <p><strong>Profissional:</strong> {selected.profissional?.nome ?? "—"}</p>
                <p><strong>Tipo:</strong> {selected.tipo}</p>
                <div className="flex items-center gap-2">
                  <strong>Status:</strong>
                  <Badge variant={statusColor[selected.status] as any}>{statusLabel[selected.status]}</Badge>
                </div>
                {!selected.paciente_id && selected.nome_paciente_livre && (
                  <Badge variant="outline" className="text-xs">⚠ Paciente a cadastrar</Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {!selected.paciente_id && selected.nome_paciente_livre && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={cadastrarUrl(selected)}><UserPlus className="w-3 h-3 mr-1" />Cadastrar</Link>
                  </Button>
                )}
                {selected.status === "agendado" && (
                  <Button size="sm" variant="outline" onClick={() => mudarStatus(selected.id, "em_andamento")}>
                    <Play className="w-3 h-3 mr-1" />Iniciar
                  </Button>
                )}
                {selected.status === "em_andamento" && (
                  <Button size="sm" asChild>
                    <Link to={`/atendimentos/${selected.id}/prontuario`}><FileText className="w-3 h-3 mr-1" />Evoluir</Link>
                  </Button>
                )}
                {(selected.status === "agendado" || selected.status === "em_andamento") && (
                  <>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/atendimentos/${selected.id}/prontuario`}><FileText className="w-3 h-3 mr-1" />Prontuário</Link>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => confirmarWhatsapp(selected)}>
                      <MessageCircle className="w-3 h-3 mr-1" />WhatsApp
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancelar(selected.id)}>
                      <X className="w-3 h-3 mr-1" />Cancelar
                    </Button>
                  </>
                )}
                {selected.status === "realizado" && (
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={`/atendimentos/${selected.id}/prontuario`}><FileText className="w-3 h-3 mr-1" />Ver evolução</Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ═══════════════════ DAY VIEW ═══════════════════ */
function DayView({ events, onSelect }: { events: Atendimento[]; onSelect: (a: Atendimento) => void }) {
  return (
    <div className="relative border rounded-lg overflow-hidden bg-card">
      {HOURS.map((h) => (
        <div key={h} className="flex border-b last:border-b-0" style={{ minHeight: 60 }}>
          <div className="w-12 flex-shrink-0 text-[10px] text-muted-foreground text-right pr-2 pt-1">
            {String(h).padStart(2, "0")}:00
          </div>
          <div className="flex-1 relative">
            {events
              .filter((e) => new Date(e.data_inicio).getHours() === h)
              .map((e) => {
                const start = new Date(e.data_inicio);
                const end = e.data_fim ? new Date(e.data_fim) : new Date(start.getTime() + 40 * 60_000);
                const topOff = (start.getMinutes() / 60) * 60;
                const height = Math.max((differenceInMinutes(end, start) / 60) * 60, 24);
                return (
                  <button
                    key={e.id}
                    onClick={() => onSelect(e)}
                    className="absolute left-0 right-2 rounded px-2 py-0.5 text-[11px] leading-tight text-white truncate text-left shadow-sm hover:brightness-110 transition-all"
                    style={{ top: topOff, height, backgroundColor: eventColor(e) }}
                  >
                    <span className="font-medium">{displayName(e)}</span>
                    <span className="opacity-80 ml-1">{format(start, "HH:mm")}</span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════ WEEK VIEW ═══════════════════ */
function WeekView({
  anchor,
  eventsByDay,
  onSelect,
}: {
  anchor: Date;
  eventsByDay: Map<string, Atendimento[]>;
  onSelect: (a: Atendimento) => void;
}) {
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
      {days.map((d) => {
        const key = format(d, "yyyy-MM-dd");
        const isToday = key === today;
        const evts = eventsByDay.get(key) ?? [];
        return (
          <div key={key} className="bg-card min-h-[120px] p-1">
            <div className={`text-center text-[10px] uppercase mb-1 ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>
              {format(d, "EEE", { locale: ptBR })}
            </div>
            <div className={`text-center text-sm mb-1 ${isToday ? "bg-primary text-primary-foreground w-6 h-6 rounded-full mx-auto flex items-center justify-center font-bold" : ""}`}>
              {format(d, "d")}
            </div>
            <div className="space-y-0.5">
              {evts.slice(0, 4).map((e) => (
                <button
                  key={e.id}
                  onClick={() => onSelect(e)}
                  className="w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight text-white truncate hover:brightness-110 transition-colors"
                  style={{ backgroundColor: eventColor(e) }}
                >
                  {format(new Date(e.data_inicio), "HH:mm")} {displayName(e)}
                </button>
              ))}
              {evts.length > 4 && (
                <p className="text-[10px] text-muted-foreground text-center">+{evts.length - 4}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════ MONTH VIEW ═══════════════════ */
function MonthView({
  anchor,
  eventsByDay,
  onDayClick,
  onSelect,
}: {
  anchor: Date;
  eventsByDay: Map<string, Atendimento[]>;
  onDayClick: (d: Date) => void;
  onSelect: (a: Atendimento) => void;
}) {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: calStart, end: calEnd });
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div>
      {/* Header row */}
      <div className="grid grid-cols-7 mb-1">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
          <div key={d} className="text-center text-[10px] text-muted-foreground uppercase">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {allDays.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const isToday = key === today;
          const inMonth = isSameMonth(d, anchor);
          const evts = eventsByDay.get(key) ?? [];
          return (
            <button
              key={key}
              onClick={() => onDayClick(d)}
              className={`bg-card min-h-[52px] p-1 text-left transition-colors hover:bg-accent/50 ${!inMonth ? "opacity-40" : ""}`}
            >
              <div className={`text-xs text-center mb-0.5 ${isToday ? "bg-primary text-primary-foreground w-5 h-5 rounded-full mx-auto flex items-center justify-center font-bold text-[10px]" : ""}`}>
                {format(d, "d")}
              </div>
              {/* Dots */}
              {evts.length > 0 && (
                <div className="flex justify-center gap-0.5 flex-wrap">
                  {evts.slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: eventColor(e) }}
                    />
                  ))}
                  {evts.length > 3 && <span className="text-[8px] text-muted-foreground">+{evts.length - 3}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
