import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, CheckCheck } from "lucide-react";
import { useNotificacoes } from "@/hooks/useNotificacoes";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
import {
  ChevronLeft, ChevronRight, Calendar, Clock, User, Plus, Search, X, Package, UserPlus,
  MessageCircle, Send, FileText, ClipboardEdit, Eye, CheckCircle2, AlertCircle, Trash2, ExternalLink, Lock
} from "lucide-react";
import { aplicarTemplate, abrirWhatsapp, getPreferenciaWhatsApp } from "@/lib/crm";

// ==========================================================
// CONFIGURAÇÕES
// ==========================================================
const HORA_INICIO = 6;
const HORA_FIM = 22;
const ALTURA_HORA = 60;
const DURACAO_PADRAO = 40;
// ==========================================================
// BLOQUEIOS DE AGENDA
// ==========================================================
const TIPOS_BLOQUEIO = [
  { v: "almoco", label: "☕ Almoço", cor: "#e2e8f0" },
  { v: "folga", label: "🏖️ Folga", cor: "#cbd5e1" },
  { v: "ferias", label: "✈️ Férias", cor: "#dbeafe" },
  { v: "reuniao", label: "📞 Reunião", cor: "#ede9fe" },
  { v: "congresso", label: "🩺 Congresso", cor: "#dcfce7" },
  { v: "outro", label: "⚙️ Outro", cor: "#f1f5f9" },
];

interface Bloqueio {
  id: string;
  profissional_id: string | null;
  tipo: string;
  data_inicio: string;
  data_fim: string;
  observacoes: string | null;
  profissional?: { id: string; nome: string; cor_agenda: string | null } | null;
}

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
  observacoes: string | null;
  tipo_alteracao: string | null;
  paciente: { id: string; nome: string; telefone: string | null; pronome_tratamento: string | null } | null;
  profissional: { id: string; nome: string; cor_agenda: string } | null;
  profissional_id: string | null;
}
interface Profissional {
  id: string;
  nome: string;
  cor_agenda: string | null;
}

interface CrmTemplate {
  id: string;
  tipo: string;
  nome: string;
  conteudo: string;
}

type ViewMode = "day" | "week" | "month" | "profissionais";
type ModoDia = "unica" | "porProfissional";

// ==========================================================
// ALGORITMO DE LAYOUT PARALELO
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
      } ${faltou ? "opacity-60" : ""} ${realizado ? "opacity-80" : ""}`}
      style={{
        top: `${top}px`,
        height: `${Math.max(height - 3, 20)}px`,
        left: `calc(${leftPercent}% + 2px)`,
        width: `calc(${widthPercent}% - 4px)`,
        backgroundColor: realizado ? cor + "35" : cor + "22",
        borderLeft: `4px solid ${cor}`,
      }}
    >
            <div className="text-[10px] font-bold text-slate-800 truncate leading-tight">
        {realizado && "✅ "}
        {format(data, "HH:mm")}
        {!compacto && ` · ${at.paciente?.nome || at.nome_paciente_livre || "—"}`}
      </div>
      {realizado && !compacto && (
        <div className="text-[9px] text-emerald-700 font-semibold truncate leading-tight">
          Realizado
        </div>
      )}
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
// COMPONENTE: bloco de bloqueio
// ==========================================================
function BlocoBloqueio({
  bloqueio,
  top,
  height,
  leftPercent,
  widthPercent,
  onClick,
}: {
  bloqueio: Bloqueio;
  top: number;
  height: number;
  leftPercent: number;
  widthPercent: number;
  onClick: () => void;
}) {
  const tipoInfo = TIPOS_BLOQUEIO.find((t) => t.v === bloqueio.tipo) || TIPOS_BLOQUEIO[5];
  const inicio = new Date(bloqueio.data_inicio);
  const fim = new Date(bloqueio.data_fim);

  return (
    <button
      onClick={onClick}
      className="absolute rounded-md px-1.5 py-1 text-left cursor-pointer hover:shadow-md z-0 overflow-hidden"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPercent}% + 2px)`,
        width: `calc(${widthPercent}% - 4px)`,
        backgroundColor: tipoInfo.cor,
        borderLeft: "3px solid #64748b",
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(0,0,0,0.06) 6px, rgba(0,0,0,0.06) 12px)",
      }}
    >
      <div className="text-[10px] font-bold text-slate-700 truncate leading-tight">
        {tipoInfo.label}
      </div>
      {height > 40 && (
        <div className="text-[9px] text-slate-600 truncate leading-tight">
          {format(inicio, "HH:mm")} – {format(fim, "HH:mm")}
        </div>
      )}
      {height > 60 && bloqueio.observacoes && (
        <div className="text-[9px] text-slate-500 truncate leading-tight italic mt-0.5">
          {bloqueio.observacoes}
        </div>
      )}
    </button>
  );
}

// ==========================================================
// HELPER: calcular datas da recorrência
// ==========================================================
function calcularDatasRecorrencia(
  dataBase: Date,
  frequencia: "diaria" | "semanal" | "mensal" | "personalizado",
  diasSemana: number[],
  numeroSessoes: number,
  pularFinsDeSemana: boolean
): Date[] {
  const datas: Date[] = [];
  const d = new Date(dataBase);
  d.setHours(0, 0, 0, 0);

  datas.push(new Date(d));

  if (numeroSessoes <= 1) return datas;

  const diasOrdenados = [...diasSemana].sort();
  let safety = 0;

  if (frequencia === "diaria") {
    let cursor = new Date(d);
    while (datas.length < numeroSessoes && safety < 1000) {
      safety++;
      cursor = addDays(cursor, 1);
      if (pularFinsDeSemana && (cursor.getDay() === 0 || cursor.getDay() === 6)) continue;
      datas.push(new Date(cursor));
    }
  } else if (frequencia === "semanal" && diasOrdenados.length === 1) {
    while (datas.length < numeroSessoes && safety < 500) {
      safety++;
      const proxima = addWeeks(dataBase, safety);
      if (pularFinsDeSemana && (proxima.getDay() === 0 || proxima.getDay() === 6)) continue;
      datas.push(proxima);
    }
  } else if (frequencia === "mensal" && diasOrdenados.length === 1) {
    while (datas.length < numeroSessoes && safety < 500) {
      safety++;
      const proxima = addMonths(dataBase, safety);
      if (pularFinsDeSemana && (proxima.getDay() === 0 || proxima.getDay() === 6)) continue;
      datas.push(proxima);
    }
  } else {
    let cursor = new Date(d);
    while (datas.length < numeroSessoes && safety < 1000) {
      safety++;
      cursor = addDays(cursor, 1);
      if (!diasOrdenados.includes(cursor.getDay())) continue;
      if (pularFinsDeSemana && (cursor.getDay() === 0 || cursor.getDay() === 6)) continue;
      datas.push(new Date(cursor));
    }
  }

  return datas.slice(0, numeroSessoes);
}

// ==========================================================
// COMPONENTE PRINCIPAL
// ==========================================================
export default function AgendaNova() {
  const { user, isAdmin, isSecretaria } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const profFiltroUrl = searchParams.get("profissional");
  const [filtroPaciente, setFiltroPaciente] = useState("");
  const [view, setView] = useState<ViewMode>("day");
  const [modoDia, setModoDia] = useState<ModoDia>("unica");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAtend, setSelectedAtend] = useState<Atendimento | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [meuProfId, setMeuProfId] = useState<string | null>(null);
    // 🔥 Hook de notificações
  const { notificacoes, naoLidas, marcarComoLida, marcarTodasComoLidas } = useNotificacoes(meuProfId);
  const [agora, setAgora] = useState(new Date());
  const [busy, setBusy] = useState(false);
    // 🔥 States do modo edição
  const [modoEdicao, setModoEdicao] = useState(false);
  const [editForm, setEditForm] = useState({
    data: "",
    hora_inicio: "",
    hora_fim: "",
    profissional_id: "",
    tipo_alteracao: "remarcacao",
  });

  // 🔥 States do Sheet — vincular
  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [sugestoesPacientes, setSugestoesPacientes] = useState<{ id: string; nome: string; telefone: string | null }[]>([]);
  const [pacienteSelecionado, setPacienteSelecionado] = useState<{ id: string; nome: string; telefone: string | null } | null>(null);
  const [itensPaciente, setItensPaciente] = useState<any[]>([]);
  const [itemSelecionadoId, setItemSelecionadoId] = useState<string | null>(null);
  const [temProntuario, setTemProntuario] = useState(false);
  const [prontuarioId, setProntuarioId] = useState<string | null>(null);

  // 🔥 States do modal de criação
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
  const [buscaPacienteCriar, setBuscaPacienteCriar] = useState("");
  const [sugestoesPacientesCriar, setSugestoesPacientesCriar] = useState<{ id: string; nome: string; telefone: string | null }[]>([]);
  const [pacoteSugerido, setPacoteSugerido] = useState<{ id: string; label: string } | null>(null);
  const [criandoPaciente, setCriandoPaciente] = useState(false);
  const [novoPacienteNome, setNovoPacienteNome] = useState("");
  const [novoPacienteTelefone, setNovoPacienteTelefone] = useState("");
    // 🔥 States para criar pacote no modal
  const [mostrarCriarPacote, setMostrarCriarPacote] = useState(false);
  const [pacotesDisponiveis, setPacotesDisponiveis] = useState<any[]>([]);
  const [listaPlanos, setListaPlanos] = useState<any[]>([]);
  const [listaPacotesServicos, setListaPacotesServicos] = useState<any[]>([]);
  const [novoPacoteForm, setNovoPacoteForm] = useState({
    tipo: "particular" as "plano" | "particular",
    plano_id: "",
    numero_guia: "",
    pacote_servico_id: "",
    preco: "",
  });
  const [criandoPacote, setCriandoPacote] = useState(false);

  // 🔥 States do WhatsApp
  const [modalWhatsAppOpen, setModalWhatsAppOpen] = useState(false);
  const [templates, setTemplates] = useState<CrmTemplate[]>([]);
  const [templateSelecionadoId, setTemplateSelecionadoId] = useState<string>("");
  const [mensagemPreview, setMensagemPreview] = useState("");
    // 🔥 States da recorrência
  const [modalRecorrenciaOpen, setModalRecorrenciaOpen] = useState(false);
  const [recorrenciaBase, setRecorrenciaBase] = useState<{
    paciente_id: string;
    paciente_nome: string;
    profissional_id: string;
    data_inicio: Date;
    hora_inicio: string;
    hora_fim: string;
    paciente_pacote_id: string;
    sessoes_restantes: number;
    observacoes: string;
  } | null>(null);
    const [formRecorrencia, setFormRecorrencia] = useState({
    frequencia: "semanal" as "diaria" | "semanal" | "mensal" | "personalizado",
    numeroSessoes: 10,
    diasSemana: [4] as number[],
    pularFinsDeSemana: true,
  });
  const [previewDatas, setPreviewDatas] = useState<Date[]>([]);
  const [criandoRecorrencia, setCriandoRecorrencia] = useState(false);
    // 🔥 States de bloqueios
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([]);
  const [modalBloqueioOpen, setModalBloqueioOpen] = useState(false);
  const [criandoBloqueio, setCriandoBloqueio] = useState(false);
  const [formBloqueio, setFormBloqueio] = useState({
    tipo: "almoco",
    profissional_id: "",
    data_inicio: format(new Date(), "yyyy-MM-dd"),
    hora_inicio: "12:00",
    data_fim: format(new Date(), "yyyy-MM-dd"),
    hora_fim: "13:00",
    repetir: "nunca" as "nunca" | "diariamente" | "semanalmente" | "dias_uteis",
    repetir_ate: "",
    observacoes: "",
    notificar: true, // 🔥 NOVO
  });
  // 🔥 States de conflito de bloqueio
  const [modalConflitoOpen, setModalConflitoOpen] = useState(false);
  const [conflitoInfo, setConflitoInfo] = useState<Bloqueio | null>(null);

  const [modalConflitoRecOpen, setModalConflitoRecOpen] = useState(false);
  const [datasConflitoRec, setDatasConflitoRec] = useState<Date[]>([]);
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

  // Carrega templates do CRM
  useEffect(() => {
    supabase
      .from("crm_templates")
      .select("id, tipo, nome, conteudo")
      .eq("ativo", true)
      .order("tipo")
      .then(({ data }) => setTemplates((data as any) || []));
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      let start: Date, end: Date;

      if (view === "day" || view === "profissionais") {
        start = startOfDay(currentDate);
        end = endOfDay(currentDate);
      } else if (view === "week") {
        start = startOfWeek(currentDate, { weekStartsOn: 0 });
        end = endOfWeek(currentDate, { weekStartsOn: 0 });
      } else {
        start = startOfMonth(currentDate);
        end = endOfMonth(currentDate);
      }

      let query = supabase
        .from("atendimentos")
        .select(`
          id, data_inicio, data_fim, status, tipo, observacoes,
          nome_paciente_livre, telefone_contato,
          paciente_id, paciente_pacote_id, profissional_id,
          paciente:pacientes(id, nome, telefone, pronome_tratamento),
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

      // 🔥 Carregar bloqueios no período
      let queryBloq = supabase
        .from("bloqueios_agenda")
        .select(`
          id, profissional_id, tipo, data_inicio, data_fim, observacoes,
          profissional:profissionais(id, nome, cor_agenda)
        `)
        .gte("data_fim", start.toISOString())
        .lte("data_inicio", end.toISOString());

      if (!isAdmin && !isSecretaria && meuProfId) {
        queryBloq = queryBloq.or(`profissional_id.eq.${meuProfId},profissional_id.is.null`);
      }

      const { data: bloqs } = await queryBloq;
      setBloqueios((bloqs as any) || []);
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

    const atendimentosFiltrados = atendimentos.filter((a) => {
    if (!filtroPaciente) return true;
    const nome = a.paciente?.nome || a.nome_paciente_livre || "";
    return nome.toLowerCase().includes(filtroPaciente.toLowerCase());
  });

  const atendimentosDoDia = atendimentosFiltrados.filter((a) =>
    isSameDay(new Date(a.data_inicio), currentDate)
  );

  const profissionaisVisiveis = profissionais.filter((p) => {
    if (isAdmin || isSecretaria) {
      if (profFiltroUrl) return p.id === profFiltroUrl;
      return true;
    }
    return p.id === meuProfId;
  });

  // ============ BUSCA PACIENTES (Sheet) ============
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

  // ============ BUSCA PACIENTES (Criar) ============
  useEffect(() => {
    if (buscaPacienteCriar.trim().length < 2) {
      setSugestoesPacientesCriar([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome, telefone")
        .ilike("nome", `%${buscaPacienteCriar.trim()}%`)
        .eq("ativo", true)
        .limit(6);
      setSugestoesPacientesCriar(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [buscaPacienteCriar]);

  // ============ CARREGAR ITENS DO PACIENTE ============
    async function carregarItensPaciente(pacienteId: string, itemPreSelecionado?: string | null) {
    const { data } = await supabase
      .from("paciente_pacotes")
      .select(`
        id, sessoes_restantes, sessoes_totais, sessoes_realizadas,
        autorizacao:autorizacoes(plano, numero_guia),
        pacote:pacotes(nome),
        servico:servicos(nome)
      `)
      .eq("paciente_id", pacienteId)
      .order("created_at", { ascending: false });

    // 🔥 Filtra apenas os que realmente têm saldo
    const pacotesValidos = (data || []).filter(pac => {
      const restantesReais = pac.sessoes_totais - pac.sessoes_realizadas;
      return restantesReais > 0;
    });

    setItensPaciente(pacotesValidos);

    if (pacotesValidos.length > 0) {
      if (itemPreSelecionado && pacotesValidos.some((i) => i.id === itemPreSelecionado)) {
        setItemSelecionadoId(itemPreSelecionado);
      } else {
        setItemSelecionadoId(pacotesValidos[0].id);
      }
    } else {
      setItemSelecionadoId(null);
    }
  }

  // ============ ABRIR DETALHES ============
  const abrirDetalhes = async (at: Atendimento) => {
    setSelectedAtend(at);
    setStatusFormValue(at.status);
    setPacienteSelecionado(null);
    setItensPaciente([]);
    setItemSelecionadoId(null);
    setBuscaPaciente("");
    setTemProntuario(false);
    setProntuarioId(null);
    setSheetOpen(true);

    if (at.paciente_id) {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome, telefone")
        .eq("id", at.paciente_id)
        .maybeSingle();
      if (data) {
        setPacienteSelecionado(data);
        await carregarItensPaciente(data.id, at.paciente_pacote_id);
        const { data: prData } = await supabase
          .from("prontuarios")
          .select("id")
          .eq("paciente_id", data.id)
          .limit(1);
        if (prData && prData.length > 0) {
          setTemProntuario(true);
          setProntuarioId(prData[0].id);
        }
      }
    }
  };

  const [statusFormValue, setStatusFormValue] = useState("agendado");
    // 🔥 Entrar em modo edição
  function entrarModoEdicao() {
    if (!selectedAtend) return;
    const dtInicio = new Date(selectedAtend.data_inicio);
    const dtFim = selectedAtend.data_fim ? new Date(selectedAtend.data_fim) : new Date(dtInicio.getTime() + DURACAO_PADRAO * 60 * 1000);

    setEditForm({
      data: format(dtInicio, "yyyy-MM-dd"),
      hora_inicio: format(dtInicio, "HH:mm"),
      hora_fim: format(dtFim, "HH:mm"),
      profissional_id: selectedAtend.profissional_id || "",
      tipo_alteracao: "remarcacao",
    });
    setModoEdicao(true);
  }

    // 🔥 Salvar edição
  async function salvarEdicao() {
    if (!selectedAtend) return;
    if (!editForm.data || !editForm.hora_inicio || !editForm.hora_fim) {
      toast.error("Preencha data e horário");
      return;
    }

    const dtInicioOriginal = new Date(selectedAtend.data_inicio);
    const dtFimOriginal = selectedAtend.data_fim ? new Date(selectedAtend.data_fim) : new Date(dtInicioOriginal.getTime() + DURACAO_PADRAO * 60 * 1000);

    const novaData = new Date(`${editForm.data}T${editForm.hora_inicio}:00`);
    const novaDataFim = new Date(`${editForm.data}T${editForm.hora_fim}:00`);

    if (novaDataFim <= novaData) {
      toast.error("O fim deve ser depois do início");
      return;
    }

    const mudouDataHora = 
      novaData.getTime() !== dtInicioOriginal.getTime() ||
      novaDataFim.getTime() !== dtFimOriginal.getTime();

    const mudouProfissional = editForm.profissional_id !== selectedAtend.profissional_id;

    if (!mudouDataHora && !mudouProfissional) {
      toast.info("Nada foi alterado.");
      setModoEdicao(false);
      return;
    }

    setBusy(true);
    try {
      const updateData: any = {
        data_inicio: novaData.toISOString(),
        data_fim: novaDataFim.toISOString(),
        profissional_id: editForm.profissional_id,
      };

      // 🔥 Se mudou data/hora, registra tipo de alteração
      if (mudouDataHora) {
        updateData.tipo_alteracao = editForm.tipo_alteracao;
        
        // Se for cancelamento, também muda o status
        if (editForm.tipo_alteracao === "cancelamento") {
          const cancelarFuturos = confirm(`Deseja cancelar TODOS os eventos futuros deste paciente? (OK = Todos, Cancelar = Apenas este)`);
          
          if (cancelarFuturos) {
             await supabase.from("atendimentos")
               .update({ status: "cancelado" })
               .eq("paciente_id", selectedAtend.paciente_id)
               .eq("profissional_id", selectedAtend.profissional_id)
               .gte("data_inicio", selectedAtend.data_inicio);
             
             toast.success("Eventos futuros cancelados!");
             setModoEdicao(false);
             setSheetOpen(false);
             await carregar();
             return;
          } else {
             updateData.status = "cancelado";
          }
        }
      } // 🔥 ESTA CHAVE ESTAVA FALTANDO AQUI!

      const { error } = await supabase
        .from("atendimentos")
        .update(updateData)
        .eq("id", selectedAtend.id);
      
      if (error) throw error;

      // 🔥 Notifica mudança de horário
      if (mudouDataHora && selectedAtend.profissional_id) {
        const isCancel = editForm.tipo_alteracao === "cancelamento";
        await supabase.from("notificacoes").insert({
          profissional_id: selectedAtend.profissional_id,
          tipo: editForm.tipo_alteracao,
          titulo: isCancel ? "Sessão Cancelada" : "Sessão Remarcada",
          mensagem: `${selectedAtend.paciente?.nome || selectedAtend.nome_paciente_livre} · De ${format(new Date(selectedAtend.data_inicio), "dd/MM HH:mm")} para ${format(novaData, "dd/MM HH:mm")}`,
        });
      }

      toast.success("Atendimento atualizado!");
      setModoEdicao(false);
      setSheetOpen(false);
      await carregar();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setBusy(false);
    }
  }
  // ============ SELECIONAR PACIENTE (Sheet) ============
  const selecionarPacienteSheet = async (p: { id: string; nome: string; telefone: string | null }) => {
    setPacienteSelecionado(p);
    setBuscaPaciente("");
    setSugestoesPacientes([]);
    await carregarItensPaciente(p.id);
  };

  // ============ VINCULAR (Sheet) ============
  async function handleSalvarVinculacao() {
    if (!selectedAtend || !pacienteSelecionado) {
      toast.error("Paciente não selecionado.");
      return;
    }
    if (itensPaciente.length > 0 && !itemSelecionadoId) {
      toast.error("Selecione um pacote/serviço para consumir.");
      return;
    }

    setBusy(true);
    try {
      const updateData: any = { paciente_id: pacienteSelecionado.id };
      if (itemSelecionadoId) updateData.paciente_pacote_id = itemSelecionadoId;

      const { error } = await supabase
        .from("atendimentos")
        .update(updateData)
        .eq("id", selectedAtend.id);
      if (error) throw error;

      // Atualiza o estado local SEM FECHAR o Sheet
      const atualizado = {
        ...selectedAtend,
        paciente_id: pacienteSelecionado.id,
        paciente_pacote_id: itemSelecionadoId || null,
        paciente: {
          id: pacienteSelecionado.id,
          nome: pacienteSelecionado.nome,
          telefone: pacienteSelecionado.telefone,
          pronome_tratamento: null,
        },
      };
      setSelectedAtend(atualizado);
      toast.success("Vinculado! Pronto para check-in.");
      await carregar();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  // ============ CHECK-IN RÁPIDO ============
  async function handleCheckinRapido() {
    if (!selectedAtend) return;
    if (!selectedAtend.paciente_id || !selectedAtend.paciente_pacote_id) {
      toast.error("Vincule paciente e pacote primeiro.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("atendimentos")
        .update({ status: "realizado" })
        .eq("id", selectedAtend.id);
      if (error) throw error;
      toast.success("Check-in realizado! Sessão consumida e repasse gerado.");
      setSheetOpen(false);
      await carregar();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ============ MUDAR STATUS (select) ============
  async function handleSalvarStatus() {
    if (!selectedAtend) return;
    if (statusFormValue === "realizado" && (!selectedAtend.paciente_id || !selectedAtend.paciente_pacote_id)) {
      toast.error("Vincule o paciente e o pacote antes de realizar.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("atendimentos")
        .update({ status: statusFormValue })
        .eq("id", selectedAtend.id);
      if (error) throw error;
      toast.success("Status atualizado!");
      setSheetOpen(false);
      await carregar();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ============ APAGAR ============
    async function handleApagarAtendimento() {
    if (!selectedAtend || !isAdmin) return;
    const nome = selectedAtend.paciente?.nome || selectedAtend.nome_paciente_livre || "Sem nome";
    
    const apagarFuturos = confirm(
      `Apagar o atendimento de ${nome}?\n\n` +
      `Clique em OK para apagar APENAS ESTE evento.\n` +
      `Clique em Cancelar se quiser apagar TODOS os eventos futuros deste paciente.`
    );

    if (!apagarFuturos) {
      if (!confirm(`Tem certeza que deseja apagar TODOS os eventos futuros de ${nome}?`)) return;
      try {
        const { error } = await supabase.from("atendimentos")
          .delete()
          .eq("paciente_id", selectedAtend.paciente_id)
          .eq("profissional_id", selectedAtend.profissional_id)
          .gte("data_inicio", selectedAtend.data_inicio); 
        
        if (error) throw error;
        toast.success("Eventos futuros apagados!");
        setSheetOpen(false);
        await carregar();
      } catch (err: any) {
        toast.error("Erro: " + err.message);
      }
      return;
    }

    try {
      const { error } = await supabase.from("atendimentos").delete().eq("id", selectedAtend.id);
      if (error) throw error;
      toast.success("Atendimento apagado!");
      setSheetOpen(false);
      await carregar();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  }

  // ============ ABRIR MODAL WHATSAPP ============
  function abrirModalWhatsApp() {
    if (!selectedAtend) return;
    if (templates.length === 0) {
      toast.error("Nenhum template de mensagem cadastrado no CRM.");
      return;
    }
    setTemplateSelecionadoId(templates[0].id);
    setModalWhatsAppOpen(true);
  }

  // ============ PREVIEW MENSAGEM ============
  useEffect(() => {
    if (!templateSelecionadoId || !selectedAtend) {
      setMensagemPreview("");
      return;
    }
    const tpl = templates.find((t) => t.id === templateSelecionadoId);
    if (!tpl) return;

    const nomeCompleto = selectedAtend.paciente?.nome || selectedAtend.nome_paciente_livre || "";
    const msg = aplicarTemplate(tpl.conteudo, {
      paciente: nomeCompleto.split(" ")[0] || "",
      paciente_pronome: selectedAtend.paciente?.pronome_tratamento || "",
      data: format(new Date(selectedAtend.data_inicio), "dd/MM/yyyy", { locale: ptBR }),
      hora: format(new Date(selectedAtend.data_inicio), "HH:mm"),
      profissional: selectedAtend.profissional?.nome || "",
    });
    setMensagemPreview(msg);
  }, [templateSelecionadoId, selectedAtend, templates]);

  // ============ ENVIAR WHATSAPP ============
  async function enviarWhatsApp() {
    if (!selectedAtend || !templateSelecionadoId) return;

    const telefone =
      selectedAtend.paciente?.telefone ||
      selectedAtend.telefone_contato ||
      null;

    if (!telefone) {
      toast.error("Paciente sem telefone cadastrado.");
      return;
    }

    const tpl = templates.find((t) => t.id === templateSelecionadoId);
    if (!tpl) return;

    const preferencia = getPreferenciaWhatsApp();
    const ok = abrirWhatsapp(telefone, mensagemPreview, preferencia);
    if (!ok) {
      toast.error("Erro ao abrir WhatsApp.");
      return;
    }

    // Registrar no histórico do CRM
    if (selectedAtend.paciente_id) {
      await supabase.from("crm_envios").insert({
        paciente_id: selectedAtend.paciente_id,
        tipo: tpl.tipo,
        mensagem: mensagemPreview,
      });
    }

    toast.success("WhatsApp aberto!");
    setModalWhatsAppOpen(false);
  }
  // ============ PREVIEW DA RECORRÊNCIA ============
  useEffect(() => {
    if (!recorrenciaBase) {
      setPreviewDatas([]);
      return;
    }
    const datas = calcularDatasRecorrencia(
      recorrenciaBase.data_inicio,
      formRecorrencia.frequencia,
      formRecorrencia.diasSemana,
      formRecorrencia.numeroSessoes,
      formRecorrencia.pularFinsDeSemana
    );
    setPreviewDatas(datas);
  }, [recorrenciaBase, formRecorrencia]);

  // ============ CRIAR RECORRÊNCIA (bulk insert) ============
    async function criarRecorrencia(pularBloqueadas = false, ignorarConflito = false) {
    if (!recorrenciaBase) return;
    if (previewDatas.length === 0) {
      toast.error("Nenhuma data válida para criar");
      return;
    }

    const [hI, mI] = recorrenciaBase.hora_inicio.split(":").map(Number);
    const [hF, mF] = recorrenciaBase.hora_fim.split(":").map(Number);

    // 🔥 Verifica conflitos
    let datasFinais = [...previewDatas];

    if (!ignorarConflito) {
      const conflitos = previewDatas.filter((d) => {
        const dtInicio = new Date(d);
        dtInicio.setHours(hI, mI, 0, 0);
        const dtFim = new Date(d);
        dtFim.setHours(hF, mF, 0, 0);
        return checarConflito(dtInicio, dtFim, recorrenciaBase.profissional_id) !== null;
      });

      if (conflitos.length > 0) {
        setDatasConflitoRec(conflitos);
        setModalConflitoRecOpen(true);
        return; // Pausa a criação para o usuário decidir
      }
    }

    if (pularBloqueadas) {
      datasFinais = previewDatas.filter((d) => {
        const dtInicio = new Date(d);
        dtInicio.setHours(hI, mI, 0, 0);
        const dtFim = new Date(d);
        dtFim.setHours(hF, mF, 0, 0);
        return checarConflito(dtInicio, dtFim, recorrenciaBase.profissional_id) === null;
      });
      if (datasFinais.length === 0) {
        toast.error("Todas as datas caem em bloqueios.");
        setModalConflitoRecOpen(false);
        return;
      }
    }

        setCriandoRecorrencia(true);
    try {
      const atendimentosParaCriar = datasFinais.map((d) => {
        const dtInicio = new Date(d);
        dtInicio.setHours(hI, mI, 0, 0);
        const dtFim = new Date(d);
        dtFim.setHours(hF, mF, 0, 0);

        return {
          paciente_id: recorrenciaBase.paciente_id,
          profissional_id: recorrenciaBase.profissional_id,
          data_inicio: dtInicio.toISOString(),
          data_fim: dtFim.toISOString(),
          status: "agendado",
          tipo: recorrenciaBase.paciente_pacote_id ? "Plano" : "Particular",
          paciente_pacote_id: recorrenciaBase.paciente_pacote_id || null,
          observacoes: recorrenciaBase.observacoes || null,
        };
      });

      const { error } = await supabase.from("atendimentos").insert(atendimentosParaCriar);
      if (error) throw error;

      toast.success(`${atendimentosParaCriar.length} atendimentos criados!`);
      setModalRecorrenciaOpen(false);
      setRecorrenciaBase(null);
      await carregar();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setCriandoRecorrencia(false);
    }
  }
  // ============ VERIFICAR CONFLITO ============
  function checarConflito(inicio: Date, fim: Date, profId: string | null): Bloqueio | null {
    return bloqueios.find((b) => {
      // Se o bloqueio é de um profissional específico e não é o mesmo do atendimento, ignora
      if (b.profissional_id !== null && b.profissional_id !== profId) return false;
      
      const bInicio = new Date(b.data_inicio);
      const bFim = new Date(b.data_fim);
      
      // Verifica se há sobreposição de horários
      return inicio < bFim && fim > bInicio;
    }) || null;
  }

    // ============ BLOQUEIOS ============
  function abrirModalBloqueio(data?: Date, profissionalId?: string) {
    const hoje = data ? format(data, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    setFormBloqueio({
      tipo: "almoco",
      profissional_id: profissionalId || "",
      data_inicio: hoje,
      hora_inicio: "12:00",
      data_fim: hoje,
      hora_fim: "13:00",
      repetir: "nunca",
      repetir_ate: "",
      observacoes: "",
    });
    setModalBloqueioOpen(true);
  }

  async function criarBloqueios() {
    if (!formBloqueio.data_inicio || !formBloqueio.data_fim) {
      toast.error("Preencha as datas");
      return;
    }

    const dtInicio = new Date(`${formBloqueio.data_inicio}T${formBloqueio.hora_inicio}:00`);
    const dtFim = new Date(`${formBloqueio.data_fim}T${formBloqueio.hora_fim}:00`);

    if (dtFim <= dtInicio) {
      toast.error("Fim deve ser depois do início");
      return;
    }

    setCriandoBloqueio(true);
    try {
      const bloqueiosParaCriar: any[] = [];

      if (formBloqueio.repetir === "nunca") {
        bloqueiosParaCriar.push({
          profissional_id: formBloqueio.profissional_id || null,
          tipo: formBloqueio.tipo,
          data_inicio: dtInicio.toISOString(),
          data_fim: dtFim.toISOString(),
          observacoes: formBloqueio.observacoes.trim() || null,
        });
      } else {
        const limiteRecorrencia = formBloqueio.repetir_ate
          ? new Date(`${formBloqueio.repetir_ate}T23:59:59`)
          : new Date(dtInicio.getTime() + 90 * 24 * 60 * 60 * 1000);

        const duracaoMs = dtFim.getTime() - dtInicio.getTime();
        let cursor = new Date(dtInicio);
        let safety = 0;

        while (cursor <= limiteRecorrencia && safety < 200) {
          safety++;

          let adicionar = false;
          if (formBloqueio.repetir === "diariamente") adicionar = true;
          if (formBloqueio.repetir === "semanalmente" && cursor.getDay() === dtInicio.getDay()) adicionar = true;
          if (formBloqueio.repetir === "dias_uteis" && cursor.getDay() >= 1 && cursor.getDay() <= 5) adicionar = true;

          if (adicionar) {
            bloqueiosParaCriar.push({
              profissional_id: formBloqueio.profissional_id || null,
              tipo: formBloqueio.tipo,
              data_inicio: cursor.toISOString(),
              data_fim: new Date(cursor.getTime() + duracaoMs).toISOString(),
              observacoes: formBloqueio.observacoes.trim() || null,
            });
          }

          cursor = addDays(cursor, 1);
        }
      }

      if (bloqueiosParaCriar.length === 0) {
        toast.error("Nenhum bloqueio gerado");
        setCriandoBloqueio(false);
        return;
      }

            const { error } = await supabase.from("bloqueios_agenda").insert(bloqueiosParaCriar);
      if (error) throw error;

      // 🔥 NOVO: Dispara as notificações se o checkbox estiver marcado
      if (formBloqueio.notificar) {
        const tipoLabel = TIPOS_BLOQUEIO.find((t) => t.v === formBloqueio.tipo)?.label || "Bloqueio";
        const msg = `${format(dtInicio, "dd/MM 'às' HH:mm")} até ${format(dtFim, "dd/MM 'às' HH:mm")}`;
        
        // Descobre quem deve receber a notificação
        let profsNotificar: string[] = [];
        if (formBloqueio.profissional_id) {
          // Se for bloqueio de uma profissional específica, avisa só ela
          profsNotificar = [formBloqueio.profissional_id];
        } else {
          // Se for "Clínica Toda" (profissional_id vazio), avisa TODOS
          profsNotificar = profissionais.map((p) => p.id);
        }

        // Cria o pacote de notificações
        const notificacoesParaCriar = profsNotificar.map((pid) => ({
          profissional_id: pid,
          tipo: "bloqueio",
          titulo: `Novo Bloqueio: ${tipoLabel.replace(/[^a-zA-ZÀ-ÿ ]/g, "").trim()}`,
          mensagem: msg,
        }));

        // Salva no banco (o sino vai piscar na tela delas)
        await supabase.from("notificacoes").insert(notificacoesParaCriar);
      }

      toast.success(`${bloqueiosParaCriar.length} bloqueio(s) criado(s)!`);      setModalBloqueioOpen(false);
      await carregar();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setCriandoBloqueio(false);
    }
  }

  async function handleApagarBloqueio(b: Bloqueio) {
    const tipoInfo = TIPOS_BLOQUEIO.find((t) => t.v === b.tipo);
    if (!confirm(`Apagar bloqueio "${tipoInfo?.label || b.tipo}"?`)) return;
    try {
      const { error } = await supabase.from("bloqueios_agenda").delete().eq("id", b.id);
      if (error) throw error;
      toast.success("Bloqueio apagado");
      await carregar();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  }

  // ============ CRIAR ATENDIMENTO ============
  const abrirCriar = (data?: Date, horaInicio?: string, profissionalId?: string) => {
    const dia = data ? format(data, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    const hora = horaInicio || "14:00";

    const [h, m] = hora.split(":").map(Number);
    const fim = new Date();
    fim.setHours(h, m + DURACAO_PADRAO, 0, 0);
    const horaFim = format(fim, "HH:mm");

    const profId = profissionalId || meuProfId || (isAdmin || isSecretaria ? profissionais[0]?.id || "" : meuProfId || "");

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
    setBuscaPacienteCriar("");
    setSugestoesPacientesCriar([]);
    setPacoteSugerido(null);
    setPacotesDisponiveis([]);
    setCriandoPaciente(false);
    setNovoPacienteNome("");
    setNovoPacienteTelefone("");
        setModalCriarOpen(true);

    // 🔥 Carregar planos e pacotes/serviços
    supabase.from("planos_saude").select("id, nome").eq("ativo", true).then(({ data }) => setListaPlanos(data || []));
    Promise.all([
      supabase.from("pacotes").select("id, nome, numero_sessoes, preco_total").eq("ativo", true),
      supabase.from("servicos").select("id, nome, preco").eq("ativo", true),
    ]).then(([{ data: pacotes }, { data: servicos }]) => {
      const combined = [
        ...(pacotes || []).map((p) => ({ ...p, tipo_item: "pacote" })),
        ...(servicos || []).map((s) => ({ ...s, tipo_item: "servico" })),
      ];
      setListaPacotesServicos(combined);
    });
  };

        async function selecionarPacienteCriar(p: { id: string; nome: string; telefone: string | null }) {
    setFormCriar((prev) => ({ ...prev, paciente_id: p.id, paciente_nome: p.nome }));
    setBuscaPacienteCriar("");
    setSugestoesPacientesCriar([]);

    const { data: pacotes } = await supabase
      .from("paciente_pacotes")
      .select(`
        id, sessoes_restantes, sessoes_totais, sessoes_realizadas,
        autorizacao:autorizacoes(plano),
        pacote:pacotes(nome),
        servico:servicos(nome)
      `)
      .eq("paciente_id", p.id)
      .order("created_at", { ascending: false });

    // 🔥 Filtra apenas os que realmente têm saldo
    const pacotesValidos = (pacotes || []).filter(pac => {
      const restantesReais = pac.sessoes_totais - pac.sessoes_realizadas;
      return restantesReais > 0;
    });

    if (pacotesValidos.length > 0) {
      const pac = pacotesValidos[0] as any;
      const nome = pac.autorizacao?.plano
        ? `Plano ${pac.autorizacao.plano}`
        : pac.pacote?.nome || pac.servico?.nome || "Item";
        
      setPacoteSugerido({ id: pac.id, label: `${nome} (${pac.sessoes_totais - pac.sessoes_realizadas} rest.)` });
      setFormCriar((prev) => ({ ...prev, paciente_pacote_id: pac.id }));
      
      setPacotesDisponiveis(pacotesValidos); 
    } else {
      setPacoteSugerido(null);
      setPacotesDisponiveis([]);
    }
  }
          
  // 🔥 Criar pacote rápido para o paciente selecionado
  async function criarPacoteRapido() {
    if (!formCriar.paciente_id) {
      toast.error("Selecione um paciente primeiro");
      return;
    }
    if (!novoPacoteForm.pacote_servico_id) {
      toast.error("Selecione um pacote ou serviço");
      return;
    }
    if (novoPacoteForm.tipo === "plano") {
      if (!novoPacoteForm.plano_id) return toast.error("Selecione o plano");
      if (!novoPacoteForm.numero_guia.trim()) return toast.error("Informe o número da guia");
    }

    setCriandoPacote(true);
    try {
      const item = listaPacotesServicos.find((x) => x.id === novoPacoteForm.pacote_servico_id);
      if (!item) throw new Error("Item não encontrado");

      const sessoesTotais = item.tipo_item === "pacote" ? item.numero_sessoes : 1;
      const preco = novoPacoteForm.preco ? parseFloat(novoPacoteForm.preco) : (item.tipo_item === "pacote" ? item.preco_total : item.preco || 0);

      let autorizacaoId: string | null = null;

      if (novoPacoteForm.tipo === "plano") {
        const planoNome = listaPlanos.find((p) => p.id === novoPacoteForm.plano_id)?.nome;
        const { data: aut, error: errAut } = await supabase
          .from("autorizacoes")
          .insert({
            paciente_id: formCriar.paciente_id,
            plano: planoNome,
            numero_guia: novoPacoteForm.numero_guia.trim(),
            sessoes_autorizadas: sessoesTotais,
            sessoes_realizadas: 0,
            status: "ativa",
          })
          .select("id")
          .single();
        if (errAut) throw errAut;
        autorizacaoId = aut.id;
      }

      const { data: novoPacote, error: errPac } = await supabase
        .from("paciente_pacotes")
        .insert({
          paciente_id: formCriar.paciente_id,
          autorizacao_id: autorizacaoId,
          pacote_id: item.tipo_item === "pacote" ? item.id : null,
          servico_id: item.tipo_item === "servico" ? item.id : null,
          sessoes_totais: sessoesTotais,
          sessoes_restantes: sessoesTotais,
          sessoes_realizadas: 0,
          preco_pago: preco,
          status_pagamento: "pendente",
        })
        .select("id")
        .single();
      if (errPac) throw errPac;

      toast.success("Pacote criado e vinculado!");
      setFormCriar((prev) => ({ ...prev, paciente_pacote_id: novoPacote.id }));
      setPacoteSugerido({
        id: novoPacote.id,
        label: `${item.tipo_item === "pacote" ? item.nome : item.nome} (${sessoesTotais} rest.)`,
      });
      setMostrarCriarPacote(false);
      setNovoPacoteForm({ tipo: "particular", plano_id: "", numero_guia: "", pacote_servico_id: "", preco: "" });
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setCriandoPacote(false);
    }
  }

  async function criarPacienteRapido() {
    if (!novoPacienteNome.trim()) {
      toast.error("Informe o nome");
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
      await selecionarPacienteCriar(data);
      setCriandoPaciente(false);
      setNovoPacienteNome("");
      setNovoPacienteTelefone("");
    } catch (err: any) {
      toast.error("Erro: " + err.message);
      setCriandoPaciente(false);
    }
  }

        async function salvarAtendimento(ignorarConflito = false) {
    if (!formCriar.paciente_id) return toast.error("Selecione o paciente");
    if (!formCriar.profissional_id) return toast.error("Selecione o profissional");
    if (!formCriar.data || !formCriar.hora_inicio || !formCriar.hora_fim) return toast.error("Preencha data e horário");

    const dataInicio = new Date(`${formCriar.data}T${formCriar.hora_inicio}:00`);
    const dataFim = new Date(`${formCriar.data}T${formCriar.hora_fim}:00`);
    if (dataFim <= dataInicio) return toast.error("Fim deve ser depois do início");

    if (!ignorarConflito) {
      const conflito = checarConflito(dataInicio, dataFim, formCriar.profissional_id);
      if (conflito) {
        setConflitoInfo(conflito);
        setModalConflitoOpen(true);
        return;
      }
    }

    // 🔥 Se tem pacote, verifica se precisa de recorrência ANTES de salvar o 1º
    if (formCriar.paciente_pacote_id) {
      const { data: pacInfo } = await supabase
        .from("paciente_pacotes")
        .select("sessoes_restantes, sessoes_totais, sessoes_realizadas")
        .eq("id", formCriar.paciente_pacote_id)
        .maybeSingle();

      const restantes = (pacInfo?.sessoes_totais || 0) - (pacInfo?.sessoes_realizadas || 0);

      if (restantes > 1) {
        const diaBase = new Date(`${formCriar.data}T${formCriar.hora_inicio}:00`);
        setRecorrenciaBase({
          paciente_id: formCriar.paciente_id,
          paciente_nome: formCriar.paciente_nome,
          profissional_id: formCriar.profissional_id,
          data_inicio: diaBase,
          hora_inicio: formCriar.hora_inicio,
          hora_fim: formCriar.hora_fim,
          paciente_pacote_id: formCriar.paciente_pacote_id,
          sessoes_restantes: restantes,
          observacoes: formCriar.observacoes.trim(),
        });
        setFormRecorrencia({
          frequencia: "semanal",
          numeroSessoes: restantes,
          diasSemana: [diaBase.getDay()],
          pularFinsDeSemana: true,
        });
        setModalCriarOpen(false); 
        setModalRecorrenciaOpen(true); 
        return; 
      }
    }

    await executarInsertAtendimento();
  }

  async function executarInsertAtendimento() {
    setCriando(true);
    try {
      const dataInicio = new Date(`${formCriar.data}T${formCriar.hora_inicio}:00`);
      const dataFim = new Date(`${formCriar.data}T${formCriar.hora_fim}:00`);

      const { data: pacData } = formCriar.paciente_pacote_id
        ? await supabase.from("paciente_pacotes").select("autorizacao_id").eq("id", formCriar.paciente_pacote_id).maybeSingle()
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

      if (formCriar.profissional_id) {
        await supabase.from("notificacoes").insert({
          profissional_id: formCriar.profissional_id,
          tipo: "novo_agendamento",
          titulo: "Novo Agendamento",
          mensagem: `${formCriar.paciente_nome} · ${format(new Date(dataInicio), "dd/MM")} às ${formCriar.hora_inicio}`,
        });
      }

      toast.success("Atendimento criado!");
      setModalCriarOpen(false);
      setModalRecorrenciaOpen(false);
      await carregar();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setCriando(false);
    }
  }
  // ============ HELPERS ============
  const prontoParaCheckin =
    !!selectedAtend?.paciente_id && !!selectedAtend?.paciente_pacote_id;

  const podeEnviarWhats =
    !!selectedAtend &&
    selectedAtend.status === "agendado" &&
    (selectedAtend.paciente?.telefone || selectedAtend.telefone_contato);

  if (loading && atendimentos.length === 0) {
    return <div className="p-10 text-center text-muted-foreground animate-pulse">Carregando agenda...</div>;
  }

  return (
    <div className="space-y-3 p-2 max-w-7xl mx-auto pb-24">
            {/* HEADER RESPONSIVO */}
      <div className="bg-white p-3 rounded-xl border shadow-sm flex flex-col gap-3 sticky top-0 z-40">
        {/* Linha 1: Data e Botões de Navegação */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={anterior}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={() => setCurrentDate(new Date())} className="text-xs font-semibold h-8 px-3">Hoje</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={proximo}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <h2 className="text-sm font-bold capitalize text-slate-700 w-full sm:w-auto mt-1 sm:mt-0">
            {view === "month"
              ? format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })
              : format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </h2>
        </div>

        {/* Linha 2: Visualizações e Ações */}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
            {(["day", "week", "month", "profissionais"] as const).map((v) => (
              <Button key={v} variant={view === v ? "default" : "ghost"} size="sm" onClick={() => setView(v)} className="text-xs capitalize font-semibold h-7 flex-1 sm:flex-none">
                {v === "day" ? "Dia" : v === "week" ? "Semana" : v === "month" ? "Mês" : "Profis."}
              </Button>
            ))}
          </div>

          <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
            {/* 🔥 NOVO: BUSCA DE PACIENTE (Ocupa 100% no celular) */}
            <div className="relative flex-1 sm:flex-none sm:w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar paciente..."
                value={filtroPaciente}
                onChange={(e) => setFiltroPaciente(e.target.value)}
                className="h-8 text-xs pl-8 w-full bg-slate-50 border-slate-200"
              />
            </div>

            <div className="flex gap-2 flex-1 sm:flex-none">
              {/* 🔥 SINO DE NOTIFICAÇÕES */}
              {meuProfId && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 relative bg-white shrink-0">
                      <Bell className="w-4 h-4" />
                      {naoLidas > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                          {naoLidas}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="end">
                    <div className="flex items-center justify-between p-3 border-b bg-slate-50">
                      <h3 className="font-bold text-sm">Notificações</h3>
                      {naoLidas > 0 && (
                        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={marcarTodasComoLidas}>
                          <CheckCheck className="w-3 h-3 mr-1" /> Marcar todas
                        </Button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notificacoes.length === 0 ? (
                        <p className="text-xs text-center text-muted-foreground p-4">Nenhuma notificação.</p>
                      ) : (
                        notificacoes.map((n) => (
                          <div key={n.id} className={`p-3 border-b last:border-0 ${!n.lida ? "bg-blue-50/50" : ""}`}>
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1">
                                <p className="text-sm font-bold text-slate-800">{n.titulo}</p>
                                {n.mensagem && <p className="text-xs text-slate-600 mt-0.5">{n.mensagem}</p>}
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  {format(new Date(n.created_at), "dd/MM 'às' HH:mm")}
                                </p>
                              </div>
                              {!n.lida && (
                                <button onClick={() => marcarComoLida(n.id)} className="text-blue-500 hover:bg-blue-100 p-1 rounded">
                                  <CheckCheck className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              <Button size="sm" onClick={() => abrirCriar()} className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs font-bold flex-1 sm:flex-none">
                <Plus className="w-3.5 h-3.5 mr-1" /> Novo
              </Button>
              <Button size="sm" onClick={() => abrirModalBloqueio()} className="bg-slate-600 hover:bg-slate-700 h-8 text-xs font-bold flex-1 sm:flex-none">
                <Lock className="w-3.5 h-3.5 mr-1" /> Bloquear
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* TOGGLE */}
      {view === "day" && (
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border shadow-sm">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Modo:</span>
          <Button size="sm" variant={modoDia === "unica" ? "default" : "ghost"} onClick={() => setModoDia("unica")} className="h-7 text-xs">1 Coluna</Button>
          <Button size="sm" variant={modoDia === "porProfissional" ? "default" : "ghost"} onClick={() => setModoDia("porProfissional")} className="h-7 text-xs">Por Profissional</Button>
          <Badge variant="outline" className="ml-auto text-[10px] h-6">{atendimentosDoDia.length} atend.</Badge>
        </div>
      )}

            {/* VISÃO DIA — 1 COLUNA */}
      {view === "day" && modoDia === "unica" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="relative" style={{ height: `${(HORA_FIM - HORA_INICIO) * ALTURA_HORA + 40}px` }}>
            {Array.from({ length: HORA_FIM - HORA_INICIO + 1 }, (_, i) => (
              <div key={i} className="absolute left-0 right-0 flex items-start pointer-events-none" style={{ top: `${i * ALTURA_HORA}px` }}>
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
              {/* 🔥 Bloqueios — renderizam atrás dos eventos */}
              {bloqueios
                .filter((b) => isSameDay(new Date(b.data_inicio), currentDate))
                .map((b) => {
                  const ini = new Date(b.data_inicio);
                  const fim = new Date(b.data_fim);
                  const minIni = (ini.getHours() - HORA_INICIO) * 60 + ini.getMinutes();
                  const minFim = (fim.getHours() - HORA_INICIO) * 60 + fim.getMinutes();
                  const top = Math.max(0, (minIni / 60) * ALTURA_HORA);
                  const height = Math.max(((minFim - minIni) / 60) * ALTURA_HORA, 26);
                  return (
                    <BlocoBloqueio
                      key={b.id}
                      bloqueio={b}
                      top={top}
                      height={height}
                      leftPercent={0}
                      widthPercent={100}
                      onClick={() => handleApagarBloqueio(b)}
                    />
                  );
                })}

              {atendimentosDoDia.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground pointer-events-none">
                  Nenhum atendimento. Clique em um horário para criar.
                </div>
              ) : (
                calcularLayout(atendimentosDoDia).map(({ at, top, height, leftPercent, widthPercent }) => (
                  <BlocoEvento key={at.id} at={at} onClick={() => abrirDetalhes(at)} top={top} height={height} leftPercent={leftPercent} widthPercent={widthPercent} />
                ))
              )}

              {isToday(currentDate) && agora.getHours() >= HORA_INICIO && agora.getHours() <= HORA_FIM && (
                <div className="absolute left-0 right-0 border-t-2 border-red-500 z-10 pointer-events-none" style={{ top: `${((agora.getHours() - HORA_INICIO) * 60 + agora.getMinutes()) / 60 * ALTURA_HORA}px` }}>
                  <div className="absolute -left-1.5 -top-1.5 w-3 h-3 bg-red-500 rounded-full" />
                </div>
              )}
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
                <div className="relative" style={{ height: `${(HORA_FIM - HORA_INICIO) * ALTURA_HORA}px` }}>
                  {Array.from({ length: HORA_FIM - HORA_INICIO }, (_, i) => (
                    <div key={i} className="absolute left-0 right-0 text-[10px] text-muted-foreground text-right pr-2 font-medium" style={{ top: `${i * ALTURA_HORA - 6}px` }}>
                      {String(HORA_INICIO + i).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
              </div>

              {profissionaisVisiveis.map((prof) => {
                const eventosProf = atendimentosDoDia.filter((a) => a.profissional_id === prof.id);
                const cor = prof.cor_agenda || "#3b82f6";

                return (
                  <div key={prof.id} className="flex-1 min-w-[180px] border-r last:border-r-0">
                    <div className="h-10 border-b flex items-center justify-center gap-1.5" style={{ backgroundColor: cor + "15" }}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cor }} />
                      <span className="text-xs font-bold" style={{ color: cor }}>{prof.nome.split(" ")[0]}</span>
                      {eventosProf.length > 0 && <span className="text-[9px] text-slate-500">({eventosProf.length})</span>}
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
                        <div key={i} className="absolute left-0 right-0 border-t border-slate-100 pointer-events-none" style={{ top: `${i * ALTURA_HORA}px` }} />
                      ))}

                      {calcularLayout(eventosProf).map(({ at, top, height, leftPercent, widthPercent }) => (
                        <BlocoEvento key={at.id} at={at} onClick={() => abrirDetalhes(at)} top={top} height={height} leftPercent={leftPercent} widthPercent={widthPercent} />
                      ))}

                      {isToday(currentDate) && agora.getHours() >= HORA_INICIO && agora.getHours() <= HORA_FIM && (
                        <div className="absolute left-0 right-0 border-t-2 border-red-500 z-10 pointer-events-none" style={{ top: `${((agora.getHours() - HORA_INICIO) * 60 + agora.getMinutes()) / 60 * ALTURA_HORA}px` }} />
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
                start: startOfWeek(currentDate, { weekStartsOn: 0 }),
                end: endOfWeek(currentDate, { weekStartsOn: 0 }),
              }).map((dia) => {
                const evtsDia = atendimentos.filter((a) => isSameDay(new Date(a.data_inicio), dia));
                const destacado = isToday(dia);
                return (
                  <div key={dia.toISOString()} className="border-r last:border-r-0">
                    <div className={`h-12 border-b p-2 text-center ${destacado ? "bg-red-50" : "bg-slate-50"}`}>
                      <div className="text-[10px] uppercase text-muted-foreground font-semibold">{format(dia, "EEE", { locale: ptBR })}</div>
                      <div className={`text-sm font-bold ${destacado ? "text-red-600" : "text-slate-700"}`}>{format(dia, "dd")}</div>
                    </div>
                    <div className="p-1.5 space-y-1 min-h-[400px] bg-white">
                      {evtsDia.length === 0 ? (
                        <div className="text-[10px] text-muted-foreground text-center pt-4">—</div>
                      ) : (
                        evtsDia.map((at) => {
                          const cor = at.profissional?.cor_agenda || "#3b82f6";
                          return (
                            <button key={at.id} onClick={() => abrirDetalhes(at)} className="w-full text-left rounded px-1.5 py-1 hover:shadow-sm transition-all truncate" style={{ backgroundColor: cor + "20", borderLeft: `3px solid ${cor}` }}>
                              <div className="text-[10px] font-bold text-slate-800 truncate">{format(new Date(at.data_inicio), "HH:mm")}</div>
                              <div className="text-[10px] text-slate-600 truncate">{at.paciente?.nome?.split(" ")[0] || at.nome_paciente_livre?.split(" ")[0] || "—"}</div>
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
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (<div key={i}>{d}</div>))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {eachDayOfInterval({
              start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 }),
              end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 }),
            }).map((dia, i) => {
              const evts = atendimentos.filter((a) => isSameDay(new Date(a.data_inicio), dia));
              const destacado = isToday(dia);
              const mesmoMes = isSameMonth(dia, currentDate);
              return (
                <button key={i} onClick={() => { setCurrentDate(dia); setView("day"); }} className={`min-h-[80px] p-1.5 rounded-lg border text-left hover:bg-blue-50 transition-all ${!mesmoMes ? "opacity-30" : ""} ${destacado ? "ring-2 ring-red-300 bg-red-50/50" : "bg-slate-50/30"}`}>
                  <div className={`text-xs font-bold ${destacado ? "text-red-600" : "text-slate-600"}`}>{format(dia, "d")}</div>
                  {evts.length > 0 && mesmoMes && (<div className="text-[10px] font-bold text-blue-600 mt-1">{evts.length} atend.</div>)}
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
                <div className="px-3 py-2 border-b flex items-center gap-2" style={{ backgroundColor: cor + "15" }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cor }} />
                  <span className="font-bold text-sm" style={{ color: cor }}>{prof.nome}</span>
                  <Badge variant="outline" className="ml-auto text-[10px] h-5">{evtsProf.length} atend.</Badge>
                </div>
                <div className="p-3">
                  {evtsProf.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic text-center py-3">Sem atendimentos neste dia.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {evtsProf.map((at) => (
                        <button key={at.id} onClick={() => abrirDetalhes(at)} className="text-left p-2 rounded-lg border hover:shadow-md transition-all" style={{ borderLeft: `3px solid ${cor}` }}>
                          <div className="text-[11px] font-bold text-slate-800">{format(new Date(at.data_inicio), "HH:mm")}</div>
                          <div className="text-[11px] text-slate-600 truncate">{at.paciente?.nome || at.nome_paciente_livre || "—"}</div>
                          <div className="text-[9px] text-muted-foreground mt-0.5 uppercase">{at.status}</div>
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
            <SheetTitle className="text-lg font-bold text-slate-800">Gerenciar Atendimento</SheetTitle>
          </SheetHeader>

          {selectedAtend && (
            <>
                            {/* Dados do evento — MODO VISUALIZAÇÃO */}
              {!modoEdicao && (
                <div className="bg-slate-50 p-3 rounded-xl border space-y-1 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {selectedAtend.paciente_id && selectedAtend.paciente?.nome ? (
                        <a
                          href={`/pacientes/${selectedAtend.paciente_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1.5"
                        >
                          {selectedAtend.paciente.nome}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <p className="font-bold text-sm text-slate-700">{selectedAtend.nome_paciente_livre || "Sem identificação"}</p>
                      )}
                      <p className="text-muted-foreground mt-1">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {format(new Date(selectedAtend.data_inicio), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                      </p>
                      <p className="text-muted-foreground uppercase font-semibold text-[10px] tracking-wide text-blue-600 mt-1">
                        Profissional: {selectedAtend.profissional?.nome || "Não definido"}
                      </p>
                      {selectedAtend.tipo_alteracao && (
                        <Badge variant="outline" className="text-[9px] mt-1">
                          🔄 {selectedAtend.tipo_alteracao}
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 shrink-0"
                      onClick={entrarModoEdicao}
                    >
                      ✏️ Editar
                    </Button>
                  </div>
                </div>
              )}

              {/* Dados do evento — MODO EDIÇÃO */}
              {modoEdicao && (
                <div className="bg-blue-50/40 p-3 rounded-xl border border-blue-200 space-y-3">
                  <div className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center justify-between">
                    <span>✏️ Editando atendimento</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => setModoEdicao(false)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Paciente (read-only no modo edição) */}
                  <div>
                    <Label className="text-[10px] uppercase text-slate-500 font-bold">Paciente</Label>
                    <div className="text-sm font-medium text-slate-800 mt-0.5">
                      {selectedAtend.paciente?.nome || selectedAtend.nome_paciente_livre || "—"}
                    </div>
                    <p className="text-[10px] text-slate-500 italic mt-0.5">
                      Para trocar o paciente, use a busca na seção abaixo.
                    </p>
                  </div>

                  {/* Data */}
                  <div>
                    <Label className="text-[10px] uppercase text-slate-500 font-bold">Data</Label>
                    <Input
                      type="date"
                      value={editForm.data}
                      onChange={(e) => setEditForm({ ...editForm, data: e.target.value })}
                      className="h-9 text-sm mt-1"
                    />
                  </div>

                  {/* Horários */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase text-slate-500 font-bold">Início</Label>
                      <Input
                        type="time"
                        value={editForm.hora_inicio}
                        onChange={(e) => setEditForm({ ...editForm, hora_inicio: e.target.value })}
                        className="h-9 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-slate-500 font-bold">Fim</Label>
                      <Input
                        type="time"
                        value={editForm.hora_fim}
                        onChange={(e) => setEditForm({ ...editForm, hora_fim: e.target.value })}
                        className="h-9 text-sm mt-1"
                      />
                    </div>
                  </div>

                  {/* Profissional */}
                  <div>
                    <Label className="text-[10px] uppercase text-slate-500 font-bold">Profissional</Label>
                    <Select value={editForm.profissional_id} onValueChange={(v) => setEditForm({ ...editForm, profissional_id: v })}>
                      <SelectTrigger className="h-9 text-sm mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {profissionais.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.cor_agenda || "#3b82f6" }} />
                              <span>{p.nome}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tipo de alteração (só se data ou hora mudou) */}
                  {(() => {
                    const dtInicioOriginal = new Date(selectedAtend.data_inicio);
                    const dtFimOriginal = selectedAtend.data_fim ? new Date(selectedAtend.data_fim) : new Date(dtInicioOriginal.getTime() + DURACAO_PADRAO * 60 * 1000);
                    const novaData = new Date(`${editForm.data}T${editForm.hora_inicio}:00`);
                    const novaDataFim = new Date(`${editForm.data}T${editForm.hora_fim}:00`);
                    const mudouDataHora = 
                      novaData.getTime() !== dtInicioOriginal.getTime() ||
                      novaDataFim.getTime() !== dtFimOriginal.getTime();

                    if (!mudouDataHora) return null;

                    return (
                      <div className="bg-white border rounded-lg p-3 space-y-2">
                        <Label className="text-[10px] uppercase text-slate-500 font-bold">
                          Tipo de alteração *
                        </Label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditForm({ ...editForm, tipo_alteracao: "remarcacao" })}
                            className={`flex-1 h-9 text-xs rounded-lg border-2 font-medium transition-all ${
                              editForm.tipo_alteracao === "remarcacao"
                                ? "border-amber-400 bg-amber-50 text-amber-700"
                                : "border-slate-200 text-slate-500 hover:border-slate-300"
                            }`}
                          >
                            🔄 Remarcação
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditForm({ ...editForm, tipo_alteracao: "cancelamento" })}
                            className={`flex-1 h-9 text-xs rounded-lg border-2 font-medium transition-all ${
                              editForm.tipo_alteracao === "cancelamento"
                                ? "border-red-400 bg-red-50 text-red-700"
                                : "border-slate-200 text-slate-500 hover:border-slate-300"
                            }`}
                          >
                            ❌ Cancelamento
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 italic">
                          {editForm.tipo_alteracao === "cancelamento"
                            ? "⚠️ O status será alterado para Cancelado."
                            : "A data/hora será atualizada."}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Botões */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      className="flex-1 h-10 text-xs"
                      onClick={() => setModoEdicao(false)}
                      disabled={busy}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1 h-10 text-xs bg-blue-600 hover:bg-blue-700 font-bold"
                      onClick={salvarEdicao}
                      disabled={busy}
                    >
                      {busy ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                  </div>
                </div>
              )}
              {/* Status de vinculação */}
              <div className="flex flex-col gap-1.5 bg-slate-50 p-3 rounded-xl border text-xs">
                <div className="flex items-center gap-2">
                  {selectedAtend.paciente_id ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-amber-500" />}
                  <span className={selectedAtend.paciente_id ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
                    {selectedAtend.paciente_id ? "Paciente vinculado" : "Paciente não vinculado"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedAtend.paciente_pacote_id ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-amber-500" />}
                  <span className={selectedAtend.paciente_pacote_id ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
                    {selectedAtend.paciente_pacote_id ? "Pacote vinculado" : "Pacote não vinculado"}
                  </span>
                </div>
                {prontoParaCheckin && (
                  <div className="mt-1 text-emerald-600 font-semibold text-[11px] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Pronto para check-in
                  </div>
                )}
              </div>

              {/* BOTÃO CHECK-IN RÁPIDO */}
              {prontoParaCheckin && selectedAtend.status !== "realizado" && (
                <Button
                  onClick={handleCheckinRapido}
                  disabled={busy}
                  className="w-full h-12 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 shadow-md"
                >
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  {busy ? "Processando..." : "✅ Realizar Check-in"}
                </Button>
              )}

              {selectedAtend.status === "realizado" && (
                <div className="w-full h-12 flex items-center justify-center gap-2 bg-emerald-50 border-2 border-emerald-300 rounded-lg text-emerald-700 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  ✅ Sessão já realizada
                </div>
              )}

              {/* BOTÃO WHATSAPP */}
              {podeEnviarWhats && (
                <Button
                  onClick={abrirModalWhatsApp}
                  className="w-full h-11 bg-green-600 hover:bg-green-700 font-bold"
                >
                  <MessageCircle className="w-5 h-5 mr-2" />
                  Enviar WhatsApp
                </Button>
              )}

              {/* PRONTUÁRIO */}
              {selectedAtend.paciente_id && (
                <div className="flex flex-col gap-2 bg-blue-50/30 p-3 rounded-xl border border-blue-100">
                  <div className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Prontuário
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="flex-1 text-xs border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => navigate(`/pacientes/${selectedAtend.paciente_id}/anamnese/nova`)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Anamnese
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-xs border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => navigate(`/pacientes/${selectedAtend.paciente_id}/evolucao/nova?atendimento=${selectedAtend.id}`)}>
                      <ClipboardEdit className="w-3.5 h-3.5 mr-1" /> Evolução
                    </Button>
                    {temProntuario && prontuarioId && (
                      <Button size="sm" variant="outline" className="flex-1 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => navigate(`/pacientes/${selectedAtend.paciente_id}/prontuario/${prontuarioId}`)}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Vincular paciente */}
              <div className="space-y-2 border-b pb-3">
                <Label className="text-xs font-bold">Paciente</Label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Buscar por nome..."
                    value={buscaPaciente}
                    onChange={(e) => setBuscaPaciente(e.target.value)}
                    className="h-10 text-sm pl-9"
                  />
                </div>
                {sugestoesPacientes.length > 0 && (
                  <div className="border rounded-lg max-h-40 overflow-y-auto bg-white">
                    {sugestoesPacientes.map((p) => (
                      <button key={p.id} onClick={() => selecionarPacienteSheet(p)} className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b last:border-0">
                        {p.nome} {p.telefone && `(${p.telefone})`}
                      </button>
                    ))}
                  </div>
                )}
                {pacienteSelecionado && (
                  <div className="bg-green-50 p-2 rounded text-sm font-medium text-green-800">
                    ✅ {pacienteSelecionado.nome} selecionado
                  </div>
                )}
              </div>

              {/* Pacote */}
              {pacienteSelecionado && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold">Pacote/Serviço a consumir</Label>
                  {itensPaciente.length > 0 ? (
                    <Select value={itemSelecionadoId || ""} onValueChange={setItemSelecionadoId}>
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="Selecione um item" />
                      </SelectTrigger>
                      <SelectContent>
                        {itensPaciente.map((item) => {
                          const nome = item.pacote?.nome || item.servico?.nome || "Item";
                          const info = item.autorizacao ? `${item.autorizacao.plano} (Guia: ${item.autorizacao.numero_guia})` : "Particular";
                          return (
                            <SelectItem key={item.id} value={item.id}>
                              {nome} – {item.sessoes_restantes} restantes – {info}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-xs text-amber-600">Este paciente não possui itens com saldo.</p>
                  )}

                  <Button onClick={handleSalvarVinculacao} className="w-full" disabled={busy || !pacienteSelecionado}>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {busy ? "Vinculando..." : "Vincular e Preparar Check-in"}
                  </Button>
                </div>
              )}

              {/* Status */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Alterar Status</Label>
                <Select value={statusFormValue} onValueChange={setStatusFormValue}>
                  <SelectTrigger className="h-11 text-sm font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agendado" className="font-medium text-blue-600">Agendado</SelectItem>
                    <SelectItem value="realizado" className="font-medium text-emerald-600">Realizado</SelectItem>
                    <SelectItem value="faltou" className="font-medium text-slate-500">Faltou</SelectItem>
                    <SelectItem value="cancelado" className="font-medium text-red-500">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleSalvarStatus} className="w-full h-11 bg-blue-600 hover:bg-blue-700 font-bold" disabled={busy}>
                  {busy ? "Salvando..." : "Confirmar Alteração"}
                </Button>
              </div>

              {/* Apagar */}
              {isAdmin && (
                <div className="pt-4 border-t border-red-200">
                  <Button type="button" variant="destructive" onClick={handleApagarAtendimento} className="w-full h-11 text-sm font-bold">
                    <Trash2 className="w-4 h-4 mr-2" /> Apagar do app
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* MODAL DE CRIAR */}
      <Dialog open={modalCriarOpen} onOpenChange={setModalCriarOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-600" /> Novo Atendimento
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-600">Paciente *</Label>
              {formCriar.paciente_id ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <div className="flex-1">
                    <div className="font-bold text-sm text-slate-800">{formCriar.paciente_nome}</div>
                    {pacoteSugerido && (<div className="text-[11px] text-emerald-700 mt-0.5">📦 Sugerido: {pacoteSugerido.label}</div>)}
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setFormCriar((p) => ({ ...p, paciente_id: "", paciente_nome: "", paciente_pacote_id: "" })); setPacoteSugerido(null); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : criandoPaciente ? (
                <div className="border rounded-lg p-3 space-y-2 bg-slate-50">
                  <div className="text-xs font-bold text-slate-600">Novo paciente</div>
                  <Input placeholder="Nome completo" value={novoPacienteNome} onChange={(e) => setNovoPacienteNome(e.target.value)} className="h-9 text-sm" />
                  <Input placeholder="Telefone (opcional)" value={novoPacienteTelefone} onChange={(e) => setNovoPacienteTelefone(e.target.value)} className="h-9 text-sm" />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setCriandoPaciente(false)}>Cancelar</Button>
                    <Button size="sm" className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={criarPacienteRapido}>
                      <UserPlus className="w-3 h-3 mr-1" /> Criar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input placeholder="Buscar paciente..." value={buscaPacienteCriar} onChange={(e) => setBuscaPacienteCriar(e.target.value)} className="h-10 text-sm pl-9" autoFocus />
                  </div>
                  {sugestoesPacientesCriar.length > 0 && (
                    <div className="border rounded-lg max-h-40 overflow-y-auto bg-white">
                      {sugestoesPacientesCriar.map((p) => (
                        <button key={p.id} onClick={() => selecionarPacienteCriar(p)} className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b last:border-0 flex justify-between">
                          <span className="font-medium">{p.nome}</span>
                          {p.telefone && <span className="text-xs text-muted-foreground">{p.telefone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {buscaPacienteCriar.trim().length >= 2 && sugestoesPacientesCriar.length === 0 && (
                    <button onClick={() => { setNovoPacienteNome(buscaPacienteCriar.trim()); setCriandoPaciente(true); }} className="w-full text-left px-3 py-2 border rounded-lg text-sm text-emerald-700 hover:bg-emerald-50 border-emerald-200 font-medium">
                      + Criar novo paciente "{buscaPacienteCriar}"
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-600">Profissional *</Label>
              <Select value={formCriar.profissional_id} onValueChange={(v) => setFormCriar({ ...formCriar, profissional_id: v })}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {profissionais.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.cor_agenda || "#3b82f6" }} />
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
                <Input type="date" value={formCriar.data} onChange={(e) => setFormCriar({ ...formCriar, data: e.target.value })} className="h-10 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">Início</Label>
                <Input type="time" value={formCriar.hora_inicio} onChange={(e) => {
                  const ini = e.target.value;
                  const [h, m] = ini.split(":").map(Number);
                  const fim = new Date();
                  fim.setHours(h, m + DURACAO_PADRAO, 0, 0);
                  setFormCriar({ ...formCriar, hora_inicio: ini, hora_fim: format(fim, "HH:mm") });
                }} className="h-10 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">Fim</Label>
                <Input type="time" value={formCriar.hora_fim} onChange={(e) => setFormCriar({ ...formCriar, hora_fim: e.target.value })} className="h-10 text-sm" />
              </div>
            </div>

                                    {/* Pacote vinculado OU opção de criar */}
            {formCriar.paciente_id && (
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-600">Pacote/Serviço *</Label>

                {/* 🔥 NOVO: Se o paciente tem pacotes, mostra o Dropdown para escolher */}
                {pacotesDisponiveis.length > 0 ? (
                  <Select 
                    value={formCriar.paciente_pacote_id || ""} 
                    onValueChange={(v) => {
                      const pac = pacotesDisponiveis.find(p => p.id === v);
                      const nome = pac.autorizacao?.plano 
                        ? `Plano ${pac.autorizacao.plano}` 
                        : pac.pacote?.nome || pac.servico?.nome || "Item";
                        
                      setFormCriar({ ...formCriar, paciente_pacote_id: v });
                      setPacoteSugerido({ id: v, label: `${nome} (${pac.sessoes_restantes} rest.)` });
                    }}
                  >
                    <SelectTrigger className="h-10 text-sm bg-blue-50 border-blue-200">
                      <Package className="w-4 h-4 mr-2 text-blue-600" />
                      <SelectValue placeholder="Selecione o pacote" />
                    </SelectTrigger>
                    <SelectContent>
                      {pacotesDisponiveis.map((pac) => {
                        const nome = pac.autorizacao?.plano 
                          ? `Plano ${pac.autorizacao.plano}` 
                          : pac.pacote?.nome || pac.servico?.nome || "Item";
                        return (
                          <SelectItem key={pac.id} value={pac.id}>
                            {nome} ({pac.sessoes_restantes} restantes)
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : !mostrarCriarPacote ? (
                  <button
                    type="button"
                    onClick={() => setMostrarCriarPacote(true)}
                    className="w-full text-left p-3 border-2 border-dashed border-emerald-300 rounded-lg text-sm text-emerald-700 hover:bg-emerald-50 font-medium flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar pacote/serviço
                  </button>
                ) : (
                  <div className="border rounded-lg p-3 space-y-2 bg-slate-50">
                    <div className="text-xs font-bold text-slate-600 flex justify-between items-center">
                      <span>Novo pacote/serviço</span>
                      <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setMostrarCriarPacote(false)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* Tipo */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setNovoPacoteForm({ ...novoPacoteForm, tipo: "particular" })}
                        className={`flex-1 h-9 text-xs rounded-lg border-2 font-medium ${
                          novoPacoteForm.tipo === "particular" ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"
                        }`}
                      >
                        💰 Particular
                      </button>
                      <button
                        type="button"
                        onClick={() => setNovoPacoteForm({ ...novoPacoteForm, tipo: "plano" })}
                        className={`flex-1 h-9 text-xs rounded-lg border-2 font-medium ${
                          novoPacoteForm.tipo === "plano" ? "border-purple-400 bg-purple-50 text-purple-700" : "border-slate-200 text-slate-500"
                        }`}
                      >
                        📋 Plano
                      </button>
                    </div>

                    {/* Plano + Guia */}
                    {novoPacoteForm.tipo === "plano" && (
                      <>
                        <Select value={novoPacoteForm.plano_id} onValueChange={(v) => setNovoPacoteForm({ ...novoPacoteForm, plano_id: v })}>
                          <SelectTrigger className="h-9 text-sm bg-background">
                            <SelectValue placeholder="Selecione o plano" />
                          </SelectTrigger>
                          <SelectContent>
                            {listaPlanos.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Número da guia"
                          value={novoPacoteForm.numero_guia}
                          onChange={(e) => setNovoPacoteForm({ ...novoPacoteForm, numero_guia: e.target.value })}
                          className="h-9 text-sm bg-background"
                        />
                      </>
                    )}

                    {/* Pacote/Serviço */}
                    <Select value={novoPacoteForm.pacote_servico_id} onValueChange={(v) => setNovoPacoteForm({ ...novoPacoteForm, pacote_servico_id: v })}>
                      <SelectTrigger className="h-9 text-sm bg-background">
                        <SelectValue placeholder="Selecione pacote ou serviço" />
                      </SelectTrigger>
                      <SelectContent>
                        {listaPacotesServicos.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.tipo_item === "pacote" ? `📦 ${item.nome} (${item.numero_sessoes} sessões)` : `📄 ${item.nome}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Preço */}
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Valor (R$) — opcional"
                      value={novoPacoteForm.preco}
                      onChange={(e) => setNovoPacoteForm({ ...novoPacoteForm, preco: e.target.value })}
                      className="h-9 text-sm bg-background"
                    />

                    <Button
                      type="button"
                      onClick={criarPacoteRapido}
                      disabled={criandoPacote}
                      className="w-full h-9 text-xs bg-emerald-600 hover:bg-emerald-700"
                    >
                      {criandoPacote ? "Criando..." : "Criar e vincular"}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-600">Observações</Label>
              <Textarea value={formCriar.observacoes} onChange={(e) => setFormCriar({ ...formCriar, observacoes: e.target.value })} rows={2} placeholder="Alguma observação..." className="text-sm" />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setModalCriarOpen(false)} disabled={criando}>Cancelar</Button>
              <Button className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 font-bold" onClick={salvarAtendimento} disabled={criando || !formCriar.paciente_id || !formCriar.profissional_id}>
                {criando ? "Salvando..." : "Salvar Atendimento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* MODAL RECORRÊNCIA */}
      <Dialog open={modalRecorrenciaOpen} onOpenChange={(open) => {
        if (!open) {
          setModalRecorrenciaOpen(false);
          setRecorrenciaBase(null);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              🔁 Criar Recorrência
            </DialogTitle>
          </DialogHeader>

          {recorrenciaBase && (
            <div className="space-y-4 pt-2">
              <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1">
                <div className="font-bold text-emerald-800">Atendimento criado com sucesso!</div>
                <div><span className="font-medium">Paciente:</span> {recorrenciaBase.paciente_nome}</div>
                <div><span className="font-medium">Horário base:</span> {format(recorrenciaBase.data_inicio, "EEEE, dd/MM", { locale: ptBR })} às {recorrenciaBase.hora_inicio}</div>
                <div className="text-emerald-700 mt-1">
                  📦 Este pacote tem <strong>{recorrenciaBase.sessoes_restantes}</strong> sessões restantes.
                </div>
              </div>

                            {/* Frequência */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">Repetir</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: "diaria", label: "📅 Diariamente" },
                    { v: "semanal", label: "📆 Semanalmente" },
                    { v: "mensal", label: "🗓️ Mensalmente" },
                    { v: "personalizado", label: "⚙️ Personalizado" },
                  ].map((f) => (
                    <button
                      key={f.v}
                      type="button"
                      onClick={() => setFormRecorrencia({ ...formRecorrencia, frequencia: f.v as any })}
                      className={`h-10 text-xs rounded-lg border-2 font-medium transition-all ${
                        formRecorrencia.frequencia === f.v
                          ? "bg-blue-100 border-blue-400 text-blue-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dias da semana — só aparece no Personalizado */}
              {formRecorrencia.frequencia === "personalizado" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase text-slate-600">Dias da semana</Label>
                  <div className="flex gap-1 flex-wrap">
                    {[
                      { v: 0, label: "Dom" },
                      { v: 1, label: "Seg" },
                      { v: 2, label: "Ter" },
                      { v: 3, label: "Qua" },
                      { v: 4, label: "Qui" },
                      { v: 5, label: "Sex" },
                      { v: 6, label: "Sáb" },
                    ].map((d) => {
                      const ativo = formRecorrencia.diasSemana.includes(d.v);
                      return (
                        <button
                          key={d.v}
                          type="button"
                          onClick={() => {
                            const novosDias = ativo
                              ? formRecorrencia.diasSemana.filter((x) => x !== d.v)
                              : [...formRecorrencia.diasSemana, d.v].sort();
                            if (novosDias.length === 0) return;
                            setFormRecorrencia({ ...formRecorrencia, diasSemana: novosDias });
                          }}
                          className={`h-9 px-3 rounded-lg text-xs font-medium border-2 transition-all ${
                            ativo
                              ? "bg-blue-100 border-blue-400 text-blue-700"
                              : "border-slate-200 text-slate-500 hover:border-slate-300"
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Nº de sessões */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">
                  Número de sessões
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={recorrenciaBase.sessoes_restantes}
                  value={formRecorrencia.numeroSessoes}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || 1;
                    setFormRecorrencia({ ...formRecorrencia, numeroSessoes: Math.min(v, recorrenciaBase.sessoes_restantes) });
                  }}
                  className="h-10 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Máximo: {recorrenciaBase.sessoes_restantes} (sessões restantes do pacote)
                </p>
              </div>

              {/* Exceções */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-600">Exceções</Label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formRecorrencia.pularFinsDeSemana}
                    onChange={(e) => setFormRecorrencia({ ...formRecorrencia, pularFinsDeSemana: e.target.checked })}
                    className="accent-blue-600"
                  />
                  Pular sábados e domingos
                </label>
              </div>

              {/* Preview */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">
                  Preview ({previewDatas.length} datas)
                </Label>
                <div className="bg-slate-50 border rounded-lg p-3 max-h-40 overflow-y-auto text-xs space-y-0.5">
                  {previewDatas.length === 0 ? (
                    <p className="text-muted-foreground italic">Nenhuma data será criada.</p>
                  ) : (
                    previewDatas.map((d, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-slate-500">#{i + 1}</span>
                        <span className="font-medium">
                          {format(d, "EEE, dd/MM/yyyy", { locale: ptBR })}
                        </span>
                        <span className="text-slate-500">{recorrenciaBase.hora_inicio}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Botões */}
              <div className="flex gap-2 pt-2">
              <Button
                  variant="outline"
                  className="flex-1 h-11"
                  onClick={() => {
                    executarInsertAtendimento(); // 🔥 Salva apenas 1
                  }}
                  disabled={criandoRecorrencia || criando}
                >
                  Não criar
                </Button>                
                <Button
                  className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 font-bold"
                  onClick={criarRecorrencia}
                  disabled={criandoRecorrencia || previewDatas.length === 0}
                >
                  {criandoRecorrencia ? "Criando..." : `Criar ${previewDatas.length} sessões`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
              {/* MODAL CONFLITO — ATENDIMENTO ÚNICO */}
      <Dialog open={modalConflitoOpen} onOpenChange={setModalConflitoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              ⚠️ Conflito com Bloqueio
            </DialogTitle>
          </DialogHeader>
          {conflitoInfo && (
            <div className="space-y-4 pt-2">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
                <p>
                  Existe um bloqueio de <strong>{TIPOS_BLOQUEIO.find((t) => t.v === conflitoInfo.tipo)?.label}</strong> 
                  {" "}neste horário
                  {conflitoInfo.profissional_id === null ? " para a clínica toda" : ` para ${conflitoInfo.profissional?.nome}`}.
                </p>
                <p className="mt-2 text-xs font-medium">
                  Das {format(new Date(conflitoInfo.data_inicio), "HH:mm")} às {format(new Date(conflitoInfo.data_fim), "HH:mm")}
                </p>
              </div>
              <p className="text-sm text-slate-600">
                Deseja criar o atendimento mesmo assim?
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setModalConflitoOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-amber-600 hover:bg-amber-700 font-bold"
                  onClick={() => {
                    setModalConflitoOpen(false);
                    salvarAtendimento(true); // Prossegue ignorando o conflito
                  }}
                >
                  Criar mesmo assim
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL CONFLITO — RECORRÊNCIA */}
      <Dialog open={modalConflitoRecOpen} onOpenChange={setModalConflitoRecOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              ⚠️ {datasConflitoRec.length} datas caem em bloqueios
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-h-40 overflow-y-auto text-xs space-y-1">
              {datasConflitoRec.map((d, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-amber-900">• {format(d, "EEE, dd/MM/yyyy", { locale: ptBR })}</span>
                  <span className="text-amber-700 font-medium">{recorrenciaBase?.hora_inicio}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-600">
              Como deseja prosseguir?
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setModalConflitoRecOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="w-full bg-amber-600 hover:bg-amber-700 font-bold"
                onClick={() => {
                  setModalConflitoRecOpen(false);
                  criarRecorrencia(false, true); // Ignora os bloqueios e cria todas
                }}
              >
                Criar todas as {previewDatas.length} sessões
              </Button>
              <Button
                variant="secondary"
                className="w-full font-bold text-slate-700"
                onClick={() => {
                  setModalConflitoRecOpen(false);
                  criarRecorrencia(true, false); // Pula as bloqueadas
                }}
              >
                Pular bloqueadas (criar {previewDatas.length - datasConflitoRec.length})
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL BLOQUEIO */}
      <Dialog open={modalBloqueioOpen} onOpenChange={setModalBloqueioOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-slate-600" /> Novo Bloqueio
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Tipo */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-600">Tipo</Label>
              <Select value={formBloqueio.tipo} onValueChange={(v) => setFormBloqueio({ ...formBloqueio, tipo: v })}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_BLOQUEIO.map((t) => (
                    <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Profissional */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-600">Profissional</Label>
              <Select
                value={formBloqueio.profissional_id || "__todas__"}
                onValueChange={(v) => setFormBloqueio({ ...formBloqueio, profissional_id: v === "__todas__" ? "" : v })}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas__">🏥 Clínica toda (todos os profissionais)</SelectItem>
                  {profissionais.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.cor_agenda || "#3b82f6" }} />
                        <span>{p.nome}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data/hora início */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">Data início</Label>
                <Input
                  type="date"
                  value={formBloqueio.data_inicio}
                  onChange={(e) => {
                    const novaData = e.target.value;
                    setFormBloqueio({
                      ...formBloqueio,
                      data_inicio: novaData,
                      data_fim: formBloqueio.data_fim === formBloqueio.data_inicio ? novaData : formBloqueio.data_fim,
                    });
                  }}
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">Hora início</Label>
                <Input
                  type="time"
                  value={formBloqueio.hora_inicio}
                  onChange={(e) => setFormBloqueio({ ...formBloqueio, hora_inicio: e.target.value })}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            {/* Data/hora fim */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">Data fim</Label>
                <Input
                  type="date"
                  value={formBloqueio.data_fim}
                  onChange={(e) => setFormBloqueio({ ...formBloqueio, data_fim: e.target.value })}
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">Hora fim</Label>
                <Input
                  type="time"
                  value={formBloqueio.hora_fim}
                  onChange={(e) => setFormBloqueio({ ...formBloqueio, hora_fim: e.target.value })}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            {/* Repetir */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-600">Repetir</Label>
              <Select
                value={formBloqueio.repetir}
                onValueChange={(v: any) => setFormBloqueio({ ...formBloqueio, repetir: v })}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nunca">Nunca (só este dia)</SelectItem>
                  <SelectItem value="diariamente">Diariamente</SelectItem>
                  <SelectItem value="semanalmente">Semanalmente (mesmo dia da semana)</SelectItem>
                  <SelectItem value="dias_uteis">Apenas dias úteis (Seg-Sex)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Repetir até */}
            {formBloqueio.repetir !== "nunca" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">
                  Repetir até (opcional)
                </Label>
                <Input
                  type="date"
                  value={formBloqueio.repetir_ate}
                  onChange={(e) => setFormBloqueio({ ...formBloqueio, repetir_ate: e.target.value })}
                  className="h-10 text-sm"
                  min={formBloqueio.data_inicio}
                />
                <p className="text-[10px] text-muted-foreground">
                  Se vazio, repete até 90 dias.
                </p>
              </div>
            )}

            {/* Observações */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-slate-600">Observações</Label>
              <Textarea
                value={formBloqueio.observacoes}
                onChange={(e) => setFormBloqueio({ ...formBloqueio, observacoes: e.target.value })}
                rows={2}
                placeholder="Opcional"
                className="text-sm"
              />
            </div>

            {/* 🔥 Checkbox de Notificar */}
            <label className="flex items-center gap-2 text-sm cursor-pointer bg-amber-50 border border-amber-200 p-3 rounded-lg">
              <input
                type="checkbox"
                checked={formBloqueio.notificar}
                onChange={(e) => setFormBloqueio({ ...formBloqueio, notificar: e.target.checked })}
                className="accent-amber-600 w-4 h-4"
              />
              <span className="font-medium text-amber-800">Notificar os profissionais sobre este bloqueio</span>
            </label>

            {/* Botões */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setModalBloqueioOpen(false)} disabled={criandoBloqueio}>
                Cancelar
              </Button>
              <Button className="flex-1 h-11 bg-slate-700 hover:bg-slate-800 font-bold" onClick={criarBloqueios} disabled={criandoBloqueio}>
                {criandoBloqueio ? "Criando..." : "🔒 Criar Bloqueio"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL WHATSAPP */}
      <Dialog open={modalWhatsAppOpen} onOpenChange={setModalWhatsAppOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" /> Enviar Mensagem
            </DialogTitle>
          </DialogHeader>

          {selectedAtend && (
            <div className="space-y-4 pt-2">
              <div className="text-xs bg-slate-50 border rounded p-3 space-y-1">
                <div><span className="font-medium">Para:</span> {selectedAtend.paciente?.nome || selectedAtend.nome_paciente_livre}</div>
                <div><span className="font-medium">Telefone:</span> {selectedAtend.paciente?.telefone || selectedAtend.telefone_contato || "—"}</div>
                <div><span className="font-medium">Data:</span> {format(new Date(selectedAtend.data_inicio), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">Escolha o template</Label>
                <Select value={templateSelecionadoId} onValueChange={setTemplateSelecionadoId}>
                  <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="font-medium">{t.nome}</span>
                        <span className="text-xs text-muted-foreground ml-2">({t.tipo})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-600">Pré-visualização</Label>
                <div className="bg-slate-50 border rounded-lg p-3 text-sm whitespace-pre-wrap max-h-52 overflow-y-auto">
                  {mensagemPreview || "Selecione um template..."}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 h-11" onClick={() => setModalWhatsAppOpen(false)}>Cancelar</Button>
                <Button className="flex-1 h-11 bg-green-600 hover:bg-green-700 font-bold" onClick={enviarWhatsApp} disabled={!templateSelecionadoId || !mensagemPreview}>
                  <Send className="w-4 h-4 mr-1" /> Abrir WhatsApp
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
