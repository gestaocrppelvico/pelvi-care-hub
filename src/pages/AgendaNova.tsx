import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  format, addDays, addWeeks, addMonths,
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth,
  isToday, isSameDay, differenceInMinutes,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight, Calendar, Clock, User } from "lucide-react";

// ==========================================================
// CONFIGURAÇÕES DA TIMELINE
// ==========================================================
const HORA_INICIO = 7;
const HORA_FIM = 21;
const ALTURA_HORA = 60; // px por hora
const DURACAO_PADRAO = 40; // min

interface Atendimento {
  id: string;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  tipo: string;
  nome_paciente_livre: string | null;
  telefone_contato: string | null;
  paciente_id: string | null;
  paciente_pacote_id: string | null;
  paciente: { nome: string; telefone: string | null } | null;
  profissional: { id: string; nome: string; cor_agenda: string } | null;
  profissional_id: string | null;
}

interface Profissional {
  id: string;
  nome: string;
  cor_agenda: string | null;
}

type ViewMode = "day" | "week" | "month" | "profissionais";
type ModoDia = "unica" | "porProfissional";

// ==========================================================
// COMPONENTE: bloco de evento posicionado na timeline
// ==========================================================
function BlocoEvento({
  at,
  onClick,
}: {
  at: Atendimento;
  onClick: () => void;
}) {
  const data = new Date(at.data_inicio);
  const dataFim = at.data_fim ? new Date(at.data_fim) : null;

  const minutos = (data.getHours() - HORA_INICIO) * 60 + data.getMinutes();
  const top = Math.max(0, (minutos / 60) * ALTURA_HORA);

  let duracao = DURACAO_PADRAO;
  if (dataFim) {
    const d = differenceInMinutes(dataFim, data);
    if (d > 0) duracao = d;
  }
  const height = Math.max((duracao / 60) * ALTURA_HORA, 26);

  const cor = at.profissional?.cor_agenda || "#3b82f6";
  const cancelado = at.status === "cancelado";
  const faltou = at.status === "faltou";
  const realizado = at.status === "realizado";

  return (
    <button
      onClick={onClick}
      className={`absolute rounded-md px-2 py-1 text-left cursor-pointer hover:shadow-lg hover:z-20 transition-all overflow-hidden ${
        cancelado ? "opacity-50 line-through" : ""
      } ${faltou ? "opacity-60" : ""}`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: "4px",
        right: "4px",
        backgroundColor: realizado ? "#d1fae5" : cor + "22",
        borderLeft: `4px solid ${realizado ? "#10b981" : cor}`,
      }}
    >
      <div className="text-[11px] font-bold text-slate-800 truncate leading-tight">
        {format(data, "HH:mm")} · {at.paciente?.nome || at.nome_paciente_livre || "—"}
      </div>
      {height > 38 && (
        <div className="text-[10px] text-slate-600 truncate leading-tight mt-0.5">
          {at.profissional?.nome || "Sem profissional"}
        </div>
      )}
    </button>
  );
}

// ==========================================================
// COMPONENTE PRINCIPAL
// ==========================================================
export default function AgendaNova() {
  const { user, isAdmin, isSecretaria } = useAuth();
  const [searchParams] = useSearchParams();
  const profFiltroUrl = searchParams.get("profissional");

  const [view, setView] = useState<ViewMode>("day");
  const [modoDia, setModoDia] = useState<ModoDia>("unica");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAtend, setSelectedAtend] = useState<Atendimento | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [meuProfId, setMeuProfId] = useState<string | null>(null);
  const [agora, setAgora] = useState(new Date());

  // 🔥 Atualiza linha "agora" a cada 1 min
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Carrega profissionais
  useEffect(() => {
    supabase
      .from("profissionais")
      .select("id, nome, cor_agenda")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => setProfissionais((data as any) || []));
  }, []);

  // Descobre o profissional logado
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profissionais")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setMeuProfId(data?.id ?? null));
  }, [user]);

  // ============ CARREGAR ATENDIMENTOS ============
  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      let start: Date, end: Date;

      if (view === "day" || view === "profissionais") {
        start = startOfDay(currentDate);
        end = endOfDay(currentDate);
      } else if (view === "week") {
        start = startOfWeek(currentDate, { weekStartsOn: 1 });
        end = endOfWeek(currentDate, { weekStartsOn: 1 });
      } else {
        start = startOfMonth(currentDate);
        end = endOfMonth(currentDate);
      }

      let query = supabase
        .from("atendimentos")
        .select(`
          id, data_inicio, data_fim, status, tipo,
          nome_paciente_livre, telefone_contato,
          paciente_id, paciente_pacote_id, profissional_id,
          paciente:pacientes(nome, telefone),
          profissional:profissionais(id, nome, cor_agenda)
        `)
        .gte("data_inicio", start.toISOString())
        .lte("data_inicio", end.toISOString())
        .order("data_inicio", { ascending: true });

      if (!isAdmin && !isSecretaria && meuProfId) {
        query = query.eq("profissional_id", meuProfId);
      } else if (profFiltroUrl) {
        query = query.eq("profissional_id", profFiltroUrl);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAtendimentos((data as any) || []);
    } catch (err: any) {
      toast.error("Erro ao carregar agenda: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [view, currentDate, profFiltroUrl, meuProfId, isAdmin, isSecretaria]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Navegação
  const anterior = () => {
    if (view === "day" || view === "profissionais") setCurrentDate((d) => addDays(d, -1));
    else if (view === "week") setCurrentDate((d) => addWeeks(d, -1));
    else setCurrentDate((d) => addMonths(d, -1));
  };
  const proximo = () => {
    if (view === "day" || view === "profissionais") setCurrentDate((d) => addDays(d, 1));
    else if (view === "week") setCurrentDate((d) => addWeeks(d, 1));
    else setCurrentDate((d) => addMonths(d, 1));
  };

  const abrirDetalhes = (at: Atendimento) => {
    setSelectedAtend(at);
    setSheetOpen(true);
  };

  // Events of the current day
  const atendimentosDoDia = atendimentos.filter((a) =>
    isSameDay(new Date(a.data_inicio), currentDate)
  );

  // Professionals that appear in current filter
  const profissionaisVisiveis = profissionais.filter((p) => {
    if (isAdmin || isSecretaria) {
      if (profFiltroUrl) return p.id === profFiltroUrl;
      return true;
    }
    return p.id === meuProfId;
  });

  // ============ RENDER ============
  if (loading && atendimentos.length === 0) {
    return (
      <div className="p-10 text-center text-muted-foreground animate-pulse">
        Carregando agenda...
      </div>
    );
  }

  return (
    <div className="space-y-3 p-2 max-w-7xl mx-auto pb-24">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3 rounded-xl border shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={anterior}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={() => setCurrentDate(new Date())} className="text-xs font-semibold">
            Hoje
          </Button>
          <Button variant="outline" size="icon" onClick={proximo}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <h2 className="text-sm font-bold capitalize text-slate-700 ml-1 truncate">
            {view === "month"
              ? format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })
              : format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </h2>
        </div>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg self-stretch sm:self-auto">
          {(["day", "week", "month", "profissionais"] as const).map((v) => (
            <Button
              key={v}
              variant={view === v ? "default" : "ghost"}
              size="sm"
              onClick={() => setView(v)}
              className="text-xs capitalize flex-1 sm:flex-none font-semibold h-8"
            >
              {v === "day" ? "Dia" : v === "week" ? "Semana" : v === "month" ? "Mês" : "Profis."}
            </Button>
          ))}
        </div>
      </div>

      {/* TOGGLE DO MODO DIA */}
      {view === "day" && (
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border shadow-sm">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Modo:</span>
          <Button
            size="sm"
            variant={modoDia === "unica" ? "default" : "ghost"}
            onClick={() => setModoDia("unica")}
            className="h-7 text-xs"
          >
            1 Coluna
          </Button>
          <Button
            size="sm"
            variant={modoDia === "porProfissional" ? "default" : "ghost"}
            onClick={() => setModoDia("porProfissional")}
            className="h-7 text-xs"
          >
            Por Profissional
          </Button>
          <Badge variant="outline" className="ml-auto text-[10px] h-6">
            {atendimentosDoDia.length} atend.
          </Badge>
        </div>
      )}

      {/* ============ VISÃO DIA — 1 COLUNA ============ */}
      {view === "day" && modoDia === "unica" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
            <div
              className="relative"
              style={{ height: `${(HORA_FIM - HORA_INICIO) * ALTURA_HORA + 40}px` }}
            >
              {/* Hour markers */}
              {Array.from({ length: HORA_FIM - HORA_INICIO + 1 }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 flex items-start pointer-events-none"
                  style={{ top: `${i * ALTURA_HORA}px` }}
                >
                  <div className="w-14 text-[10px] text-muted-foreground text-right pr-2 -mt-2 font-medium">
                    {String(HORA_INICIO + i).padStart(2, "0")}:00
                  </div>
                  <div className="flex-1 border-t border-slate-100" />
                </div>
              ))}

              {/* Events area */}
              <div className="absolute left-14 right-0 top-0 bottom-0">
                {atendimentosDoDia.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    Nenhum atendimento neste dia.
                  </div>
                ) : (
                  atendimentosDoDia.map((at) => (
                    <BlocoEvento
                      key={at.id}
                      at={at}
                      onClick={() => abrirDetalhes(at)}
                    />
                  ))
                )}

                {/* Now line */}
                {isToday(currentDate) &&
                  agora.getHours() >= HORA_INICIO &&
                  agora.getHours() <= HORA_FIM && (
                    <div
                      className="absolute left-0 right-0 border-t-2 border-red-500 z-10 pointer-events-none"
                      style={{
                        top: `${
                          ((agora.getHours() - HORA_INICIO) * 60 + agora.getMinutes()) / 60 * ALTURA_HORA
                        }px`,
                      }}
                    >
                      <div className="absolute -left-1.5 -top-1.5 w-3 h-3 bg-red-500 rounded-full" />
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ VISÃO DIA — POR PROFISSIONAL ============ */}
      {view === "day" && modoDia === "porProfissional" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <div className="flex min-w-full">
              {/* Hour column */}
              <div className="w-14 shrink-0 border-r bg-slate-50/50">
                <div className="h-10 border-b" />
                <div
                  className="relative"
                  style={{ height: `${(HORA_FIM - HORA_INICIO) * ALTURA_HORA}px` }}
                >
                  {Array.from({ length: HORA_FIM - HORA_INICIO }, (_, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 text-[10px] text-muted-foreground text-right pr-2 font-medium"
                      style={{ top: `${i * ALTURA_HORA - 6}px` }}
                    >
                      {String(HORA_INICIO + i).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
              </div>

              {/* Columns per professional */}
              {profissionaisVisiveis.map((prof) => {
                const eventosProf = atendimentosDoDia.filter((a) => a.profissional_id === prof.id);
                const cor = prof.cor_agenda || "#3b82f6";

                return (
                  <div
                    key={prof.id}
                    className="flex-1 min-w-[180px] border-r last:border-r-0"
                  >
                    <div
                      className="h-10 border-b flex items-center justify-center gap-1.5"
                      style={{ backgroundColor: cor + "15" }}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: cor }}
                      />
                      <span className="text-xs font-bold" style={{ color: cor }}>
                        {prof.nome.split(" ")[0]}
                      </span>
                      {eventosProf.length > 0 && (
                        <span className="text-[9px] text-slate-500">({eventosProf.length})</span>
                      )}
                    </div>
                    <div
                      className="relative"
                      style={{ height: `${(HORA_FIM - HORA_INICIO) * ALTURA_HORA}px` }}
                    >
                      {/* Hour grid lines */}
                      {Array.from({ length: HORA_FIM - HORA_INICIO + 1 }, (_, i) => (
                        <div
                          key={i}
                          className="absolute left-0 right-0 border-t border-slate-100 pointer-events-none"
                          style={{ top: `${i * ALTURA_HORA}px` }}
                        />
                      ))}

                      {/* Events */}
                      {eventosProf.map((at) => (
                        <BlocoEvento
                          key={at.id}
                          at={at}
                          onClick={() => abrirDetalhes(at)}
                        />
                      ))}

                      {/* Now line */}
                      {isToday(currentDate) &&
                        agora.getHours() >= HORA_INICIO &&
                        agora.getHours() <= HORA_FIM && (
                          <div
                            className="absolute left-0 right-0 border-t-2 border-red-500 z-10 pointer-events-none"
                            style={{
                              top: `${
                                ((agora.getHours() - HORA_INICIO) * 60 + agora.getMinutes()) / 60 *
                                ALTURA_HORA
                              }px`,
                            }}
                          />
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============ VISÃO SEMANA ============ */}
      {view === "week" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <div className="grid grid-cols-7 min-w-[700px]">
              {eachDayOfInterval({
                start: startOfWeek(currentDate, { weekStartsOn: 1 }),
                end: endOfWeek(currentDate, { weekStartsOn: 1 }),
              }).map((dia) => {
                const evtsDia = atendimentos.filter((a) =>
                  isSameDay(new Date(a.data_inicio), dia)
                );
                const destacado = isToday(dia);

                return (
                  <div key={dia.toISOString()} className="border-r last:border-r-0">
                    <div
                      className={`h-12 border-b p-2 text-center ${
                        destacado ? "bg-red-50" : "bg-slate-50"
                      }`}
                    >
                      <div className="text-[10px] uppercase text-muted-foreground font-semibold">
                        {format(dia, "EEE", { locale: ptBR })}
                      </div>
                      <div className={`text-sm font-bold ${destacado ? "text-red-600" : "text-slate-700"}`}>
                        {format(dia, "dd")}
                      </div>
                    </div>
                    <div className="p-1.5 space-y-1 min-h-[400px] bg-white">
                      {evtsDia.length === 0 ? (
                        <div className="text-[10px] text-muted-foreground text-center pt-4">—</div>
                      ) : (
                        evtsDia.map((at) => {
                          const cor = at.profissional?.cor_agenda || "#3b82f6";
                          return (
                            <button
                              key={at.id}
                              onClick={() => abrirDetalhes(at)}
                              className="w-full text-left rounded px-1.5 py-1 hover:shadow-sm transition-all truncate"
                              style={{
                                backgroundColor: cor + "20",
                                borderLeft: `3px solid ${cor}`,
                              }}
                            >
                              <div className="text-[10px] font-bold text-slate-800 truncate">
                                {format(new Date(at.data_inicio), "HH:mm")}
                              </div>
                              <div className="text-[10px] text-slate-600 truncate">
                                {at.paciente?.nome?.split(" ")[0] ||
                                  at.nome_paciente_livre?.split(" ")[0] ||
                                  "—"}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============ VISÃO MÊS ============ */}
      {view === "month" && (
        <div className="bg-white rounded-xl border p-3 shadow-sm">
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 pb-2 border-b">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {eachDayOfInterval({
              start: startOfMonth(currentDate),
              end: endOfMonth(currentDate),
            }).map((dia, i) => {
              const evts = atendimentos.filter((a) =>
                isSameDay(new Date(a.data_inicio), dia)
              );
              const destacado = isToday(dia);

              return (
                <button
                  key={i}
                  onClick={() => {
                    setCurrentDate(dia);
                    setView("day");
                  }}
                  className={`min-h-[80px] p-1.5 rounded-lg border text-left hover:bg-blue-50 transition-all ${
                    !isSameMonth(dia, currentDate) ? "opacity-30" : ""
                  } ${destacado ? "ring-2 ring-red-300 bg-red-50/50" : "bg-slate-50/30"}`}
                >
                  <div className={`text-xs font-bold ${destacado ? "text-red-600" : "text-slate-600"}`}>
                    {format(dia, "d")}
                  </div>
                  {evts.length > 0 && (
                    <div className="text-[10px] font-bold text-blue-600 mt-1">
                      {evts.length} atend.
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ VISÃO PROFISSIONAIS ============ */}
      {view === "profissionais" && (
        <div className="space-y-3">
          {profissionaisVisiveis.map((prof) => {
            const cor = prof.cor_agenda || "#3b82f6";
            const evtsProf = atendimentosDoDia.filter((a) => a.profissional_id === prof.id);

            return (
              <div key={prof.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div
                  className="px-3 py-2 border-b flex items-center gap-2"
                  style={{ backgroundColor: cor + "15" }}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cor }} />
                  <span className="font-bold text-sm" style={{ color: cor }}>
                    {prof.nome}
                  </span>
                  <Badge variant="outline" className="ml-auto text-[10px] h-5">
                    {evtsProf.length} atend.
                  </Badge>
                </div>
                <div className="p-3">
                  {evtsProf.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic text-center py-3">
                      Sem atendimentos neste dia.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {evtsProf.map((at) => (
                        <button
                          key={at.id}
                          onClick={() => abrirDetalhes(at)}
                          className="text-left p-2 rounded-lg border hover:shadow-md transition-all"
                          style={{ borderLeft: `3px solid ${cor}` }}
                        >
                          <div className="text-[11px] font-bold text-slate-800">
                            {format(new Date(at.data_inicio), "HH:mm")}
                          </div>
                          <div className="text-[11px] text-slate-600 truncate">
                            {at.paciente?.nome || at.nome_paciente_livre || "—"}
                          </div>
                          <div className="text-[9px] text-muted-foreground mt-0.5 uppercase">
                            {at.status}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============ SHEET DE DETALHES ============ */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-5 space-y-4 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-lg font-bold text-slate-800">
              Detalhes do Atendimento
            </SheetTitle>
          </SheetHeader>

          {selectedAtend && (
            <>
              <div className="bg-slate-50 p-3 rounded-xl border space-y-2">
                <div className="flex items-start gap-2">
                  <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase text-muted-foreground font-bold">Paciente</div>
                    <div className="font-bold text-sm text-slate-800 truncate">
                      {selectedAtend.paciente?.nome ||
                        selectedAtend.nome_paciente_livre ||
                        "Sem identificação"}
                    </div>
                    {selectedAtend.telefone_contato && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {selectedAtend.telefone_contato}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground font-bold">Horário</div>
                    <div className="font-medium text-sm text-slate-700">
                      {format(new Date(selectedAtend.data_inicio), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="text-[10px] uppercase text-muted-foreground font-bold">
                      Profissional
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: selectedAtend.profissional?.cor_agenda || "#3b82f6",
                        }}
                      />
                      <span className="font-medium text-sm text-slate-700">
                        {selectedAtend.profissional?.nome || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  className={`text-xs uppercase font-bold ${
                    selectedAtend.status === "realizado"
                      ? "bg-emerald-600"
                      : selectedAtend.status === "cancelado"
                      ? "bg-red-500"
                      : selectedAtend.status === "faltou"
                      ? "bg-slate-400"
                      : "bg-blue-600"
                  }`}
                >
                  {selectedAtend.status}
                </Badge>
                {selectedAtend.tipo && (
                  <Badge variant="outline" className="text-xs uppercase font-bold">
                    {selectedAtend.tipo}
                  </Badge>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 space-y-1">
                <p className="font-bold">🎯 Bloco 1 — Visualização apenas</p>
                <p>
                  Esta é a primeira versão da nova agenda. Ainda <strong>não é possível editar,
                  criar ou arrastar</strong> eventos. Essas funções vêm nos próximos blocos.
                </p>
                <p>
                  Por enquanto, para editar, use a agenda atual em{" "}
                  <a href="/agenda" className="underline font-semibold">
                    /agenda
                  </a>
                  .
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
