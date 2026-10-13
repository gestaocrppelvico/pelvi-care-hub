import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  format, addDays, addWeeks, addMonths,
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth,
  isToday, isSameDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Calendar, Clock, User, Plus, Search, X, Package, UserPlus } from "lucide-react";

// ==========================================================
// CONFIGURAÇÕES DA TIMELINE
// ==========================================================
const HORA_INICIO = 7;
const HORA_FIM = 21;
const ALTURA_HORA = 60;
const DURACAO_PADRAO = 40;

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
// ALGORITMO: layout de eventos paralelos
// ==========================================================
interface EventoPosicionado {
  at: Atendimento;
  top: number;
  height: number;
  leftPercent: number;
  widthPercent: number;
}

function calcularLayout(eventos: Atendimento[]): EventoPosicionado[] {
  if (eventos.length === 0) return [];

  const posicionados = eventos.map((at) => {
    const inicio = new Date(at.data_inicio);
    const fim = at.data_fim
      ? new Date(at.data_fim)
      : new Date(inicio.getTime() + DURACAO_PADRAO * 60 * 1000);

    const minutosInicio = (inicio.getHours() - HORA_INICIO) * 60 + inicio.getMinutes();
    const minutosFim = (fim.getHours() - HORA_INICIO) * 60 + fim.getMinutes();

    const top = Math.max(0, (minutosInicio / 60) * ALTURA_HORA);
    const altura = Math.max(((minutosFim - minutosInicio) / 60) * ALTURA_HORA, 26);

    return {
      at,
      top,
      height: altura,
      inicioMin: minutosInicio,
      fimMin: minutosFim,
      coluna: 0,
      totalColunas: 1,
    };
  });

  posicionados.sort((a, b) => {
    if (a.inicioMin !== b.inicioMin) return a.inicioMin - b.inicioMin;
    return b.fimMin - a.fimMin;
  });

  const clusters: (typeof posicionados)[] = [];
  let clusterAtual: typeof posicionados = [];
  let clusterFim = -1;

  for (const p of posicionados) {
    if (clusterAtual.length === 0 || p.inicioMin < clusterFim) {
      clusterAtual.push(p);
      clusterFim = Math.max(clusterFim, p.fimMin);
    } else {
      clusters.push(clusterAtual);
      clusterAtual = [p];
      clusterFim = p.fimMin;
    }
  }
  if (clusterAtual.length > 0) clusters.push(clusterAtual);

  for (const cluster of clusters) {
    const colunas: (typeof posicionados)[] = [];

    for (const p of cluster) {
      let colocado = false;
      for (let c = 0; c < colunas.length; c++) {
        if (colunas[c].fimMin <= p.inicioMin) {
          colunas[c] = p;
          p.coluna = c;
          colocado = true;
          break;
        }
      }
      if (!colocado) {
        p.coluna = colunas.length;
        colunas.push(p);
      }
    }

    const total = colunas.length;
    for (const p of cluster) {
      p.totalColunas = total;
    }
  }

  return posicionados.map((p) => {
    const larguraTotal = 100 / p.totalColunas;
    const gap = 0.5;
    return {
      at: p.at,
      top: p.top,
      height: p.height,
      leftPercent: p.coluna * larguraTotal,
      widthPercent: larguraTotal - gap,
    };
  });
}

// ==========================================================
// BLOCO DE EVENTO
// ==========================================================
function BlocoEvento({
  at,
  onClick,
  top,
  height,
  leftPercent,
  widthPercent,
}: {
  at: Atendimento;
  onClick: () => void;
  top: number;
  height: number;
  leftPercent: number;
  widthPercent: number;
}) {
  const data = new Date(at.data_inicio);
  const cor = at.profissional?.cor_agenda || "#3b82f6";
  const cancelado = at.status === "cancelado";
  const faltou = at.status === "faltou";
  const realizado = at.status === "realizado";
  const compacto = widthPercent < 40;

  return (
    <button
      onClick={onClick}
      className={`absolute rounded-md px-1.5 py-1 text-left cursor-pointer hover:shadow-lg hover:z-20 transition-all overflow-hidden ${
        cancelado ? "opacity-50 line-through" : ""
      } ${faltou ? "opacity-60" : ""}`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPercent}% + 2px)`,
        width: `calc(${widthPercent}% - 4px)`,
        backgroundColor: realizado ? "#d1fae5" : cor + "22",
        borderLeft: `4px solid ${realizado ? "#10b981" : cor}`,
      }}
    >
      <div className="text-[10px] font-bold text-slate-800 truncate leading-tight">
        {format(data, "HH:mm")}
        {!compacto && ` · ${at.paciente?.nome || at.nome_paciente_livre || "—"}`}
      </div>
      {compacto && (
        <div className="text-[9px] text-slate-700 truncate leading-tight mt-0.5">
          {at.paciente?.nome?.split(" ")[0] || at.nome_paciente_livre?.split(" ")[0] || "—"}
        </div>
      )}
      {height > 48 && !compacto && (
        <div className="text-[9px] text-slate-500 truncate leading-tight mt-0.5">
          {at.profissional?.nome?.split(" ")[0] || "Sem profissional"}
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

  // Estados do modal de criação
  const [modalCriarOpen, setModalCriarOpen] = useState(false);
  const [criando, setCriando] = useState(false);
  const [formCriar, setFormCriar] = useState({
    paciente_id: "",
    paciente_nome: "",
    profissional_id: "",
    data: format(new Date(), "yyyy-MM-dd"),
    hora_inicio: "14:00",
    hora_fim: "14:40",
    paciente_pacote_id: "",
    observacoes: "",
  });
  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [sugestoesPacientes, setSugestoesPacientes] = useState<{ id: string; nome: string; telefone: string | null }[]>([]);
  const [pacoteSugerido, setPacoteSugerido] = useState<{ id: string; label: string } | null>(null);
  const [criandoPaciente, setCriandoPaciente] = useState(false);
  const [novoPacienteNome, setNovoPacienteNome] = useState("");
  const [novoPacienteTelefone, setNovoPacienteTelefone] = useState("");

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    supabase
      .from("profissionais")
      .select("id, nome, cor_agenda")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => setProfissionais((data as any) || []));
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profissionais")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setMeuProfId(data?.id ?? null));
  }, [user]);

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

  const abrirCriar = (data?: Date, horaInicio?: string, profissionalId?: string) => {
    const dia = data ? format(data, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    const hora = horaInicio || "14:00";

    const [h, m] = hora.split(":").map(Number);
    const fim = new Date();
    fim.setHours(h, m + DURACAO_PADRAO, 0, 0);
    const horaFim = format(fim, "HH:mm");

    const profId = profissionalId || meuProfId || (isAdmin || isSecretaria
      ? profissionais[0]?.id || ""
      : meuProfId || "");

    setFormCriar({
      paciente_id: "",
      paciente_nome: "",
      profissional_id: profId,
      data: dia,
      hora_inicio: hora,
      hora_fim: horaFim,
      paciente_pacote_id: "",
      observacoes: "",
    });
    setBuscaPaciente("");
    setSugestoesPacientes([]);
    setPacoteSugerido(null);
    setCriandoPaciente(false);
    setNovoPacienteNome("");
    setNovoPacienteTelefone("");
    setModalCriarOpen(true);
  };

  useEffect(() => {
    if (buscaPaciente.trim().length < 2) {
      setSugestoesPacientes([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome, telefone")
        .ilike("nome", `%${buscaPaciente.trim()}%`)
        .eq("ativo", true)
        .limit(6);
      setSugestoesPacientes(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [buscaPaciente]);

  async function selecionarPaciente(p: { id: string; nome: string; telefone: string | null }) {
    setFormCriar((prev) => ({
      ...prev,
      paciente_id: p.id,
      paciente_nome: p.nome,
    }));
    setBuscaPaciente("");
    setSugestoesPacientes([]);

    const { data: pacotes } = await supabase
      .from("paciente_pacotes")
      .select(`
        id, sessoes_restantes,
        autorizacao:autorizacoes(plano),
        pacote:pacotes(nome),
        servico:servicos(nome)
      `)
      .eq("paciente_id", p.id)
      .gt("sessoes_restantes", 0)
      .order("sessoes_restantes", { ascending: true })
      .limit(1);

    if (pacotes && pacotes.length > 0) {
      const pac = pacotes[0] as any;
      const nome = pac.autorizacao?.plano
        ? `Plano ${pac.autorizacao.plano}`
        : pac.pacote?.nome || pac.servico?.nome || "Item";
      setPacoteSugerido({
        id: pac.id,
        label: `${nome} (${pac.sessoes_restantes} rest.)`,
      });
      setFormCriar((prev) => ({ ...prev, paciente_pacote_id: pac.id }));
    } else {
      setPacoteSugerido(null);
    }
  }

  async function criarPacienteRapido() {
    if (!novoPacienteNome.trim()) {
      toast.error("Informe o nome do paciente");
      return;
    }
    setCriandoPaciente(true);
    try {
      const { data, error } = await supabase
        .from("pacientes")
        .insert({
          nome: novoPacienteNome.trim(),
          telefone: novoPacienteTelefone.trim() || null,
          ativo: true,
        })
        .select("id, nome, telefone")
        .single();
      if (error) throw error;
      toast.success("Paciente criado!");
      await selecionarPaciente(data);
      setCriandoPaciente(false);
      setNovoPacienteNome("");
      setNovoPacienteTelefone("");
    } catch (err: any) {
      toast.error("Erro: " + err.message);
      setCriandoPaciente(false);
    }
  }

  async function salvarAtendimento() {
    if (!formCriar.paciente_id) {
      toast.error("Selecione o paciente");
      return;
    }
    if (!formCriar.profissional_id) {
      toast.error("Selecione o profissional");
      return;
    }
    if (!formCriar.data || !formCriar.hora_inicio || !formCriar.hora_fim) {
      toast.error("Preencha data e horário");
      return;
    }

    setCriando(true);
    try {
      const dataInicio = new Date(`${formCriar.data}T${formCriar.hora_inicio}:00`);
      const dataFim = new Date(`${formCriar.data}T${formCriar.hora_fim}:00`);

      if (dataFim <= dataInicio) {
        toast.error("O horário de fim deve ser depois do início");
        setCriando(false);
        return;
      }

      const { data: pacData } = formCriar.paciente_pacote_id
        ? await supabase
            .from("paciente_pacotes")
            .select("autorizacao_id")
            .eq("id", formCriar.paciente_pacote_id)
            .maybeSingle()
        : { data: null };

      const tipo = pacData?.autorizacao_id ? "Plano" : "Particular";

      const { error } = await supabase.from("atendimentos").insert({
        paciente_id: formCriar.paciente_id,
        profissional_id: formCriar.profissional_id,
        data_inicio: dataInicio.toISOString(),
        data_fim: dataFim.toISOString(),
        status: "agendado",
        tipo,
        paciente_pacote_id: formCriar.paciente_pacote_id || null,
        observacoes: formCriar.observacoes.trim() || null,
      });

      if (error) throw error;

      toast.success("Atendimento criado!");
      setModalCriarOpen(false);
      await carregar();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setCriando(false);
    }
  }

  const atendimentosDoDia = atendimentos.filter((a) =>
    isSameDay(new Date(a.data_inicio), currentDate)
  );

  const profissionaisVisiveis = profissionais.filter((p) => {
    if (isAdmin || isSecretaria) {
      if (profFiltroUrl) return p.id === profFiltroUrl;
      return true;
    }
    return p.id === meuProfId;
  });

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

        <div className="flex gap-2 items-center self-stretch sm:self-auto">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {(["day", "week", "month", "profissionais"] as const).map((v) => (
              <Button
                key={v}
                variant={view === v ? "default" : "ghost"}
                size="sm"
                onClick={() => setView(v)}
                className="text-xs capitalize font-semibold h-8"
              >
                {v === "day" ? "Dia" : v === "week" ? "Semana" : v === "month" ? "Mês" : "Profis."}
              </Button>
            ))}
          </div>

          <Button
            size="sm"
            onClick={() => abrirCriar()}
            className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Novo
          </Button>
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

      {/* VISÃO DIA — 1 COLUNA */}
      {view === "day" && modoDia === "unica" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
            <div
              className="relative"
              style={{ height: `${(HORA_FIM - HORA_INICIO) * ALTURA_HORA + 40}px` }}
            >
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

              <div
                className="absolute left-14 right-0 top-0 bottom-0 cursor-pointer"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = e.clientY - rect.top;
                  const horas = y / ALTURA_HORA;
                  const horaInt = Math.floor(horas) + HORA_INICIO;
                  const minInt = Math.floor((horas % 1) * 4) * 15;
                  const hora = `${String(horaInt).padStart(2, "0")}:${String(minInt).padStart(2, "0")}`;
                  abrirCriar(currentDate, hora);
                }}
              >
                {atendimentosDoDia.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground pointer-events-none">
                    Nenhum atendimento. Clique em um horário para criar.
                  </div>
                ) : (
                  calcularLayout(atendimentosDoDia).map(({ at, top, height, leftPercent, widthPercent }) => (
                    <BlocoEvento
                      key={at.id}
                      at={at}
                      onClick={() => abrirDetalhes(at)}
                      top={top}
                      height={height}
                      leftPercent={leftPercent}
                      widthPercent={widthPercent}
                    />
                  ))
                )}

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

      {/* VISÃO DIA — POR PROFISSIONAL */}
      {view === "day" && modoDia === "porProfissional" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <div className="flex min-w-full">
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
                      className="relative cursor-pointer"
                      style={{ height: `${(HORA_FIM - HORA_INICIO) * ALTURA_HORA}px` }}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button")) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const horas = y / ALTURA_HORA;
                        const horaInt = Math.floor(horas) + HORA_INICIO;
                        const minInt = Math.floor((horas % 1) * 4) * 15;
                        const hora = `${String(horaInt).padStart(2, "0")}:${String(minInt).padStart(2, "0")}`;
                        abrirCriar(currentDate, hora, prof.id);
                      }}
                    >
                      {Array.from({ length: HORA_FIM - HORA_INICIO + 1 }, (_, i) => (
                        <div
                          key={i}
                          className="absolute left-0 right-0 border-t border-slate-100 pointer-events-none"
                          style={{ top: `${i * ALTURA_HORA}px` }}
                        />
                      ))}

                      {calcularLayout(eventosProf).map(({ at, top, height, leftPercent, widthPercent }) => (
                        <BlocoEvento
                          key={at.id}
                          at={at}
                          onClick={() => abrirDetalhes(at)}
                          top={top}
                          height={height}
                          leftPercent={leftPercent}
                          widthPercent={widthPercent}
                        />
                      ))}

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

      {/* VISÃO SEMANA */}
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

      {/* VISÃO MÊS */}
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

      {/* VISÃO PROFISSIONAIS */}
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

      {/* SHEET DE DETALHES */}
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
                <p className="font-bold">🎯 Bloco 2A — Criação ativa</p>
                <p>
                  Você já pode <strong>criar</strong> novos atendimentos clicando em "+ Novo" ou
                  em um horário vazio. Editar e mover eventos vem no Bloco 2B.
                </p>
                <p>
                  Para editar os existentes, use a agenda atual em{" "}
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

      {/* MODAL: NOVO ATENDIMENTO */}
      <Dialog open={modalCriarOpen} onOpenChange={setModalCriarOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-600" /> Novo Atendimento
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-600">
                Paciente *
              </Label>

              {formCriar.paciente_id ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <div className="flex-1">
                    <div className="font-bold text-sm text-slate-800">
                      {formCriar.paciente_nome}
                    </div>
                    {pacoteSugerido && (
                      <div className="text-[11px] text-emerald-700 mt-0.5">
                        📦 Sugerido: {pacoteSugerido.label}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setFormCriar((prev) => ({
                        ...prev,
                        paciente_id: "",
                        paciente_nome: "",
                        paciente_pacote_id: "",
                      }));
                      setPacoteSugerido(null);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : criandoPaciente ? (
                <div className="border rounded-lg p-3 space-y-2 bg-slate-50">
                  <div className="text-xs font-bold text-slate-600">Novo paciente</div>
                  <Input
                    placeholder="Nome completo"
                    value={novoPacienteNome}
                    onChange={(e) => setNovoPacienteNome(e.target.value)}
                    className="h-9 text-sm"
                  />
                  <Input
                    placeholder="Telefone (opcional)"
                    value={novoPacienteTelefone}
                    onChange={(e) => setNovoPacienteTelefone(e.target.value)}
                    className="h-9 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs"
                      onClick={() => setCriandoPaciente(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                      onClick={criarPacienteRapido}
                    >
                      <UserPlus className="w-3 h-3 mr-1" /> Criar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Buscar paciente pelo nome..."
                      value={buscaPaciente}
                      onChange={(e) => setBuscaPaciente(e.target.value)}
                      className="h-10 text-sm pl-9"
                      autoFocus
                    />
                  </div>

                  {sugestoesPacientes.length > 0 && (
                    <div className="border rounded-lg max-h-40 overflow-y-auto bg-white">
                      {sugestoesPacientes.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => selecionarPaciente(p)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b last:border-0 flex justify-between"
                        >
                          <span className="font-medium">{p.nome}</span>
                          {p.telefone && (
                            <span className="text-xs text-muted-foreground">{p.telefone}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {buscaPaciente.trim().length >= 2 && sugestoesPacientes.length === 0 && (
                    <button
                      onClick={() => {
                        setNovoPacienteNome(buscaPaciente.trim());
                        setCriandoPaciente(true);
                      }}
                      className="w-full text-left px-3 py-2 border rounded-lg text-sm text-emerald-700 hover:bg-emerald-50 border-emerald-200 font-medium"
                    >
                      + Criar novo paciente "{buscaPaciente}"
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-600">
                Profissional *
              </Label>
              <Select
                value={formCriar.profissional_id}
                onValueChange={(v) => setFormCriar({ ...formCriar, profissional_id: v })}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Selecione o profissional" />
                </SelectTrigger>
                <SelectContent>
                  {profissionais.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: p.cor_agenda || "#3b82f6" }}
                        />
                        <span>{p.nome}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">Data</Label>
                <Input
                  type="date"
                  value={formCriar.data}
                  onChange={(e) => setFormCriar({ ...formCriar, data: e.target.value })}
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">Início</Label>
                <Input
                  type="time"
                  value={formCriar.hora_inicio}
                  onChange={(e) => {
                    const ini = e.target.value;
                    const [h, m] = ini.split(":").map(Number);
                    const fim = new Date();
                    fim.setHours(h, m + DURACAO_PADRAO, 0, 0);
                    setFormCriar({
                      ...formCriar,
                      hora_inicio: ini,
                      hora_fim: format(fim, "HH:mm"),
                    });
                  }}
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">Fim</Label>
                <Input
                  type="time"
                  value={formCriar.hora_fim}
                  onChange={(e) => setFormCriar({ ...formCriar, hora_fim: e.target.value })}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            {pacoteSugerido && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
                <Package className="w-5 h-5 text-blue-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase font-bold text-blue-700">
                    Pacote sugerido
                  </div>
                  <div className="text-sm font-medium text-slate-800 truncate">
                    {pacoteSugerido.label}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-blue-700 hover:bg-blue-100"
                  onClick={() => {
                    setPacoteSugerido(null);
                    setFormCriar({ ...formCriar, paciente_pacote_id: "" });
                  }}
                >
                  Remover
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-600">
                Observações
              </Label>
              <Textarea
                value={formCriar.observacoes}
                onChange={(e) => setFormCriar({ ...formCriar, observacoes: e.target.value })}
                rows={2}
                placeholder="Alguma observação sobre este agendamento..."
                className="text-sm"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setModalCriarOpen(false)}
                disabled={criando}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 font-bold"
                onClick={salvarAtendimento}
                disabled={criando || !formCriar.paciente_id || !formCriar.profissional_id}
              >
                {criando ? "Salvando..." : "Salvar Atendimento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
