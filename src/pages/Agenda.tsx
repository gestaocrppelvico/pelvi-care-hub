import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { format, addDays, addWeeks, addMonths, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameMonth, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, RefreshCw, ChevronLeft, ChevronRight, Link2, Wallet, Plus, UserPlus, CheckCircle2, AlertCircle, FileText, ClipboardEdit, Eye } from "lucide-react";

interface Atendimento {
  id: string;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  tipo: string;
  nome_paciente_libre: string | null;
  telefone_contato: string | null;
  paciente_id: string | null;
  paciente_pacote_id: string | null;
  paciente: { nome: string; telefone: string | null } | null;
  profissional: { id: string; nome: string; cor_agenda: string } | null;
  profissional_id: string | null;
}

export default function Agenda() {
  const { user, isSecretaria, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const profFiltroUrl = searchParams.get("profissional");
  const navigate = useNavigate();

  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedAtend, setSelectedAtend] = useState<Atendimento | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [statusForm, setStatusForm] = useState("agendado");
  const [busy, setBusy] = useState(false);

  const [profissionalId, setProfissionalId] = useState<string | null>(null);

  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [pacientesSugeridos, setPacientesSugeridos] = useState<any[]>([]);
  const [pacienteSelecionado, setPacienteSelecionado] = useState<any>(null);
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");

  const [itensPaciente, setItensPaciente] = useState<any[]>([]);
  const [itemSelecionadoId, setItemSelecionadoId] = useState<string | null>(null);

  const [mostrarAdicionarItem, setMostrarAdicionarItem] = useState(false);
  const [tipoAdicionar, setTipoAdicionar] = useState<"plano" | "particular">("plano");
  const [planoSelecionadoId, setPlanoSelecionadoId] = useState("");
  const [numeroGuia, setNumeroGuia] = useState("");
  const [pacoteServicoId, setPacoteServicoId] = useState("");

  const [listaPlanos, setListaPlanos] = useState<any[]>([]);
  const [listaPacotesServicos, setListaPacotesServicos] = useState<any[]>([]);

  const [temProntuario, setTemProntuario] = useState(false);
  const [prontuarioId, setProntuarioId] = useState<string | null>(null);

  useEffect(() => {
    if (sheetOpen) {
      supabase.from("planos_saude").select("id, nome").eq("ativo", true).then(({ data }) => setListaPlanos(data || []));
      Promise.all([
        supabase.from("pacotes").select("id, nome, numero_sessoes, preco_total").eq("ativo", true),
        supabase.from("servicos").select("id, nome, preco").eq("ativo", true)
      ]).then(([{ data: pacotes }, { data: servicos }]) => {
        const combined = [
          ...(pacotes || []).map(p => ({ ...p, tipo_item: "pacote" })),
          ...(servicos || []).map(s => ({ ...s, tipo_item: "servico" }))
        ];
        setListaPacotesServicos(combined);
      });
    }
  }, [sheetOpen]);

  useEffect(() => {
    if (!user) return;
    const fetchProfissional = async () => {
      const { data, error } = await supabase
        .from("profissionais")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!error && data) {
        setProfissionalId(data.id);
      }
    };
    fetchProfissional();
  }, [user]);

  useEffect(() => {
    if (buscaPaciente.trim().length < 2) {
      setPacientesSugeridos([]);
      return;
    }
    const buscar = async () => {
      const { data, error } = await supabase
        .from("pacientes")
        .select("id, nome, telefone")
        .ilike("nome", `%${buscaPaciente}%`)
        .eq("ativo", true)
        .limit(5);
      if (!error && data) setPacientesSugeridos(data);
    };
    const timeout = setTimeout(buscar, 300);
    return () => clearTimeout(timeout);
  }, [buscaPaciente]);

  const carregarAtendimentos = useCallback(async () => {
    setLoading(true);
    try {
      let start: Date, end: Date;
      if (view === "day") {
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
        .select("id, data_inicio, data_fim, status, tipo, nome_paciente_livre, telefone_contato, paciente_id, paciente_pacote_id, paciente:pacientes(nome, telefone), profissional:profissionais(id, nome, cor_agenda), profissional_id")
        .gte("data_inicio", start.toISOString())
        .lte("data_inicio", end.toISOString())
        .order("data_inicio", { ascending: true });

      if (!isAdmin && !isSecretaria && profissionalId) {
        query = query.eq("profissional_id", profissionalId);
      } else if (profFiltroUrl) {
        query = query.eq("profissional_id", profFiltroUrl);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAtendimentos((data as any[]) || []);
    } catch (err: any) {
      toast.error("Erro ao carregar agenda: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [view, currentDate, profFiltroUrl, profissionalId, isAdmin, isSecretaria]);

  useEffect(() => {
    carregarAtendimentos();
  }, [carregarAtendimentos]);

  const mapeamentoDias = useMemo(() => {
    const mapa = new Map<string, Atendimento[]>();
    atendimentos.forEach((at) => {
      const chave = format(new Date(at.data_inicio), "yyyy-MM-dd");
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(at);
    });
    return mapa;
  }, [atendimentos]);

  const carregarItensPaciente = async (pacienteId: string, itemIdParaSelecionar?: string | null) => {
    const { data } = await supabase
      .from("paciente_pacotes")
      .select(`
        id,
        sessoes_restantes,
        sessoes_totais,
        autorizacao:autorizacoes(plano, numero_guia),
        pacote:pacotes(nome),
        servico:servicos(nome)
      `)
      .eq("paciente_id", pacienteId)
      .gt("sessoes_restantes", 0)
      .order("created_at", { ascending: false });
    
    setItensPaciente(data || []);
    
    if (data && data.length > 0) {
      if (itemIdParaSelecionar && data.some(item => item.id === itemIdParaSelecionar)) {
        setItemSelecionadoId(itemIdParaSelecionar);
      } else {
        setItemSelecionadoId(data[0].id);
      }
    } else {
      setItemSelecionadoId(null);
    }
  };

  const handleCriarPaciente = async () => {
    if (!novoNome.trim()) {
      toast.error("Informe o nome do paciente");
      return;
    }
    const { data, error } = await supabase
      .from("pacientes")
      .insert({ nome: novoNome.trim(), telefone: novoTelefone.trim() || null, ativo: true })
      .select("id, nome, telefone")
      .single();
    if (error) {
      toast.error("Erro ao criar paciente: " + error.message);
      return;
    }
    setPacienteSelecionado(data);
    setNovoNome("");
    setNovoTelefone("");
    carregarItensPaciente(data.id);
    toast.success(`Paciente ${data.nome} criado com sucesso!`);
  };

  const handleAdicionarItem = async () => {
    if (!pacienteSelecionado) {
      toast.error("Selecione ou crie um paciente primeiro.");
      return;
    }
    if (!pacoteServicoId) {
      toast.error("Selecione um pacote ou serviço.");
      return;
    }

    const item = listaPacotesServicos.find(p => p.id === pacoteServicoId);
    if (!item) return;

    try {
      let novoItemId: string | null = null;

      if (tipoAdicionar === "plano") {
        if (!planoSelecionadoId) { toast.error("Selecione o plano de saúde."); return; }
        if (!numeroGuia.trim()) { toast.error("Informe o número da guia."); return; }

        const { data: aut, error: errAut } = await supabase
          .from("autorizacoes")
          .insert({
            paciente_id: pacienteSelecionado.id,
            plano: listaPlanos.find(p => p.id === planoSelecionadoId)?.nome,
            numero_guia: numeroGuia.trim(),
            sessoes_autorizadas: item.tipo_item === "pacote" ? item.numero_sessoes : 1,
            sessoes_realizadas: 0,
            status: "ativa"
          })
          .select("id")
          .single();
        if (errAut) throw errAut;

        const { data: pacoteCriado, error: errPac } = await supabase
          .from("paciente_pacotes")
          .insert({
            paciente_id: pacienteSelecionado.id,
            autorizacao_id: aut.id,
            pacote_id: item.tipo_item === "pacote" ? item.id : null,
            servico_id: item.tipo_item === "servico" ? item.id : null,
            sessoes_totais: item.tipo_item === "pacote" ? item.numero_sessoes : 1,
            sessoes_restantes: item.tipo_item === "pacote" ? item.numero_sessoes : 1,
            preco_pago: item.tipo_item === "pacote" ? item.preco_total : (item.preco || 0),
            status_pagamento: "pendente"
          })
          .select("id")
          .single();
        if (errPac) throw errPac;
        novoItemId = pacoteCriado.id;

        toast.success("Guia e pacote vinculados ao paciente!");
      } else {
        if (item.tipo_item === "pacote") {
          const { data: pacoteCriado, error } = await supabase
            .from("paciente_pacotes")
            .insert({
              paciente_id: pacienteSelecionado.id,
              pacote_id: item.id,
              sessoes_totais: item.numero_sessoes,
              sessoes_restantes: item.numero_sessoes,
              preco_pago: item.preco_total || 0,
              status_pagamento: "pendente"
            })
            .select("id")
            .single();
          if (error) throw error;
          novoItemId = pacoteCriado.id;
        } else {
          const { data: pacoteCriado, error } = await supabase
            .from("paciente_pacotes")
            .insert({
              paciente_id: pacienteSelecionado.id,
              servico_id: item.id,
              sessoes_totais: 1,
              sessoes_restantes: 1,
              preco_pago: item.preco || 0,
              status_pagamento: "pendente"
            })
            .select("id")
            .single();
          if (error) throw error;
          novoItemId = pacoteCriado.id;
        }
        toast.success("Item vinculado ao paciente!");
      }

      await carregarItensPaciente(pacienteSelecionado.id);
      if (novoItemId) {
        setItemSelecionadoId(novoItemId);
      }
      
      setMostrarAdicionarItem(false);
      setPlanoSelecionadoId("");
      setNumeroGuia("");
      setPacoteServicoId("");
    } catch (err: any) {
      toast.error("Erro ao adicionar item: " + err.message);
    }
  };

  const handleSalvarVinculacao = async () => {
    if (!selectedAtend || !pacienteSelecionado) {
      toast.error("Paciente não selecionado.");
      return;
    }
    if (itensPaciente.length > 0 && !itemSelecionadoId) {
      toast.error("Selecione um pacote/serviço para consumir.");
      return;
    }
    if (itensPaciente.length === 0 && !itemSelecionadoId) {
      toast.error("Este paciente não possui itens financeiros. Adicione um antes de prosseguir.");
      return;
    }

    try {
      const updateData: any = {
        paciente_id: pacienteSelecionado.id
      };
      if (itemSelecionadoId) {
        updateData.paciente_pacote_id = itemSelecionadoId;
      }
      const { error } = await supabase
        .from("atendimentos")
        .update(updateData)
        .eq("id", selectedAtend.id);
      if (error) throw error;

      setSelectedAtend(prev => prev ? { ...prev, ...updateData } : null);

      toast.success("Atendimento vinculado ao paciente e ao pacote!");
      setSheetOpen(false);
      carregarAtendimentos();
    } catch (err: any) {
      toast.error("Erro ao vincular: " + err.message);
    }
  };

  const handleSalvarStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAtend) return;
    setBusy(true);
    try {
      if (!selectedAtend.paciente_id || !selectedAtend.paciente_pacote_id) {
        toast.error("Vincule o paciente e o pacote antes de realizar o check-in.");
        setBusy(false);
        return;
      }
      const { error } = await supabase
        .from("atendimentos")
        .update({ status: statusForm })
        .eq("id", selectedAtend.id);
      if (error) throw error;
      toast.success("Status atualizado! Sessão consumida e repasse gerado.");
      setSheetOpen(false);
      carregarAtendimentos();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAnterior = () => {
    if (view === "day") setCurrentDate(prev => addDays(prev, -1));
    else if (view === "week") setCurrentDate(prev => addWeeks(prev, -1));
    else setCurrentDate(prev => addMonths(prev, -1));
  };
  const handleProximo = () => {
    if (view === "day") setCurrentDate(prev => addDays(prev, 1));
    else if (view === "week") setCurrentDate(prev => addWeeks(prev, 1));
    else setCurrentDate(prev => addMonths(prev, 1));
  };

  const obterEstiloCard = (status: string, corProfissional?: string) => {
    if (status === "faltou") return "border-l-4 border-slate-400 bg-slate-100/80 text-slate-400 shadow-none opacity-70";
    if (status === "realizado") return "border-l-4 border-emerald-500 bg-emerald-50/40 text-emerald-900";
    if (status === "cancelado") return "border-l-4 border-red-300 bg-red-50/30 text-red-400 line-through";
    return `border-l-4 bg-white text-slate-800 shadow-sm`;
  };

  const abrirEdicao = (at: Atendimento) => {
    setSelectedAtend(at);
    setStatusForm(at.status);
    setPacienteSelecionado(null);
    setItensPaciente([]);
    setItemSelecionadoId(null);
    setMostrarAdicionarItem(false);
    setBuscaPaciente("");
    setNovoNome("");
    setNovoTelefone("");
    setTemProntuario(false);
    setProntuarioId(null);
    
    if (at.paciente_id) {
      supabase.from("pacientes").select("id, nome, telefone").eq("id", at.paciente_id).single()
        .then(({ data }) => {
          if (data) {
            setPacienteSelecionado(data);
            carregarItensPaciente(data.id, at.paciente_pacote_id);
            supabase.from("prontuarios")
              .select("id")
              .eq("paciente_id", data.id)
              .limit(1)
              .then(({ data: prData }) => {
                if (prData && prData.length > 0) {
                  setTemProntuario(true);
                  setProntuarioId(prData[0].id);
                }
              });
          }
        });
    }
    setSheetOpen(true);
  };

  const pacienteVinculado = selectedAtend?.paciente_id !== null && selectedAtend?.paciente_id !== undefined;
  const pacoteVinculado = selectedAtend?.paciente_pacote_id !== null && selectedAtend?.paciente_pacote_id !== undefined;
  const prontoParaCheckin = pacienteVinculado && pacoteVinculado;

  return (
    <div className="space-y-4 p-2 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3 rounded-xl border shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleAnterior}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" onClick={() => setCurrentDate(new Date())} className="text-xs font-semibold">Hoje</Button>
          <Button variant="outline" size="icon" onClick={handleProximo}><ChevronRight className="w-4 h-4" /></Button>
          <h2 className="text-base font-bold capitalize text-slate-700 ml-1">
            {format(currentDate, view === "month" ? "MMMM 'de' yyyy" : "dd 'de' MMMM", { locale: ptBR })}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg self-stretch sm:self-auto">
          {(["day", "week", "month"] as const).map((v) => (
            <Button key={v} variant={view === v ? "default" : "ghost"} size="sm" onClick={() => setView(v)} className="text-xs capitalize flex-1 sm:flex-none font-semibold h-8">
              {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}
            </Button>
          ))}
          <Button variant="outline" size="icon" onClick={carregarAtendimentos} className="h-8 w-8 bg-white"><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {profFiltroUrl && isAdmin && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 p-2 rounded-lg text-xs font-semibold text-center">
          📌 A filtrar agenda por profissional selecionado no painel.
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground animate-pulse">A sintonizar os horários...</div>
      ) : view === "day" ? (
        <div className="space-y-2">
          {atendimentos.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed rounded-xl bg-white text-muted-foreground text-sm">Nenhum atendimento agendado para este dia.</div>
          ) : (
            atendimentos.map((at) => (
              <div
                key={at.id}
                onClick={() => abrirEdicao(at)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${obterEstiloCard(at.status)}`}
                style={at.status !== 'faltou' && at.status !== 'realizado' && at.status !== 'cancelado' && at.profissional?.cor_agenda ? { borderLeftColor: at.profissional.cor_agenda } : {}}
              >
                <div className="min-w-0 flex-1">
                  <div className={`font-bold text-sm truncate ${at.status === "faltou" ? "line-through text-slate-400" : ""}`}>
                    {at.paciente?.nome || at.nome_paciente_livre || "Sem Identificação"}
                  </div>
                  <div className="text-xs font-medium text-muted-foreground mt-0.5 flex items-center gap-2">
                    <span className="font-bold text-slate-600">{format(new Date(at.data_inicio), "HH:mm")}</span>
                    <span>•</span>
                    <span className="uppercase tracking-wider text-[10px]">{at.profissional?.nome || "Clínica"}</span>
                    <span>•</span>
                    {at.paciente_id && at.tipo && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-bold uppercase">
                        {at.tipo}
                      </Badge>
                    )}
                  </div>
                </div>
                <Badge className={`text-[10px] font-bold uppercase h-5 px-2 ${at.status === "realizado" ? "bg-emerald-600" : at.status === "faltou" ? "bg-slate-400" : at.status === "cancelado" ? "bg-red-400" : "bg-blue-600"}`}>
                  {at.status}
                </Badge>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border p-3 shadow-sm">
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-500 uppercase tracking-wider mb-2 pb-2 border-b">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {eachDayOfInterval({
              start: view === "week" ? startOfWeek(currentDate, { weekStartsOn: 1 }) : startOfMonth(currentDate),
              end: view === "week" ? endOfWeek(currentDate, { weekStartsOn: 1 }) : endOfMonth(currentDate)
            }).map((dia, idx) => {
              const chaveDia = format(dia, "yyyy-MM-dd");
              const listaEvts = mapeamentoDias.get(chaveDia) || [];
              return (
                <div key={idx} className={`min-h-[70px] p-1.5 rounded-lg border bg-slate-50/50 flex flex-col justify-between ${!isSameMonth(dia, currentDate) ? "opacity-30" : ""}`}>
                  <span className="text-xs font-bold text-slate-500">{format(dia, "d")}</span>
                  <div className="space-y-1 mt-1 flex-1 flex flex-col justify-end">
                    {listaEvts.slice(0, 2).map(ev => (
                      <div key={ev.id} onClick={() => abrirEdicao(ev)} className={`text-[10px] p-1 rounded font-semibold truncate cursor-pointer ${ev.status === 'faltou' ? 'bg-slate-200 text-slate-400 line-through' : 'bg-blue-100 text-blue-800'}`}>
                        {format(new Date(ev.data_inicio), "HH:mm")} {ev.paciente?.nome?.split(" ")[0] || ev.nome_paciente_livre?.split(" ")[0]}
                        {ev.paciente_id && ev.tipo && (
                          <span className="ml-1 text-[8px] opacity-70">({ev.tipo})</span>
                        )}
                      </div>
                    ))}
                    {listaEvts.length > 2 && <span className="text-[9px] text-muted-foreground text-center font-bold block">+{listaEvts.length - 2} mais</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-5 space-y-4 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-lg font-bold text-slate-800">Gerenciar Atendimento</SheetTitle>
          </SheetHeader>
          
          {selectedAtend && (
            <>
              <div className="bg-slate-50 p-3 rounded-xl border space-y-1 text-xs">
                <p className="font-bold text-sm text-slate-700">{selectedAtend.paciente?.nome || selectedAtend.nome_paciente_livre}</p>
                <p className="text-muted-foreground"><Clock className="w-3 h-3 inline mr-1" />{format(new Date(selectedAtend.data_inicio), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}</p>
                <p className="text-muted-foreground uppercase font-semibold text-[10px] tracking-wide text-blue-600 mt-1">Profissional: {selectedAtend.profissional?.nome || "Não definido"}</p>
              </div>

              <div className="flex flex-col gap-1.5 bg-slate-50 p-3 rounded-xl border text-xs">
                <div className="flex items-center gap-2">
                  {pacienteVinculado ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                  )}
                  <span className={pacienteVinculado ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
                    {pacienteVinculado ? "Paciente vinculado" : "Paciente não vinculado"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {pacoteVinculado ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                  )}
                  <span className={pacoteVinculado ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
                    {pacoteVinculado ? "Pacote vinculado" : "Pacote não vinculado"}
                  </span>
                </div>
                {prontoParaCheckin && (
                  <div className="mt-1 text-emerald-600 font-semibold text-[11px] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Pronto para check-in
                  </div>
                )}
              </div>

              {pacienteVinculado && selectedAtend.paciente_id && (
                <div className="flex flex-col gap-2 bg-blue-50/30 p-3 rounded-xl border border-blue-100">
                  <div className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Prontuário
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                      onClick={() => navigate(`/paciente/${selectedAtend.paciente_id}/anamnese/nova`)}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Anamnese
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                      onClick={() => navigate(`/paciente/${selectedAtend.paciente_id}/evolucao/nova?atendimento=${selectedAtend.id}`)}
                    >
                      <ClipboardEdit className="w-3.5 h-3.5 mr-1" /> Evolução
                    </Button>
                    {temProntuario && prontuarioId && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        onClick={() => navigate(`/paciente/${selectedAtend.paciente_id}/prontuario/${prontuarioId}`)}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="space-y-2 border-b pb-3">
            <Label className="text-xs font-bold">Paciente</Label>
            <Input
              placeholder="Buscar por nome..."
              value={buscaPaciente}
              onChange={(e) => setBuscaPaciente(e.target.value)}
              className="h-10 text-sm"
            />
            {pacientesSugeridos.length > 0 && (
              <div className="border rounded-lg max-h-40 overflow-y-auto bg-white">
                {pacientesSugeridos.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPacienteSelecionado(p);
                      setBuscaPaciente("");
                      carregarItensPaciente(p.id);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b last:border-0"
                  >
                    {p.nome} {p.telefone && `(${p.telefone})`}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Nome do novo paciente..."
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                className="flex-1 h-9 text-sm"
              />
              <Input
                placeholder="Telefone"
                value={novoTelefone}
                onChange={(e) => setNovoTelefone(e.target.value)}
                className="w-28 h-9 text-sm"
              />
              <Button variant="outline" size="sm" onClick={handleCriarPaciente} disabled={!novoNome.trim()} className="h-9">
                <UserPlus className="w-4 h-4 mr-1" /> Criar
              </Button>
            </div>
            {pacienteSelecionado && (
              <div className="bg-green-50 p-2 rounded text-sm font-medium text-green-800 mt-2">
                ✅ {pacienteSelecionado.nome} selecionado
              </div>
            )}
          </div>

          {pacienteSelecionado && (
            <div className="space-y-2">
              <Label className="text-xs font-bold">Pacote/Serviço a consumir</Label>
              {itensPaciente.length > 0 ? (
                <Select value={itemSelecionadoId || ""} onValueChange={setItemSelecionadoId}>
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder="Selecione um item com saldo" />
                  </SelectTrigger>
                  <SelectContent>
                    {itensPaciente.map(item => {
                      const nome = item.pacote?.nome || item.servico?.nome || "Item";
                      const info = item.autorizacao
                        ? `${item.autorizacao.plano} (Guia: ${item.autorizacao.numero_guia})`
                        : "Particular";
                      return (
                        <SelectItem key={item.id} value={item.id}>
                          {nome} – {item.sessoes_restantes} restantes – {info}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-amber-600">Este paciente não possui itens com saldo. Adicione um abaixo.</p>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setMostrarAdicionarItem(!mostrarAdicionarItem)}
                className="w-full text-xs"
              >
                {mostrarAdicionarItem ? "Cancelar" : "+ Adicionar novo pacote/serviço à ficha"}
              </Button>

              {mostrarAdicionarItem && (
                <div className="border p-3 rounded bg-slate-50 space-y-2">
                  <div className="flex gap-2">
                    <Label className="text-xs">Tipo:</Label>
                    <div className="flex gap-3">
                      <label>
                        <input
                          type="radio"
                          value="plano"
                          checked={tipoAdicionar === "plano"}
                          onChange={() => setTipoAdicionar("plano")}
                        /> Plano
                      </label>
                      <label>
                        <input
                          type="radio"
                          value="particular"
                          checked={tipoAdicionar === "particular"}
                          onChange={() => setTipoAdicionar("particular")}
                        /> Particular
                      </label>
                    </div>
                  </div>

                  {tipoAdicionar === "plano" && (
                    <>
                      <Select value={planoSelecionadoId} onValueChange={setPlanoSelecionadoId}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Plano de saúde" /></SelectTrigger>
                        <SelectContent>
                          {listaPlanos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Número da guia"
                        value={numeroGuia}
                        onChange={(e) => setNumeroGuia(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </>
                  )}

                  <Select value={pacoteServicoId} onValueChange={setPacoteServicoId}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o pacote/serviço" /></SelectTrigger>
                    <SelectContent>
                      {listaPacotesServicos.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.tipo_item === "pacote" ? `📦 ${item.nome} (${item.numero_sessoes} sessões)` : `📄 ${item.nome}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button size="sm" onClick={handleAdicionarItem} className="w-full">
                    Adicionar à ficha
                  </Button>
                </div>
              )}

              <Button 
                onClick={handleSalvarVinculacao} 
                className="w-full"
                variant={itensPaciente.length > 0 && itemSelecionadoId ? "default" : "outline"}
                disabled={!pacienteSelecionado || (itensPaciente.length > 0 && !itemSelecionadoId)}
              >
                {itensPaciente.length > 0 && itemSelecionadoId ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Vincular e Preparar Check-in
                  </>
                ) : (
                  "Vincular e Preparar Check-in"
                )}
              </Button>
            </div>
          )}

          <form onSubmit={handleSalvarStatus} className="space-y-4 pt-2 border-t">
            <div className="space-y-2">
              <Label htmlFor="status" className="text-xs font-bold uppercase tracking-wider text-slate-500">Alterar Status da Sessão</Label>
              <Select value={statusForm} onValueChange={setStatusForm}>
                <SelectTrigger id="status" className="h-12 text-sm font-semibold">
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendado" className="font-medium text-blue-600">Agendado</SelectItem>
                  <SelectItem value="realizado" className="font-medium text-emerald-600">Realizado / Evoluído</SelectItem>
                  <SelectItem value="faltou" className="font-medium text-slate-500">Faltou (Enviar para Auditoria)</SelectItem>
                  <SelectItem value="cancelado" className="font-medium text-red-500">Cancelado / Desmarcado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {statusForm === "realizado" && !prontoParaCheckin && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800 space-y-1">
                <p className="font-bold">⚠️ Check-in Bloqueado:</p>
                <p>Vincule o paciente e o pacote antes de confirmar.</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              disabled={busy || (statusForm === "realizado" && !prontoParaCheckin)}
            >
              {busy ? "A atualizar..." : "Confirmar Alteração"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
