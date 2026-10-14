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
  MessageCircle, Send, FileText, ClipboardEdit, Eye, CheckCircle2, AlertCircle, Trash2, ExternalLink
} from "lucide-react";
import { aplicarTemplate, abrirWhatsapp, getPreferenciaWhatsApp } from "@/lib/crm";

// ==========================================================
// CONFIGURAÇÕES
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
// HELPER: calcular datas da recorrência
// ==========================================================
function calcularDatasRecorrencia(
  dataBase: Date,
  frequencia: "semanal" | "quinzenal" | "mensal",
  diasSemana: number[],
  numeroSessoes: number,
  pularFinsDeSemana: boolean
): Date[] {
  const datas: Date[] = [];
  const d = new Date(dataBase);
  d.setHours(0, 0, 0, 0);

  // Sempre inclui a data base como 1ª sessão
  datas.push(new Date(d));

  const diasOrdenados = [...diasSemana].sort();
  let safety = 0;

  if (frequencia === "semanal" && diasOrdenados.length === 1) {
    // Caso simples: mesmo dia toda semana
    while (datas.length < numeroSessoes && safety < 500) {
      safety++;
      const proxima = addWeeks(dataBase, safety);
      if (pularFinsDeSemana && (proxima.getDay() === 0 || proxima.getDay() === 6)) continue;
      datas.push(proxima);
    }
  } else if (frequencia === "quinzenal" && diasOrdenados.length === 1) {
    while (datas.length < numeroSessoes && safety < 500) {
      safety++;
      const proxima = addDays(dataBase, safety * 14);
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
    // Múltiplos dias ou múltiplos dias com frequência: iterar dia a dia
    let cursor = new Date(d);
    let semanaAtual = 0;
    while (datas.length < numeroSessoes && safety < 500) {
      safety++;
      cursor = addDays(cursor, 1);

      if (!diasOrdenados.includes(cursor.getDay())) continue;
      if (pularFinsDeSemana && (cursor.getDay() === 0 || cursor.getDay() === 6)) continue;

      if (frequencia === "semanal") {
        datas.push(new Date(cursor));
      } else if (frequencia === "quinzenal") {
        const diasDiff = Math.floor((cursor.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        const semana = Math.floor(diasDiff / 7);
        if (semana % 2 === 0) datas.push(new Date(cursor));
      } else if (frequencia === "mensal") {
        // Só pega o mesmo dia do mês
        if (cursor.getDate() === d.getDate()) datas.push(new Date(cursor));
      }
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
    frequencia: "semanal" as "semanal" | "quinzenal" | "mensal",
    numeroSessoes: 10,
    diasSemana: [4] as number[], // 0=Dom..6=Sáb
    pularFinsDeSemana: true,
  });
  const [previewDatas, setPreviewDatas] = useState<Date[]>([]);
  const [criandoRecorrencia, setCriandoRecorrencia] = useState(false);

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
        id, sessoes_restantes, sessoes_totais,
        autorizacao:autorizacoes(plano, numero_guia),
        pacote:pacotes(nome),
        servico:servicos(nome)
      `)
      .eq("paciente_id", pacienteId)
      .gt("sessoes_restantes", 0)
      .order("created_at", { ascending: false });

    setItensPaciente(data || []);

    if (data && data.length > 0) {
      if (itemPreSelecionado && data.some((i) => i.id === itemPreSelecionado)) {
        setItemSelecionadoId(itemPreSelecionado);
      } else {
        setItemSelecionadoId(data[0].id);
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
          updateData.status = "cancelado";
        }
      }

      const { error } = await supabase
        .from("atendimentos")
        .update(updateData)
        .eq("id", selectedAtend.id);
      if (error) throw error;

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
    if (!confirm(`Apagar o atendimento de ${nome}?\n\nEsta ação não pode ser desfeita.`)) return;
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
  async function criarRecorrencia() {
    if (!recorrenciaBase) return;
    if (previewDatas.length === 0) {
      toast.error("Nenhuma data válida para criar");
      return;
    }

    setCriandoRecorrencia(true);
    try {
      const [hI, mI] = recorrenciaBase.hora_inicio.split(":").map(Number);
      const [hF, mF] = recorrenciaBase.hora_fim.split(":").map(Number);

      const atendimentosParaCriar = previewDatas.map((d) => {
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
    setCriandoPaciente(false);
    setNovoPacienteNome("");
    setNovoPacienteTelefone("");
    setModalCriarOpen(true);
  };

  async function selecionarPacienteCriar(p: { id: string; nome: string; telefone: string | null }) {
    setFormCriar((prev) => ({ ...prev, paciente_id: p.id, paciente_nome: p.nome }));
    setBuscaPacienteCriar("");
    setSugestoesPacientesCriar([]);

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
      setPacoteSugerido({ id: pac.id, label: `${nome} (${pac.sessoes_restantes} rest.)` });
      setFormCriar((prev) => ({ ...prev, paciente_pacote_id: pac.id }));
    } else {
      setPacoteSugerido(null);
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

  async function salvarAtendimento() {
    if (!formCriar.paciente_id) return toast.error("Selecione o paciente");
    if (!formCriar.profissional_id) return toast.error("Selecione o profissional");
    if (!formCriar.data || !formCriar.hora_inicio || !formCriar.hora_fim) return toast.error("Preencha data e horário");

    setCriando(true);
    try {
      const dataInicio = new Date(`${formCriar.data}T${formCriar.hora_inicio}:00`);
      const dataFim = new Date(`${formCriar.data}T${formCriar.hora_fim}:00`);
      if (dataFim <= dataInicio) {
        toast.error("Fim deve ser depois do início");
        setCriando(false);
        return;
      }

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

      toast.success("Atendimento criado!");
      setModalCriarOpen(false);
      await carregar();

      // 🔥 Se tem pacote com mais sessões, oferece recorrência
      if (formCriar.paciente_pacote_id) {
        const { data: pacInfo } = await supabase
          .from("paciente_pacotes")
          .select("sessoes_restantes")
          .eq("id", formCriar.paciente_pacote_id)
          .maybeSingle();

        const restantes = pacInfo?.sessoes_restantes ?? 0;

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
          setModalRecorrenciaOpen(true);
        }
      }
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
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3 rounded-xl border shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={anterior}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={() => setCurrentDate(new Date())} className="text-xs font-semibold">Hoje</Button>
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
              <Button key={v} variant={view === v ? "default" : "ghost"} size="sm" onClick={() => setView(v)} className="text-xs capitalize font-semibold h-8">
                {v === "day" ? "Dia" : v === "week" ? "Semana" : v === "month" ? "Mês" : "Profis."}
              </Button>
            ))}
          </div>
          <Button size="sm" onClick={() => abrirCriar()} className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs font-bold">
            <Plus className="w-3.5 h-3.5 mr-1" /> Novo
          </Button>
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
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
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

            {pacoteSugerido && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
                <Package className="w-5 h-5 text-blue-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase font-bold text-blue-700">Pacote sugerido</div>
                  <div className="text-sm font-medium text-slate-800 truncate">{pacoteSugerido.label}</div>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-700 hover:bg-blue-100" onClick={() => { setPacoteSugerido(null); setFormCriar({ ...formCriar, paciente_pacote_id: "" }); }}>
                  Remover
                </Button>
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
                <Label className="text-xs font-bold uppercase text-slate-600">Frequência</Label>
                <Select
                  value={formRecorrencia.frequencia}
                  onValueChange={(v: any) => setFormRecorrencia({ ...formRecorrencia, frequencia: v })}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="quinzenal">Quinzenal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Dias da semana */}
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
                    setModalRecorrenciaOpen(false);
                    setRecorrenciaBase(null);
                  }}
                  disabled={criandoRecorrencia}
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
