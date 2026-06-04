import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Clock, FileText, RefreshCw, CheckCircle,
  ChevronLeft, ChevronRight, MessageCircle, ClipboardList, Trash2, Search, Plus
} from "lucide-react";

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

export default function Agenda() {
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
  
  const [modoCadastroRapido, setModoCadastroRapido] = useState(false);
  const [termoBusca, setTermoBusca] = useState("");
  const [telefoneBusca, setTelefoneBusca] = useState("");
  const [sugestoesPacientes, setSugestoesPacientes] = useState<any[]>([]);
  const [pacienteSelecionado, setPacienteSelecionado] = useState<any | null>(null);
  
  const [pacotesAtivosPaciente, setPacotesAtivosPaciente] = useState<any[]>([]);
  const [usarPacoteExistenteId, setUsarPacoteExistenteId] = useState<string>("");

  const [tipoAtendimentoRascunho, setTipoAtendimentoRascunho] = useState<"Plano" | "Particular">("Particular");
  const [itemTipo, setItemTipo] = useState<"servico" | "pacote">("servico");
  const [listaPacotes, setListaPacotes] = useState<PacoteCatalogo[]>([]);
  const [listaServicos, setListaServicos] = useState<ServicoCatalogo[]>([]);
  const [idItemSelecionado, setIdItemSelecionado] = useState<string>("");
  const [qtdSessoesAuto, setQtdSessoesAuto] = useState<string>("1");
  const [valorTotalAuto, setValorTotalAuto] = useState<string>("");

  const pollRef = useRef<ReturnType<typeof setInterval>>();

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

  async function buscarPacotesAtivos(pacienteId: string) {
    const { data } = await supabase.from('paciente_pacotes')
      .select('id, sessoes_restantes, pacotes(nome), servicos(nome), autorizacoes(plano, numero_guia)')
      .eq('paciente_id', pacienteId)
      .gt('sessoes_restantes', 0)
      .order('created_at', { ascending: false });
    
    setPacotesAtivosPaciente(data || []);
    if (data && data.length > 0) {
      setUsarPacoteExistenteId(data[0].id);
    } else {
      setUsarPacoteExistenteId("");
    }
  }

  const range = useMemo(() => {
    if (view === "day") return { start: startOfDay(anchor), end: endOfDay(anchor) };
    if (view === "week") {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      return { start: startOfDay(s), end: endOfDay(addDays(s, 6)) };
    }
    return { start: startOfDay(startOfMonth(anchor)), end: endOfDay(endOfMonth(anchor)) };
  }, [view, anchor]);

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

  const syncNow = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true);
    
    const hoje = new Date();
    const timeMin = addDays(hoje, -1).toISOString();
    const timeMax = addDays(hoje, 30).toISOString();

    const body: Record<string, unknown> = { timeMin, timeMax };

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
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) syncError = await res.text();
    } catch (e: any) {
      syncError = e.message;
    }
    
    if (syncError && !silent) toast.error("Falha ao sincronizar: " + syncError);
    await reload(silent);
    if (!silent) { setSyncing(false); toast.success("Agenda atualizada!"); }
  }, [isFisio, isAdmin, isSecretaria, myProfissionalId, reload]);

  useEffect(() => {
    syncNow(true);
    pollRef.current = setInterval(() => syncNow(true), 5 * 60 * 1000);
    return () => clearInterval(pollRef.current);
  }, [syncNow]);

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

  async function salvarCadastroRapido(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;

    const fd = new FormData(e.currentTarget);
    
    if (!usarPacoteExistenteId && tipoAtendimentoRascunho === "Particular" && !idItemSelecionado) {
      toast.error("Por favor, selecione um item ou guia ativa.");
      return;
    }

    try {
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

      let finalPacoteId = usarPacoteExistenteId;
      
      if (!finalPacoteId) {
        
        if (tipoAtendimentoRascunho === "Plano") {
          const nomePlano = fd.get("nomePlano") as string;
          const numeroGuia = fd.get("numeroGuia") as string;
          const qtdSessoesPlano = parseInt((fd.get("qtdSessoesPlano") as string) || "10");

          // A) Cria a Autorização
          const { data: novaAut, error: errAut } = await supabase
            .from("autorizacoes")
            .insert({
              paciente_id: finalPacienteId,
              plano: nomePlano,
              numero_guia: numeroGuia,
              sessoes_autorizadas: qtdSessoesPlano,
              sessoes_realizadas: 0
            })
            .select().single();
          
          if (errAut) throw new Error("Erro ao registrar guia: " + errAut.message);

          // B) Cria o Pacote Zerado Amarrado
          const { data: novoPacotePlano, error: errPacPlano } = await supabase
            .from("paciente_pacotes")
            .insert({
              paciente_id: finalPacienteId,
              autorizacao_id: novaAut.id,
              sessoes_totais: qtdSessoesPlano,
              sessoes_restantes: qtdSessoesPlano,
              preco_pago: 0,
              status_pagamento: "pago"
            })
            .select().single();

          if (errPacPlano) throw new Error("Erro ao criar repasse: " + errPacPlano.message);
          finalPacoteId = novoPacotePlano.id;

        } else {
          const qtdSessoes = parseInt(qtdSessoesAuto || "1");
          const valorTotal = valorTotalAuto ? parseFloat(valorTotalAuto) : 0;
          
          const dadosDoPacote: Record<string, any> = {
            paciente_id: finalPacienteId,
            sessoes_totais: qtdSessoes,
            sessoes_restantes: qtdSessoes, 
            preco_pago: valorTotal,
            status_pagamento: "pendente"
          };

          if (itemTipo === "pacote") dadosDoPacote.pacote_id = idItemSelecionado;
          else if (itemTipo === "servico") dadosDoPacote.servico_id = idItemSelecionado;

          const { data: novoPacote, error: errPacote } = await supabase
            .from("paciente_pacotes").insert(dadosDoPacote).select().single();

          if (errPacote) throw new Error("Erro ao criar pacote: " + errPacote.message);
          finalPacoteId = novoPacote.id;
        }
      }

      const { error: errAtendimento } = await supabase
        .from("atendimentos")
        .update({ 
          paciente_id: finalPacienteId,
          paciente_pacote_id: finalPacoteId,
          status: "realizado" as any,
          tipo: tipoAtendimentoRascunho
        })
        .eq("id", selected.id);

      if (errAtendimento) throw new Error("Erro ao vincular na agenda: " + errAtendimento.message);

      toast.success(usarPacoteExistenteId ? "Sessão descontada com sucesso!" : "Cadastro, Guia e Check-in concluídos!");
      setModoCadastroRapido(false);
      setSelected(null);
      reload();

    } catch (error: any) {
      toast.error(error.message);
    }
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
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" className="bg-primary text-white">
                <Plus className="w-4 h-4 mr-1" /> Novo
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Criar Novo Agendamento</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  (Utilize o Google Calendar para adicionar eventos).
                </p>
              </div>
            </SheetContent>
          </Sheet>

          <Button variant="outline" size="sm" onClick={() => syncNow()} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
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
                    <Button size="sm" onClick={() => fazerCheckin(selected)}>
                      <CheckCircle className="w-3 h-3 mr-1" />Check-in Rápido
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
                        if (error) { toast.error("Erro ao deletar: " + error.message); } else {
                          toast.success("Agendamento excluído!");
                          setSelected(null);
                          reload();
                        }
                      }
                    }}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Remover
                  </Button>
                )}
              </div>
            </div>
          )}

          {selected && modoCadastroRapido && (
            <div className="space-y-4 pb-6">
              <SheetHeader>
                <SheetTitle className="text-lg">Registro e Associação de Atendimento</SheetTitle>
                <p className="text-sm text-muted-foreground">Busque o paciente no sistema ou cadastre um novo.</p>
              </SheetHeader>

              <form onSubmit={salvarCadastroRapido} className="space-y-4 mt-2">
                
                <div className="space-y-1.5 relative">
                  <Label>Nome da Paciente</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      value={termoBusca}
                      onChange={(e) => {
                        setTermoBusca(e.target.value);
                        setPacienteSelecionado(null);
                        setPacotesAtivosPaciente([]);
                        setUsarPacoteExistenteId("");
                      }}
                      className={`pl-9 ${pacienteSelecionado ? "border-green-500 bg-green-50/30 text-green-900 font-semibold" : ""}`}
                      placeholder="Digite para buscar ou registrar..."
                      required
                      autoComplete="off"
                    />
                  </div>
                  
                  {sugestoesPacientes.length > 0 && !pacienteSelecionado && (
                    <div className="absolute z-20 w-full bg-background border rounded-md shadow-xl mt-1 max-h-48 overflow-y-auto">
                      <div className="p-2 text-xs font-semibold text-primary bg-primary/10 border-b">
                        👆 Clique num nome abaixo para carregar as guias!
                      </div>
                      {sugestoesPacientes.map((p) => (
                        <div
                          key={p.id}
                          className="p-3 hover:bg-muted cursor-pointer border-b last:border-0 transition-colors"
                          onClick={() => {
                            setPacienteSelecionado(p);
                            setTermoBusca(p.nome);
                            setTelefoneBusca(p.telefone || "");
                            setSugestoesPacientes([]);
                            buscarPacotesAtivos(p.id);
                          }}
                        >
                          <div className="font-medium text-sm">{p.nome}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{p.telefone || "Sem telefone cadastrado"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {pacienteSelecionado && (
                    <p className="text-xs text-green-600 font-medium flex items-center gap-1 mt-1">
                      <CheckCircle className="w-3 h-3" /> Paciente vinculado com sucesso!
                    </p>
                  )}
                  {!pacienteSelecionado && termoBusca.length > 2 && sugestoesPacientes.length === 0 && (
                    <p className="text-xs text-blue-600 flex items-center gap-1 mt-1">
                      <Plus className="w-3 h-3" /> Paciente novo será cadastrado.
                    </p>
                  )}
                </div>
                
                <div className="space-y-1.5">
                  <Label>Telefone (opcional)</Label>
                  <Input 
                    value={telefoneBusca}
                    onChange={(e) => setTelefoneBusca(e.target.value)}
                    placeholder="DDD + Número"
                  />
                </div>

                {pacotesAtivosPaciente.length > 0 && (
                  <div className="p-4 border border-green-300 bg-green-50/50 rounded-lg space-y-3 mt-4">
                    <Label className="text-green-800 font-semibold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Saldos e Guias Encontradas
                    </Label>
                    <p className="text-xs text-green-700">Este paciente possui saldo ativo. Deseja abater desta guia/pacote?</p>
                    <select
                      className="w-full bg-white border border-green-200 rounded-md h-10 px-3 text-sm focus:ring-green-500 focus:border-green-500 outline-none"
                      value={usarPacoteExistenteId}
                      onChange={(e) => setUsarPacoteExistenteId(e.target.value)}
                    >
                      <option value="">Não, registrar e cobrar um NOVO serviço ou guia.</option>
                      {pacotesAtivosPaciente.map(pkg => {
                        const texto = pkg.autorizacoes 
                          ? `Guia: ${pkg.autorizacoes.plano} (Nº ${pkg.autorizacoes.numero_guia})`
                          : (pkg.pacotes?.nome || pkg.servicos?.nome || 'Pacote/Serviço');
                        
                        return (
                          <option key={pkg.id} value={pkg.id} className="font-medium">
                            Usar: {texto} - {pkg.sessoes_restantes} sessões restantes
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {!usarPacoteExistenteId && (
                  <>
                    <div className="flex gap-2 p-1 bg-muted rounded-md mt-4">
                      <button type="button" onClick={() => setTipoAtendimentoRascunho("Particular")} className={`flex-1 text-xs py-1.5 rounded-sm transition-all ${tipoAtendimentoRascunho === "Particular" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"}`}>Particular</button>
                      <button type="button" onClick={() => setTipoAtendimentoRascunho("Plano")} className={`flex-1 text-xs py-1.5 rounded-sm transition-all ${tipoAtendimentoRascunho === "Plano" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"}`}>Plano de Saúde</button>
                    </div>

                    {tipoAtendimentoRascunho === "Particular" ? (
                      <div className="space-y-3 p-3 border rounded-lg bg-slate-50/50">
                        <div className="flex gap-4 items-center">
                          <Label className="text-xs text-muted-foreground">Catálogo Institucional:</Label>
                          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                            <input type="radio" checked={itemTipo === "servico"} onChange={() => { setItemTipo("servico"); setQtdSessoesAuto("1"); setValorTotalAuto(""); setIdItemSelecionado(""); }} />
                            Sessão Avulsa
                          </label>
                          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                            <input type="radio" checked={itemTipo === "pacote"} onChange={() => { setItemTipo("pacote"); setQtdSessoesAuto("1"); setValorTotalAuto(""); setIdItemSelecionado(""); }} />
                            Pacote Estruturado
                          </label>
                        </div>

                        <div className="space-y-1">
                          <select 
                            className="w-full bg-background border rounded-md h-9 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            required
                            onChange={(e) => handleCatalogoSelectChange(e.target.value)}
                            value={idItemSelecionado}
                          >
                            <option value="" disabled>-- Selecione o item a ser cobrado --</option>
                            {itemTipo === "servico" 
                              ? listaServicos.map(s => <option key={s.id} value={s.id}>{s.nome} (R$ {s.preco})</option>)
                              : listaPacotes.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.numero_sessoes} sessões)</option>)
                            }
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 p-3 border rounded-lg bg-blue-50/30">
                        <div className="space-y-1.5">
                          <Label htmlFor="nomePlano">Nome do Plano de Saúde</Label>
                          <Input id="nomePlano" name="nomePlano" placeholder="Ex: Luminar Fachesf, SulAmérica..." required />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="numeroGuia">Número da Guia</Label>
                            <Input id="numeroGuia" name="numeroGuia" placeholder="Ex: 454115..." required />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="qtdSessoesPlano">Sessões Autorizadas</Label>
                            <Input id="qtdSessoesPlano" name="qtdSessoesPlano" type="number" defaultValue="5" min="1" required />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="space-y-1.5">
                        <Label>Sessões a Faturar</Label>
                        <Input value={tipoAtendimentoRascunho === "Plano" ? "Ver formulário" : qtdSessoesAuto} disabled className="bg-muted text-muted-foreground font-medium" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Valor Total (R$)</Label>
                        <Input value={tipoAtendimentoRascunho === "Plano" ? "Conveniado" : (valorTotalAuto ? `R$ ${parseFloat(valorTotalAuto).toFixed(2)}` : "—")} disabled className="bg-muted text-muted-foreground font-semibold" />
                      </div>
                    </div>
                  </>
                )}

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setModoCadastroRapido(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1 bg-primary text-white font-medium"
                    disabled={termoBusca.length > 2 && sugestoesPacientes.length > 0 && !pacienteSelecionado}
                  >
                    Confirmar Check-in
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

function DayView({ events, onSelect }: { events: Atendimento[]; onSelect: (a: Atendimento) => void }) {
  const columns = useMemo(() => {
    const sorted = [...events].sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());
    const cols: Atendimento[][] = [];
    sorted.forEach((evt) => {
      const start = new Date(evt.data_inicio).getTime();
      let placed = false;
      for (const col of cols) {
        const lastEnd = col[col.length - 1].data_fim ? new Date(col[col.length - 1].data_fim!).getTime() : new Date(col[col.length - 1].data_inicio).getTime() + 40 * 60_000;
        if (start >= lastEnd) { col.push(evt); placed = true; break; }
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
          <div className="w-12 flex-shrink-0 text-[10px] text-muted-foreground text-right pr-2 pt-1">{String(h).padStart(2, "0")}:00</div>
          <div className="flex-1 relative">
            {events.filter((e) => new Date(e.data_inicio).getHours() === h).map((e) => {
              const start = new Date(e.data_inicio);
              const end = e.data_fim ? new Date(e.data_fim) : new Date(start.getTime() + 40 * 60_000);
              const topOff = (start.getMinutes() / 60) * 60;
              const height = Math.max((differenceInMinutes(end, start) / 60) * 60, 24);
              const { col, total } = columns.get(e.id) ?? { col: 0, total: 1 };
              const width = total > 1 ? `calc(${100 / total}% - 2px)` : "calc(100% - 8px)";
              const left = total > 1 ? `calc(${(col / total) * 100}%)` : "0px";
              return (
                <button key={e.id} onClick={() => onSelect(e)} className="absolute rounded px-1.5 py-0.5 text-[11px] leading-tight text-white truncate text-left shadow-sm hover:brightness-110 transition-all border border-white/40" style={{ top: topOff, height, width, left, backgroundColor: eventColor(e) }}>
                  <span className="font-medium">{displayName(e)}</span>
                  <span className="opacity-80 ml-1">{format(start, "HH:mm")}</span>
                  {height >= 36 && <span className={`block text-[9px] mt-0.5 px-1 rounded-sm w-fit ${statusBadgeBg(e)} text-white`}>{statusBadge(e)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function WeekView({ anchor, eventsByDay, onSelect, onDayClick }: { anchor: Date; eventsByDay: Map<string, Atendimento[]>; onSelect: (a: Atendimento) => void; onDayClick: (d: Date) => void }) {
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
            <button className="w-full mb-1 hover:opacity-70 transition-opacity" onClick={() => onDayClick(d)}>
              <div className={`text-center text-[10px] uppercase ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>{format(d, "EEE", { locale: ptBR })}</div>
              <div className={`text-center text-sm ${isToday ? "bg-primary text-primary-foreground w-6 h-6 rounded-full mx-auto flex items-center justify-center font-bold" : ""}`}>{format(d, "d")}</div>
            </button>
            <div className="space-y-0.5">
              {evts.map((e) => (
                <button key={e.id} onClick={() => onSelect(e)} className="w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight text-white truncate hover:brightness-110 transition-colors border border-white/30" style={{ backgroundColor: eventColor(e) }}>
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

function MonthView({ anchor, eventsByDay, onDayClick }: { anchor: Date; eventsByDay: Map<string, Atendimento[]>; onDayClick: (d: Date) => void }) {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: calStart, end: calEnd });
  const today = format(new Date(), "yyyy-MM-dd");
  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => <div key={d} className="text-center text-[10px] text-muted-foreground uppercase">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {allDays.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const isToday = key === today;
          const inMonth = isSameMonth(d, anchor);
          const evts = eventsByDay.get(key) ?? [];
          return (
            <button key={key} onClick={() => onDayClick(d)} className={`bg-card min-h-[52px] p-1 text-left transition-colors hover:bg-accent/50 ${!inMonth ? "opacity-40" : ""}`}>
              <div className={`text-xs text-center mb-0.5 ${isToday ? "bg-primary text-primary-foreground w-5 h-5 rounded-full mx-auto flex items-center justify-center font-bold text-[10px]" : ""}`}>{format(d, "d")}</div>
              {evts.length > 0 && (
                <div className="flex justify-center gap-0.5 flex-wrap">
                  {evts.slice(0, 3).map((e) => <div key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: eventColor(e) }} />)}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}







