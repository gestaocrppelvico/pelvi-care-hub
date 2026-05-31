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
  ChevronLeft, ChevronRight, MessageCircle, ClipboardList, Trash2
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
  
  // Estados do Modo Cadastro Rápido e Faturamento Dinâmico
  const [modoCadastroRapido, setModoCadastroRapido] = useState(false);
  const [tipoAtendimentoRascunho, setTipoAtendimentoRascunho] = useState<"Plano" | "Particular">("Particular");
  const [itemTipo, setItemTipo] = useState<"servico" | "pacote">("servico");
  
  // Catálogos carregados das tabelas do banco de dados
  const [listaPacotes, setListaPacotes] = useState<PacoteCatalogo[]>([]);
  const [listaServicos, setListaServicos] = useState<ServicoCatalogo[]>([]);
  
  // Valores calculados em tempo real na interface
  const [qtdSessoesAuto, setQtdSessoesAuto] = useState<string>("1");
  const [valorTotalAuto, setValorTotalAuto] = useState<string>("");

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

  /* ── fetch catálogos (Serviços e Pacotes) ── */
  const carregarCatalogos = useCallback(async () => {
    try {
      const { data: pacotesData } = await supabase
        .from("pacotes")
        .select("id, nome, numero_sessoes, preco_total")
        .eq("ativo", true);
        
      const { data: servicosData } = await supabase
        .from("servicos")
        .select("id, nome, preco")
        .eq("ativo", true);

      setListaPacotes((pacotesData as any[]) ?? []);
      setListaServicos((servicosData as any[]) ?? []);
    } catch (err) {
      console.error("Erro ao carregar os itens de catálogo das tabelas:", err);
    }
  }, []);

  useEffect(() => {
    carregarCatalogos();
  }, [carregarCatalogos]);

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

  /* ── sync from GCal ── */
  const syncNow = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true);
    const body: Record<string, unknown> = {};
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
    if (!silent) { setSyncing(false); toast.success("Agenda updated"); }
  }, [isFisio, isAdmin, isSecretaria, myProfissionalId, reload]);

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

  // Monitora a seleção do Dropdown do catálogo para aplicar a automação
  function handleCatalogoSelectChange(idSelecionado: string) {
    if (itemTipo === "servico") {
      const servico = listaServicos.find(s => s.id === idSelecionado);
      if (servico) {
        setQtdSessoesAuto("1");
        setValorTotalAuto(servico.preco.toString());
      }
    } else {
      const pacote = listaPacotes.find(p => p.id === idSelecionado);
      if (pacote) {
        setQtdSessoesAuto(pacote.numero_sessoes.toString());
        setValorTotalAuto(pacote.preco_total.toString());
      }
    }
  }

  /* ── submissão do faturamento estruturado ── */
  async function salvarCadastroRapido(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;

    const fd = new FormData(e.currentTarget);
    const nome = fd.get("nome") as string;
    const telefone = fd.get("telefone") as string;
    const numeroGuia = fd.get("numeroGuia") as string;
    
    const qtdSessoes = parseInt(qtdSessoesAuto || "1");
    const valorTotal = valorTotalAuto ? parseFloat(valorTotalAuto) : 0;

    try {
      // 1. Cria a linha base do paciente
      const { data: novoPaciente, error: errPaciente } = await supabase
        .from("pacientes")
        .insert({ nome, telefone: telefone || null })
        .select()
        .single();
      
      if (errPaciente) throw new Error("Erro ao criar paciente: " + errPaciente.message);

      // 2. Cria o contrato financeiro em paciente_pacotes
      const { data: novoPacote, error: errPacote } = await supabase
        .from("paciente_pacotes")
        .insert({
          paciente_id: novoPaciente.id,
          sessoes_totais: qtdSessoes,
          sessoes_restantes: qtdSessoes, 
          preco_pago: valorTotal,
          status_pagamento: "pendente",
          tipo_atendimento: tipoAtendimentoRascunho
        })
        .select()
        .single();

      if (errPacote) throw new Error("Erro ao criar pacote: " + errPacote.message);

      const obsGuia = numeroGuia ? `Guia do Plano: ${numeroGuia}` : null;

      // 3. Efetua o check-in e amarra as chaves
      const { error: errAtendimento } = await supabase
        .from("atendimentos")
        .update({ 
          paciente_id: novoPaciente.id,
          paciente_pacote_id: novoPacote.id,
          status: "realizado" as any,
          tipo: tipoAtendimentoRascunho,
          observacoes: obsGuia 
        })
        .eq("id", selected.id);

      if (errAtendimento) throw new Error("Erro ao atualizar agenda: " + errAtendimento.message);

      toast.success("Paciente cadastrado, item do catálogo faturado e atendimento realizado!");
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
                    ⚠ Aguardando Cadastro
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {selected.status === "agendado" && (
                  selected.paciente_id ? (
                    <Button size="sm" onClick={() => fazerCheckin(selected)}>
                      <CheckCircle className="w-3 h-3 mr-1" />Check-in
                    </Button>
                  ) : (
                    <Button size="sm" className="bg-primary text-primary-foreground" onClick={() => setModoCadastroRapido(true)}>
                      <ClipboardList className="w-3 h-3 mr-1" />Completar Cadastro e Iniciar
                    </Button>
                  )
                )}

                {selected.status !== "cancelado" && selected.paciente_id && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/atendimentos/${selected.id}/prontuario`}>
                      <FileText className="w-3 h-3 mr-1" />Evoluir / Prontuário
                    </Link>
                  </Button>
                )}

                {(selected.paciente?.telefone || selected.telefone_contato) && (
                  <Button size="sm" variant="outline" onClick={() => enviarWhatsapp(selected)}>
                    <MessageCircle className="w-3 h-3 mr-1" />WhatsApp
                  </Button>
                )}

                {selected.status === "agendado" && (
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => mudarStatus(selected.id, "faltou")}>
                    Faltou
                  </Button>
                )}

                {podeGerenciar && (
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="ml-auto"
                    onClick={async () => {
                      if (confirm("Tem certeza que deseja excluir permanentemente este horário da agenda?")) {
                        const { error } = await supabase.from('atendimentos').delete().eq('id', selected.id);
                        if (error) {
                          toast.error("Erro ao deletar: " + error.message);
                        } else {
                          toast.success("Agendamento excluído!");
                          setSelected(null);
                          reload();
                        }
                      }
                    }}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Remover Agendamento
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* NOVO FORMULÁRIO RÁPIDO INTEGRADO COM CATÁLOGO */}
          {selected && modoCadastroRapido && (
            <div className="space-y-4 pb-6">
              <SheetHeader>
                <SheetTitle className="text-lg">Completar Cadastro e Lançar Serviço</SheetTitle>
                <p className="text-sm text-muted-foreground">Vincule um plano ou serviço do catálogo institucional.</p>
              </SheetHeader>

              <form onSubmit={salvarCadastroRapido} className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Nome da Paciente</Label>
                  <Input id="nome" name="nome" defaultValue={selected.nome_paciente_livre || ""} required />
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="telefone">Telefone (opcional)</Label>
                  <Input id="telefone" name="telefone" defaultValue={selected.telefone_contato || ""} />
                </div>

                {/* Seletor do Tipo Principal de Atendimento */}
                <div className="flex gap-2 p-1 bg-muted rounded-md mt-2">
                  <button type="button" onClick={() => setTipoAtendimentoRascunho("Particular")} className={`flex-1 text-xs py-1.5 rounded-sm transition-all ${tipoAtendimentoRascunho === "Particular" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"}`}>Particular</button>
                  <button type="button" onClick={() => setTipoAtendimentoRascunho("Plano")} className={`flex-1 text-xs py-1.5 rounded-sm transition-all ${tipoAtendimentoRascunho === "Plano" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"}`}>Plano de Saúde</button>
                </div>

                {tipoAtendimentoRascunho === "Particular" ? (
                  <div className="space-y-3 p-3 border rounded-lg bg-slate-50/50">
                    {/* Subtítulo de escolha de modalidade */}
                    <div className="flex gap-4 items-center">
                      <Label className="text-xs text-muted-foreground">Modalidade do Catálogo:</Label>
                      <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                        <input type="radio" checked={itemTipo === "servico"} onChange={() => { setItemTipo("servico"); setQtdSessoesAuto("1"); setValorTotalAuto(""); }} />
                        Sessão Avulsa
                      </label>
                      <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                        <input type="radio" checked={itemTipo === "pacote"} onChange={() => { setItemTipo("pacote"); setQtdSessoesAuto("1"); setValorTotalAuto(""); }} />
                        Pacote Estruturado
                      </label>
                    </div>

                    {/* Dropdown alimentado de forma dinâmica pelas tabelas */}
                    <div className="space-y-1">
                      <Label className="text-xs">Selecione o Item do Sistema</Label>
                      <select 
                        className="w-full bg-background border rounded-md h-9 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        required
                        onChange={(e) => handleCatalogoSelectChange(e.target.value)}
                        defaultValue=""
                      >
                        <option value="" disabled>-- Clique para selecionar --</option>
                        {itemTipo === "servico" 
                          ? listaServicos.map(s => <option key={s.id} value={s.id}>{s.nome} (R$ {s.preco})</option>)
                          : listaPacotes.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.numero_sessoes} sessões)</option>)
                        }
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 p-3 border rounded-lg bg-blue-50/30">
                    <Label htmlFor="numeroGuia">Número da Guia de Autorização</Label>
                    <Input id="numeroGuia" name="numeroGuia" placeholder="Digite a guia do convênio (opcional)" />
                  </div>
                )}

                {/* Campos bloqueados para edição manual que recebem os valores automáticos do catálogo */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nº de Sessões</Label>
                    <Input 
                      value={tipoAtendimentoRascunho === "Plano" ? "1" : qtdSessoesAuto} 
                      disabled 
                      className="bg-muted text-muted-foreground font-medium" 
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label>Valor Total (R$)</Label>
                    <Input 
                      value={tipoAtendimentoRascunho === "Plano" ? "Conveniado" : (valorTotalAuto ? `R$ ${parseFloat(valorTotalAuto).toFixed(2)}` : "—")} 
                      disabled 
                      className="bg-muted text-muted-foreground font-semibold" 
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setModoCadastroRapido(false)}>
                    Voltar
                  </Button>
                  <Button type="submit" className="flex-1 bg-primary text-white font-medium">
                    Confirmar e Registrar Atendimento
                  </Button>
                </div>
              </form>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ═══════════════════ DAY VIEW ═══════════════════ */
function DayView({ events, onSelect }: { events: Atendimento[]; onSelect: (a: Atendimento) => void }) {
  const columns = useMemo(() => {
    const sorted = [...events].sort((a, b) =>
      new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime()
    );
    const cols: Atendimento[][] = [];
    sorted.forEach((evt) => {
      const start = new Date(evt.data_inicio).getTime();
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
    const map = new Map<string, { col: number; total: number }>();
    sorted.forEach((evt) => {
      const evtStart = new Date(evt.data_inicio).getTime();
      const evtEnd = evt.data_fim ? new Date(evt.data_fim).getTime() : evtStart + 40 * 60_000;
      const colIdx = cols.findIndex((c) => c.includes(evt));
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
                    className="absolute rounded px-1.5 py-0.5 text-[11px] leading-tight text-white truncate text-left shadow-sm hover:brightness-110 transition-all border border-white/40"
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
                  className="w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight text-white truncate hover:brightness-110 transition-colors border border-white/30"
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
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
