import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  format, addDays, addWeeks, addMonths, startOfDay, endOfDay,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameMonth,
  differenceInMinutes, eachDayOfInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { abrirWhatsapp } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Clock, FileText, RefreshCw, Play, UserPlus, CheckCircle, Undo2,
  ChevronLeft, ChevronRight, MessageCircle, StopCircle,
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
  google_event_id: string | null;
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

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);

/* ───── helpers ───── */
function displayName(a: Atendimento) {
  return a.paciente?.nome ?? a.nome_paciente_livre ?? "—";
}
function eventColor(a: Atendimento) {
  return a.profissional?.cor_agenda ?? "#9CA3AF";
}
function statusBadge(a: Atendimento) {
  if (!a.paciente_id && a.nome_paciente_livre) return "Aguardando Cadastro";
  return statusLabel[a.status] ?? a.status;
}
function statusBadgeBg(a: Atendimento): string {
  if (!a.paciente_id && a.nome_paciente_livre) return "bg-amber-500/80";
  const map: Record<string, string> = {
    agendado: "bg-gray-400/80",
    em_andamento: "bg-blue-500/80",
    realizado: "bg-green-500/80",
    cancelado: "bg-red-500/80",
  };
  return map[a.status] ?? "bg-gray-400/80";
}
function cadastrarUrl(a: Atendimento) {
  const params = new URLSearchParams();
  if (a.nome_paciente_livre) params.set("nome", a.nome_paciente_livre);
  if (a.telefone_contato) params.set("telefone", a.telefone_contato);
  return `/pacientes/novo?${params.toString()}`;
}

/* previous status for undo */
const prevStatus: Record<string, string> = {
  em_andamento: "agendado",
  realizado: "em_andamento",
  cancelado: "agendado",
};

/* ═══════════════════ Component ═══════════════════ */
export default function Agenda() {
  const navigate = useNavigate();
  const { isSecretaria, isAdmin, isFisio, user } = useAuth();
  const [myProfissionalId, setMyProfissionalId] = useState<string | null>(null);

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
  const [syncing, setSyncing] = useState(false);
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

  /* ── fetch atendimentos ── */
  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from("atendimentos")
      .select("id, data_inicio, data_fim, status, tipo, paciente_id, nome_paciente_livre, telefone_contato, profissional_id, google_event_id, paciente:pacientes(nome, telefone), profissional:profissionais(nome, cor_agenda)")
      .gte("data_inicio", range.start.toISOString())
      .lte("data_inicio", range.end.toISOString())
      .neq("status", "cancelado")
      .order("data_inicio");
    setList((data as any) ?? []);
    if (!silent) setLoading(false);
  }, [range]);

  useEffect(() => { reload(); }, [reload]);

  /* ── sync from GCal then reload ── */
  const syncNow = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true);
    const body: Record<string, unknown> = {};
    if (isFisio && !isAdmin && !isSecretaria && myProfissionalId) {
      body.profissional_id = myProfissionalId;
    }
    const { error } = await supabase.functions.invoke("gcal-pull", { body });
    if (error && !silent) toast.error("Falha ao sincronizar: " + error.message);
    await reload(silent);
    if (!silent) { setSyncing(false); toast.success("Agenda atualizada"); }
  }, [isFisio, isAdmin, isSecretaria, myProfissionalId, reload]);

  /* ── initial sync + polling every 5 min ── */
  useEffect(() => {
    syncNow(true);
    pollRef.current = setInterval(() => syncNow(true), 5 * 60 * 1000);
    return () => clearInterval(pollRef.current);
  }, [syncNow]);

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

  async function iniciarSessao(a: Atendimento) {
    await mudarStatus(a.id, "em_andamento");
  }

  async function terminarSessao(a: Atendimento) {
    if (!confirm("Confirma que a sessão foi finalizada?")) return;
    const { error } = await supabase.from("atendimentos").update({ status: "realizado" as any }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    // The trigger processar_atendimento_realizado handles package deductions
    toast.success("Sessão finalizada");
    setSelected(null);
    reload();
  }

  async function desfazer(a: Atendimento) {
    const prev = prevStatus[a.status];
    if (!prev) { toast.error("Não é possível desfazer este status"); return; }
    if (!confirm(`Reverter de "${statusLabel[a.status]}" para "${statusLabel[prev]}"?`)) return;

    const { error } = await supabase.from("atendimentos").update({ status: prev as any }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }

    // If reverting from realizado, the trigger won't auto-undo the package deduction.
    // We need to manually revert sessoes_restantes +1 if there's a paciente_pacote_id.
    if (a.status === "realizado") {
      // Fetch full atendimento to check paciente_pacote_id
      const { data: full } = await supabase.from("atendimentos").select("paciente_pacote_id").eq("id", a.id).maybeSingle();
      if (full?.paciente_pacote_id) {
        // We can't do direct SQL, so increment via RPC or manual update
        // For now, use a raw increment approach
        const { data: pkg } = await supabase.from("paciente_pacotes").select("sessoes_restantes").eq("id", full.paciente_pacote_id).maybeSingle();
        if (pkg) {
          await supabase.from("paciente_pacotes").update({ sessoes_restantes: (pkg.sessoes_restantes ?? 0) + 1 }).eq("id", full.paciente_pacote_id);
        }
      }
    }

    toast.success(`Status revertido para "${statusLabel[prev]}"`);
    setSelected(null);
    reload();
  }

  /* ── whatsapp ── */
  function enviarWhatsapp(a: Atendimento) {
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
        <Button variant="outline" size="sm" onClick={() => syncNow()} disabled={syncing}>
          <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
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
          {view === "week" && <WeekView anchor={anchor} eventsByDay={eventsByDay} onSelect={setSelected} onDayClick={(d) => { setAnchor(d); setView("day"); }} />}
          {view === "month" && <MonthView anchor={anchor} eventsByDay={eventsByDay} onDayClick={(d) => { setAnchor(d); setView("day"); }} />}
        </>
      )}

      {/* DETAIL SHEET */}
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
                  <Badge variant={statusColor[selected.status] as any}>{statusBadge(selected)}</Badge>
                </div>
                {!selected.paciente_id && selected.nome_paciente_livre && (
                  <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800">⚠ Aguardando Cadastro</Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {/* INICIAR SESSÃO */}
                {selected.status === "agendado" && (
                  <Button size="sm" onClick={() => iniciarSessao(selected)}>
                    <Play className="w-3 h-3 mr-1" />Iniciar Sessão
                  </Button>
                )}

                {/* EVOLUIR */}
                {selected.status === "em_andamento" && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/atendimentos/${selected.id}/prontuario`}>
                      <FileText className="w-3 h-3 mr-1" />Evoluir
                    </Link>
                  </Button>
                )}

                {/* TERMINAR SESSÃO */}
                {selected.status === "em_andamento" && (
                  <Button size="sm" onClick={() => terminarSessao(selected)}>
                    <StopCircle className="w-3 h-3 mr-1" />Terminar Sessão
                  </Button>
                )}

                {/* CADASTRAR PACIENTE */}
                {!selected.paciente_id && selected.nome_paciente_livre && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={cadastrarUrl(selected)}><UserPlus className="w-3 h-3 mr-1" />Cadastrar Paciente</Link>
                  </Button>
                )}

                {/* WHATSAPP */}
                {(selected.paciente?.telefone || selected.telefone_contato) && (
                  <Button size="sm" variant="outline" onClick={() => enviarWhatsapp(selected)}>
                    <MessageCircle className="w-3 h-3 mr-1" />WhatsApp
                  </Button>
                )}

                {/* PRONTUÁRIO (any active status) */}
                {selected.status !== "cancelado" && selected.paciente_id && (
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={`/atendimentos/${selected.id}/prontuario`}><FileText className="w-3 h-3 mr-1" />Prontuário</Link>
                  </Button>
                )}

                {/* DESFAZER (admin/secretária only) */}
                {(isAdmin || isSecretaria) && selected.status !== "agendado" && (
                  <Button size="sm" variant="ghost" className="text-amber-600" onClick={() => desfazer(selected)}>
                    <Undo2 className="w-3 h-3 mr-1" />Desfazer
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
  // Calcula colunas para eventos sobrepostos
  const columns = useMemo(() => {
    const sorted = [...events].sort((a, b) =>
      new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime()
    );
    const cols: Atendimento[][] = [];
    sorted.forEach((evt) => {
      const start = new Date(evt.data_inicio).getTime();
      const end = evt.data_fim
        ? new Date(evt.data_fim).getTime()
        : start + 40 * 60_000;
      let placed = false;
      for (const col of cols) {
        const lastEnd = col[col.length - 1].data_fim
          ? new Date(col[col.length - 1].data_fim!).getTime()
          : new Date(col[col.length - 1].data_inicio).getTime() + 40 * 60_000;
        if (start >= lastEnd) {
          col.push(evt);
          placed = true;
          break;
        }
      }
      if (!placed) cols.push([evt]);
    });
    // Mapeia cada evento para sua coluna e total de colunas no grupo
    const map = new Map<string, { col: number; total: number }>();
    // Para cada evento, descobre quantas colunas coexistem no mesmo instante
    sorted.forEach((evt) => {
      const evtStart = new Date(evt.data_inicio).getTime();
      const evtEnd = evt.data_fim
        ? new Date(evt.data_fim).getTime()
        : evtStart + 40 * 60_000;
      const colIdx = cols.findIndex((c) => c.includes(evt));
      // Conta colunas que têm algum evento sobreposto com este
      let maxCols = 1;
      cols.forEach((col, ci) => {
        if (ci === colIdx) return;
        const overlaps = col.some((e) => {
          const s = new Date(e.data_inicio).getTime();
          const en = e.data_fim ? new Date(e.data_fim).getTime() : s + 40 * 60_000;
          return s < evtEnd && en > evtStart;
        });
        if (overlaps) maxCols = Math.max(maxCols, cols.length);
      });
      map.set(evt.id, { col: colIdx, total: cols.length > 1 ? cols.length : 1 });
    });
    return map;
  }, [events]);

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
                const { col, total } = columns.get(e.id) ?? { col: 0, total: 1 };
                const width = total > 1 ? `calc(${100 / total}% - 2px)` : "calc(100% - 8px)";
                const left = total > 1 ? `calc(${(col / total) * 100}%)` : "0px";
                return (
                  <button
                    key={e.id}
                    onClick={() => onSelect(e)}
                    className="absolute rounded px-1.5 py-0.5 text-[11px] leading-tight text-white truncate text-left shadow-sm hover:brightness-110 transition-all"
                    style={{ top: topOff, height, width, left, backgroundColor: eventColor(e) }}
                  >
                    <span className="font-medium">{displayName(e)}</span>
                    <span className="opacity-80 ml-1">{format(start, "HH:mm")}</span>
                    {height >= 36 && (
                      <span className={`block text-[9px] mt-0.5 px-1 rounded-sm w-fit ${statusBadgeBg(e)} text-white`}>
                        {statusBadge(e)}
                      </span>
                    )}
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
  anchor, eventsByDay, onSelect, onDayClick,
}: {
  anchor: Date;
  eventsByDay: Map<string, Atendimento[]>;
  onSelect: (a: Atendimento) => void;
  onDayClick: (d: Date) => void;
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
            <button
              className="w-full mb-1 hover:opacity-70 transition-opacity"
              onClick={() => onDayClick(d)}
            >
              <div className={`text-center text-[10px] uppercase ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>
                {format(d, "EEE", { locale: ptBR })}
              </div>
              <div className={`text-center text-sm ${isToday ? "bg-primary text-primary-foreground w-6 h-6 rounded-full mx-auto flex items-center justify-center font-bold" : ""}`}>
                {format(d, "d")}
              </div>
            </button>
            <div className="space-y-0.5">
              {evts.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onSelect(e)}
                  className="w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight text-white truncate hover:brightness-110 transition-colors"
                  style={{ backgroundColor: eventColor(e) }}
                >
                  {format(new Date(e.data_inicio), "HH:mm")} {displayName(e)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════ MONTH VIEW ═══════════════════ */
function MonthView({
  anchor, eventsByDay, onDayClick,
}: {
  anchor: Date;
  eventsByDay: Map<string, Atendimento[]>;
  onDayClick: (d: Date) => void;
}) {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: calStart, end: calEnd });
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div>
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
              {evts.length > 0 && (
                <div className="flex justify-center gap-0.5 flex-wrap">
                  {evts.slice(0, 3).map((e) => (
                    <div key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: eventColor(e) }} />
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
