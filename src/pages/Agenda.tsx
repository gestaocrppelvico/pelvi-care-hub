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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Clock, FileText, RefreshCw, CheckCircle, Undo2,
  ChevronLeft, ChevronRight, MessageCircle, ClipboardList, Trash2, Search
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

interface PacoteCatalogo {
  id: string;
  nome: string;
  numero_sessoes: number;
  preco_total: number;
}

interface ServicoCatalogo {
  id: string;
  nome: string;
  preco: number;
}

type ViewMode = "day" | "week" | "month";

const statusLabel: Record<string, string> = {
  agendado: "Agendado",
  em_andamento: "Em andamento",
  realizado: "Realizado",
  cancelado: "Cancelado",
  faltou: "Faltou",
  faltou_sem_aviso: "Faltou s/ aviso",
};
const statusColor: Record<string, string> = {
  agendado: "secondary",
  em_andamento: "default",
  realizado: "default",
  cancelado: "destructive",
  faltou: "destructive",
  faltou_sem_aviso: "destructive",
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
  return statusLabel[a.status] ?? a.status;
}
function statusBadgeBg(a: Atendimento): string {
  const map: Record<string, string> = {
    agendado: "bg-gray-400/80",
    em_andamento: "bg-blue-500/80",
    realizado: "bg-green-500/80",
    cancelado: "bg-red-500/80",
    faltou: "bg-red-400/80",
    faltou_sem_aviso: "bg-orange-500/80",
  };
  return map[a.status] ?? "bg-gray-400/80";
}

const prevStatus: Record<string, string> = {
  em_andamento: "agendado",
  realizado: "agendado", 
  cancelado: "agendado",
};

/* ═══════════════════ Component ═══════════════════ */
export default function Agenda() {
  const navigate = useNavigate();
  const { isSecretaria, isAdmin, isFisio, user } = useAuth();
  const podeGerenciar = isAdmin || isSecretaria;
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
  
  // ── ESTADOS DE CADASTRO E AUTOCOMPLETAR ──
  const [modoCadastroRapido, setModoCadastroRapido] = useState(false);
  const [termoBusca, setTermoBusca] = useState("");
  const [telefoneBusca, setTelefoneBusca] = useState("");
  const [sugestoesPacientes, setSugestoesPacientes] = useState<any[]>([]);
  const [pacienteSelecionado, setPacienteSelecionado] = useState<any | null>(null);
  
  // ── ESTADOS DE PACOTES EXISTENTES ──
  const [pacotesAtivosPaciente, setPacotesAtivosPaciente] = useState<any[]>([]);
  const [usarPacoteExistenteId, setUsarPacoteExistenteId] = useState<string>("");

  // ── ESTADOS DO CATÁLOGO NOVO ──
  const [tipoAtendimentoRascunho, setTipoAtendimentoRascunho] = useState<"Plano" | "Particular">("Particular");
  const [itemTipo, setItemTipo] = useState<"servico" | "pacote">("servico");
  const [listaPacotes, setListaPacotes] = useState<PacoteCatalogo[]>([]);
  const [listaServicos, setListaServicos] = useState<ServicoCatalogo[]>([]);
  const [idItemSelecionado, setIdItemSelecionado] = useState<string>("");
  const [qtdSessoesAuto, setQtdSessoesAuto] = useState<string>("1");
  const [valorTotalAuto, setValorTotalAuto] = useState<string>("");

  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Limpa e prepara os estados ao abrir o formulário
  useEffect(() => {
    if (selected && modoCadastroRapido) {
      setTermoBusca(selected.nome_paciente_livre || "");
      setTelefoneBusca(selected.telefone_contato || "");
      setPacienteSelecionado(null);
      setSugestoesPacientes([]);
      setPacotesAtivosPaciente([]);
      setUsarPacoteExistenteId("");
    }
  }, [selected, modoCadastroRapido]);

  // Efeito de busca de pacientes (Autocompletar)
  useEffect(() => {
    if (termoBusca.length >= 3 && !pacienteSelecionado) {
      const delay = setTimeout(async () => {
        const { data } = await supabase
          .from('pacientes')
          .select('id, nome, telefone')
          .ilike('nome', `%${termoBusca}%`)
          .limit(5);
        setSugestoesPacientes(data || []);
      }, 300);
      return () => clearTimeout(delay);
    } else {
      setSugestoesPacientes([]);
    }
  }, [termoBusca, pacienteSelecionado]);

  // Busca os pacotes ativos se um paciente existente for selecionado
  async function buscarPacotesAtivos(pacienteId: string) {
    const { data } = await supabase.from('paciente_pacotes')
      .select('id, sessoes_restantes, pacotes(nome), servicos(nome)')
      .eq('paciente_id', pacienteId)
      .gt('sessoes_restantes', 0)
      .order('created_at', { ascending: false });
    
    setPacotesAtivosPaciente(data || []);
    if (data && data.length > 0) {
      setUsarPacoteExistenteId(data[0].id); // Sugere o pacote ativo mais recente
    } else {
      setUsarPacoteExistenteId("");
    }
  }

  /* ── computed range ── */
  const range = useMemo(() => {
    if (view === "day") return { start: startOfDay(anchor), end: endOfDay(anchor) };
    if (view === "week") {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      return { start: startOfDay(s), end: endOfDay(addDays(s, 6)) };
    }
    return { start: startOfDay(startOfMonth(anchor)), end: endOfDay(endOfMonth(anchor)) };
  }, [view, anchor]);

  /* ── fetch catálogos ── */
  const carregarCatalogos = useCallback(async () => {
    try {
      const [{ data: pacotesData }, { data: servicosData }] = await Promise.all([
        supabase.from("pacotes").select("id, nome, numero_sessoes, preco_total").eq("ativo", true),
        supabase.from("servicos").select("id, nome, preco").eq("ativo", true)
      ]);
      setListaPacotes((pacotesData as any[]) ?? []);
      setListaServicos((servicosData as any[]) ?? []);
    } catch (err) {
      console.error("Erro ao carregar os itens de catálogo:", err);
    }
  }, []);

  useEffect(() => { carregarCatalogos(); }, [carregarCatalogos]);

  /* ── fetch atendimentos ── */
  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from("atendimentos")
      .select("id, data_inicio, data_fim, status, tipo, paciente_id, nome_paciente_livre, telefone_contato, profissional_id, google_event_id, paciente:pacientes(nome, telefone), profissional:profissionais(nome, cor_agenda)")
      .gte("data_inicio", range.start.toISOString())
      .lte("data_inicio", range.end.toISOString())
      .not("status", "in", '("cancelado","faltou","faltou_sem_aviso")')
      .order("data_inicio");
    setList((data as any[]) ?? []);
    if (!silent) setLoading(false);
  }, [range]);

  useEffect(() => { reload(); }, [reload]);

  /* ── sync from GCal (Otimizado com Filtro de Tempo) ── */
  const syncNow = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true);

    // OTIMIZAÇÃO: Capturamos as datas visíveis (+/- 1 dia de margem)
    const dataInicioBusca = addDays(range.start, -1).toISOString();
    const dataFimBusca = addDays(range.end, 1).toISOString();

    const body: Record<string, unknown> = {
      timeMin: dataInicioBusca,
      timeMax: dataFimBusca
    };

    if (isFisio && !isAdmin && !isSecretaria && myProfissionalId) {
      body.profissional_id = myProfissionalId;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    let syncError: string | null = null;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gcal-pull`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(body),
        }
      );
      
      if (!res.ok) syncError = await res.text();
    } catch (e: any) {
      syncError = e.message;
    }

    if (syncError && !silent) toast.error("Falha ao sincronizar: " + syncError);
    
    await reload(silent);
    if (!silent) { setSyncing(false); toast.success("Agenda atualizada mais rapidamente!"); }
    
  }, [isFisio, isAdmin, isSecretaria, myProfissionalId, reload, range]);

  useEffect(() => {
    syncNow(true);
    pollRef.current = setInterval(() => syncNow(true), 5 * 60 * 1000);
    return () => clearInterval(pollRef.current);
  }, [syncNow]);

  /* ── actions ── */
  function nav(dir: -1 | 1) {
    setAnchor((prev) => {
      if (view === "day") return addDays(prev, dir);
      if (view === "week") return addWeeks(prev, dir);
      return addMonths(prev, dir);
    });
  }
  function goToday() { setAnchor(new Date()); }

  async function mudarStatus(id: string, novoStatus: string) {
    const { error } = await supabase.from("atendimentos").update({ status: novoStatus as any }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status → "${statusLabel[novoStatus]}"`);
    setSelected(null);
    reload();
  }

  async function fazerCheckin(a: Atendimento) {
    if (!confirm("Confirmar check-in? A sessão será contabilizada como realizada.")) return;
    const { error } = await supabase.from("atendimentos").update({ status: "realizado" as any }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Check-in realizado com sucesso!");
    setSelected(null);
    reload();
  }

  function handleCatalogoSelectChange(idSelecionado: string) {
    setIdItemSelecionado(idSelecionado);
    if (itemTipo === "servico") {
      const servico = listaServicos.find(s => s.id === idSelecionado);
      if (servico) { setQtdSessoesAuto("1"); setValorTotalAuto(servico.preco.toString()); }
    } else {
      const pacote = listaPacotes.find(p => p.id === idSelecionado);
      if (pacote) { setQtdSessoesAuto(pacote.numero_sessoes.toString()); setValorTotalAuto(pacote.preco_total.toString()); }
    }
  }

  /* ── Salvamento Misto (Novo vs Existente) ── */
  async function salvarCadastroRapido(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;

    const fd = new FormData(e.currentTarget);
    const numeroGuia = fd.get("numeroGuia") as string;

    if (!usarPacoteExistenteId && tipoAtendimentoRascunho === "Particular" && !idItemSelecionado) {
      toast.error("Por favor, selecione um item do catálogo ou um pacote ativo do paciente.");
      return;
    }

    try {
      // 1. Identificar ou Criar Paciente
      let finalPacienteId = pacienteSelecionado?.id;
      if (!finalPacienteId) {
        const { data: novoPac, error: errPac } = await supabase
          .from("pacientes")
          .insert({ nome: termoBusca, telefone: telefoneBusca || null })
          .select()
          .single();
        if (errPac) throw new Error("Erro ao criar paciente: " + errPac.message);
        finalPacienteId = novoPac.id;
      }

      // 2. Identificar ou Criar Pacote Financeiro
      let finalPacoteId = usarPacoteExistenteId;
      
      if (!finalPacoteId) {
        const qtdSessoes = parseInt(qtdSessoesAuto || "1");
        const valorTotal = valorTotalAuto ? parseFloat(valorTotalAuto) : 0;
        
        const dadosDoPacote: Record<string, any> = {
          paciente_id: finalPacienteId,
          sessoes_totais: qtdSessoes,
          sessoes_restantes: qtdSessoes, 
          preco_pago: valorTotal,
          status_pagamento: "pendente"
        };

        if (tipoAtendimentoRascunho === "Particular") {
          if (itemTipo === "pacote") {
            dadosDoPacote.pacote_id = idItemSelecionado;
          } else if (itemTipo === "servico") {
            dadosDoPacote.servico_id = idItemSelecionado;
          }
        }

        const { data: novoPacote, error: errPacote } = await supabase
          .from("paciente_pacotes")
          .insert(dadosDoPacote)
          .select()
          .single();

        if (errPacote) throw new Error("Erro ao criar pacote financeiro: " + errPacote.message);
        finalPacoteId = novoPacote.id;
      }

      // 3. Efetuar o check-in na agenda e amarrar os IDs
      const obsGuia = numeroGuia ? `Guia do Plano: ${numeroGuia}` : null;
      const { error: errAtendimento } = await supabase
        .from("atendimentos")
        .update({ 
          paciente_id: finalPacienteId,
          paciente_pacote_id: finalPacoteId,
          status: "realizado" as any,
          tipo: tipoAtendimentoRascunho,
          observacoes: obsGuia 
        })
        .eq("id", selected.id);

      if (errAtendimento) throw new Error("Erro ao vincular na agenda: " + errAtendimento.message);

      toast.success(usarPacoteExistenteId ? "Sessão descontada do pacote com sucesso!" : "Paciente cadastrado e atendimento faturado!");
      setModoCadastroRapido(false);
      setSelected(null);
      reload();

    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function desfazer(a: Atendimento) {
    const prev = prevStatus[a.status];
    if (!prev) { toast.error("Não é possível desfazer este status"); return; }
    if (!confirm(`Reverter de "${statusLabel[a.status]}" para "${statusLabel[prev]}"?`)) return;

    const { error } = await supabase.from("atendimentos").update({ status: prev as any }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }

    if (a.status === "realizado") {
      const { data: full } = await supabase.from("atendimentos").select("paciente_pacote_id").eq("id", a.id).maybeSingle();
      if (full?.paciente_pacote_id) {
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

  function enviarWhatsapp(a: Atendimento) {
    const tel = a.paciente?.telefone ?? a.telefone_contato;
    const msg = `Olá ${displayName(a)}, confirmando seu atendimento em ${format(new Date(a.data_inicio), "dd/MM/yyyy 'às' HH:mm")}.`;
    if (!abrirWhatsapp(tel, msg, isSecretaria)) toast.error("Telefone não disponível");
  }

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Agenda</h1>
        <Button variant="outline" size="sm" onClick={() => syncNow()} disabled={syncing}>
          <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

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

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)}><ChevronLeft className="w-5 h-5" /></Button>
        <button onClick={goToday} className="text-sm font-semibold capitalize">{title}</button>
        <Button variant="ghost" size="icon" onClick={() => nav(1)}><ChevronRight className="w-5 h-5" /></Button>
      </div>

      {loading && list.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Carregando...</p>
      ) : (
        <>
          {view === "day" && <DayView events={list} onSelect={(a) => { setSelected(a); setModoCadastroRapido(false); }} />}
          {view === "week" && <WeekView anchor={anchor} eventsByDay={eventsByDay} onSelect={(a) => { setSelected(a); setModoCadastroRapido(false); }} onDayClick={(d) => { setAnchor(d); setView("day"); }} />}
          {view === "month" && <MonthView anchor={anchor} eventsByDay={eventsByDay} onDayClick={(d) => { setAnchor(d); setView("day"); }} />}
        </>
      )}

      {/* DETAIL SHEET */}
      <Sheet open={!!selected} onOpenChange={(o) => {
        if (!o) { setSelected(null); setModoCadastroRapido(false); }
      }}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
          {selected && !modoCadastroRapido && (
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
                </div>
                <p><strong>Profissional:</strong> {selected.profissional?.nome ?? "—"}</p>
                <div className="flex items-center gap-2">
                  <strong>Status:</strong>
                  <Badge variant={statusColor[selected.status] as any}>{statusBadge(selected)}</Badge>
                </div>
                {!selected.paciente_id && (
                  <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                    ⚠ Aguardando Cadastro/Associação
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {selected.status === "agendado" && (
                  selected.paciente_id ? (
                    <Button size="sm" onClick={() => fazerCheckin
