import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  CheckCircle, XCircle, Filter, ExternalLink, Award, FileCheck2,
  Download, Eye, Paperclip, Clock, User, Undo2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";

type PacoteComDados = {
  id: string;
  paciente_id: string;
  sessoes_restantes: number;
  sessoes_totais: number;
  sessoes_realizadas: number;
  status_renovacao: string | null;
  alta_programada: boolean;
  dispensado_renovacao: boolean;
  autorizacao_id: string | null;
  paciente: {
    id: string;
    nome: string;
    numero_carteirinha: string | null;
    plano_saude: string | null;
    profissional_responsavel_id: string | null;
  } | null;
  autorizacao: {
    id: string;
    plano: string;
    numero_guia: string | null;
    data_validade: string | null;
  } | null;
  profissional: {
    id: string;
    nome: string;
    cor_agenda: string | null;
  } | null;
};

type SolicitacaoGuia = {
  id: string;
  paciente_id: string;
  plano: string | null;
  numero_carteirinha: string | null;
  foto_pedido_url: string | null;
  observacoes: string | null;
  status: string;
  created_at: string;
  paciente: {
    id: string;
    nome: string;
    profissional_responsavel_id: string | null;
  } | null;
  profissional: {
    id: string;
    nome: string;
    cor_agenda: string | null;
  } | null;
};

type PlanoSaude = {
  id: string;
  nome: string;
  link_portal: string | null;
  ativo: boolean;
};

type ItemPendente =
  | { tipo: "solicitacao"; ordem: number; data: SolicitacaoGuia }
  | { tipo: "renovacao"; ordem: number; data: PacoteComDados };

export default function Autorizacoes() {
  const navigate = useNavigate();
  const [pacotes, setPacotes] = useState<PacoteComDados[]>([]);
  const [pacotesAtivos, setPacotesAtivos] = useState<PacoteComDados[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoGuia[]>([]);
  const [emAnalise, setEmAnalise] = useState<SolicitacaoGuia[]>([]);
  const [planos, setPlanos] = useState<PlanoSaude[]>([]);
  const [profissionais, setProfissionais] = useState<{ id: string; nome: string; cor_agenda: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const [filtroProfissional, setFiltroProfissional] = useState<string>("");
  const [filtroPlano, setFiltroPlano] = useState<string>("");
  const [filtroUrgencia, setFiltroUrgencia] = useState<string>("");

  const [guiaRecebida, setGuiaRecebida] = useState<SolicitacaoGuia | null>(null);
  const [formGuia, setFormGuia] = useState({
    numero_guia: "",
    sessoes_autorizadas: 10,
    data_emissao: "",
    data_validade: "",
    observacoes: "",
  });
  const [salvandoGuia, setSalvandoGuia] = useState(false);

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    setLoading(true);
    try {
      const { data: pendentes } = await supabase
        .from("paciente_pacotes")
        .select(`
          id, paciente_id, sessoes_restantes, sessoes_totais, sessoes_realizadas,
          status_renovacao, alta_programada, dispensado_renovacao, autorizacao_id,
          paciente:pacientes(id, nome, numero_carteirinha, plano_saude, profissional_responsavel_id),
          autorizacao:autorizacoes(id, plano, numero_guia, data_validade)
        `)
        .eq("status_renovacao", "vai_renovar")
        .eq("dispensado_renovacao", false);

      const { data: ativos } = await supabase
        .from("paciente_pacotes")
        .select(`
          id, paciente_id, sessoes_restantes, sessoes_totais, sessoes_realizadas,
          status_renovacao, alta_programada, dispensado_renovacao, autorizacao_id,
          paciente:pacientes(id, nome, numero_carteirinha, plano_saude, profissional_responsavel_id),
          autorizacao:autorizacoes(id, plano, numero_guia, data_validade)
        `)
        .not("autorizacao_id", "is", null)
        .gt("sessoes_restantes", 0);

      const { data: sols } = await supabase
        .from("solicitacoes_guia")
        .select(`
          id, paciente_id, plano, numero_carteirinha, foto_pedido_url,
          observacoes, status, created_at,
          paciente:pacientes(id, nome, profissional_responsavel_id)
        `)
        .eq("status", "pendente")
        .order("created_at", { ascending: false });

      const { data: solsAnalise } = await supabase
        .from("solicitacoes_guia")
        .select(`
          id, paciente_id, plano, numero_carteirinha, foto_pedido_url,
          observacoes, status, created_at,
          paciente:pacientes(id, nome, profissional_responsavel_id)
        `)
        .eq("status", "em_analise")
        .order("created_at", { ascending: false });

      const { data: planosData } = await supabase
        .from("planos_saude")
        .select("id, nome, link_portal, ativo")
        .eq("ativo", true)
        .order("nome");

      const { data: profsData } = await supabase
        .from("profissionais")
        .select("id, nome, cor_agenda")
        .eq("ativo", true)
        .order("nome");

      const profMap = new Map((profsData ?? []).map(p => [p.id, p]));

      const enriquecerPacote = (lista: any[]): PacoteComDados[] =>
        (lista ?? []).map(p => ({
          ...p,
          profissional: p.paciente?.profissional_responsavel_id
            ? profMap.get(p.paciente.profissional_responsavel_id) ?? null
            : null,
        }));

      const enriquecerSolicitacao = (lista: any[]): SolicitacaoGuia[] =>
        (lista ?? []).map(s => ({
          ...s,
          profissional: s.paciente?.profissional_responsavel_id
            ? profMap.get(s.paciente.profissional_responsavel_id) ?? null
            : null,
        }));

      setPacotes(enriquecerPacote(pendentes ?? []));
      setPacotesAtivos(enriquecerPacote(ativos ?? []));
      setSolicitacoes(enriquecerSolicitacao(sols ?? []));
      setEmAnalise(enriquecerSolicitacao(solsAnalise ?? []));
      setPlanos(planosData ?? []);
      setProfissionais(profsData ?? []);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar autorizações");
    } finally {
      setLoading(false);
    }
  }

  // ============ AÇÕES ============

  // Abre portal (só link, sem mudar status)
  function abrirPortalPlano(nomePlano: string | null | undefined, pacienteId?: string) {
    const plano = planos.find(p => p.nome.toLowerCase() === nomePlano?.toLowerCase());
    if (plano?.link_portal) {
      window.open(plano.link_portal, "_blank");
      toast.info(`Abrindo portal ${plano.nome}`);
    } else {
      toast.warning(`Portal do plano ${nomePlano ?? "—"} não cadastrado`);
      if (pacienteId) navigate(`/pacientes/${pacienteId}`);
    }
  }

  // 🔥 Mover solicitação para Em Análise
  async function moverSolicitacaoParaAnalise(sol: SolicitacaoGuia) {
    const { error } = await supabase
      .from("solicitacoes_guia")
      .update({ status: "em_analise" })
      .eq("id", sol.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(`${sol.paciente?.nome} movido para Em Análise`);
    carregarDados();
  }

  // 🔥 Mover renovação para Em Análise (cria solicitação espelho)
  async function moverPacoteParaAnalise(pacote: PacoteComDados) {
    // 1. Cria solicitação espelho
    const { error: errSol } = await supabase
      .from("solicitacoes_guia")
      .insert({
        paciente_id: pacote.paciente_id,
        plano: pacote.autorizacao?.plano || null,
        numero_carteirinha: pacote.paciente?.numero_carteirinha || null,
        status: "em_analise",
        observacoes: `Renovação da guia ${pacote.autorizacao?.numero_guia || "—"}`,
      });
    if (errSol) { toast.error("Erro ao criar solicitação: " + errSol.message); return; }

    // 2. Marca pacote antigo como dispensado (some de Pendentes)
    const { error: errPac } = await supabase
      .from("paciente_pacotes")
      .update({ dispensado_renovacao: true, status_renovacao: null })
      .eq("id", pacote.id);
    if (errPac) { toast.error("Erro ao atualizar pacote: " + errPac.message); return; }

    toast.success(`${pacote.paciente?.nome} movido para Em Análise`);
    carregarDados();
  }

  // 🔥 Voltar de Em Análise para Pendentes
  async function voltarParaPendentes(sol: SolicitacaoGuia) {
    const { error } = await supabase
      .from("solicitacoes_guia")
      .update({ status: "pendente" })
      .eq("id", sol.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(`${sol.paciente?.nome} voltou para Pendentes`);
    carregarDados();
  }

  // Cancelar solicitação
  async function cancelarSolicitacao(sol: SolicitacaoGuia) {
    if (!confirm(`Cancelar a solicitação de ${sol.paciente?.nome}?`)) return;
    const { error } = await supabase
      .from("solicitacoes_guia")
      .update({ status: "cancelada" })
      .eq("id", sol.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Solicitação cancelada");
    carregarDados();
  }

  // Alta programada
  async function darAlta(pacoteId: string, nome: string) {
    if (!confirm(`Marcar alta fisioterapêutica programada para ${nome}?`)) return;
    const { error } = await supabase.rpc("dar_alta_programada", { pacote_id: pacoteId });
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(`Alta programada para ${nome}`);
    carregarDados();
  }

  // Dispensar renovação
  async function dispensar(pacoteId: string, nome: string) {
    if (!confirm(`Remover ${nome} da lista de renovações?`)) return;
    const { error } = await supabase.rpc("dispensar_renovacao", { pacote_id: pacoteId });
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(`${nome} removido`);
    carregarDados();
  }

  // ============ MODAL GUIA RECEBIDA ============

  // 🔥 Abre modal de guia recebida a partir de uma solicitação
  function abrirModalGuiaRecebidaSolicitacao(sol: SolicitacaoGuia) {
    setGuiaRecebida(sol);
    setFormGuia({
      numero_guia: "",
      sessoes_autorizadas: 10,
      data_emissao: format(new Date(), "yyyy-MM-dd"),
      data_validade: "",
      observacoes: "",
    });
  }

  // 🔥 Abre modal de guia recebida a partir de um pacote (renovação)
  async function abrirModalGuiaRecebidaPacote(pacote: PacoteComDados) {
    // Cria solicitação espelho (status guia_recebida só quando confirmar)
    const { data: novaSol, error } = await supabase
      .from("solicitacoes_guia")
      .insert({
        paciente_id: pacote.paciente_id,
        plano: pacote.autorizacao?.plano || null,
        numero_carteirinha: pacote.paciente?.numero_carteirinha || null,
        status: "em_analise",
        observacoes: `Renovação da guia ${pacote.autorizacao?.numero_guia || "—"}`,
      })
      .select(`
        id, paciente_id, plano, numero_carteirinha, foto_pedido_url,
        observacoes, status, created_at,
        paciente:pacientes(id, nome, profissional_responsavel_id)
      `)
      .single();
    if (error) { toast.error("Erro: " + error.message); return; }

    // Marca pacote antigo como dispensado
    await supabase
      .from("paciente_pacotes")
      .update({ dispensado_renovacao: true, status_renovacao: null })
      .eq("id", pacote.id);

    setGuiaRecebida(novaSol as any);
    setFormGuia({
      numero_guia: "",
      sessoes_autorizadas: pacote.sessoes_totais || 10,
      data_emissao: format(new Date(), "yyyy-MM-dd"),
      data_validade: "",
      observacoes: `Renovação da guia ${pacote.autorizacao?.numero_guia || "—"}`,
    });
  }

  async function salvarGuiaRecebida() {
    if (!guiaRecebida) return;
    if (!formGuia.sessoes_autorizadas || formGuia.sessoes_autorizadas <= 0) {
      toast.error("Informe a quantidade de sessões autorizadas");
      return;
    }
    setSalvandoGuia(true);
    try {
      const { data: novaAut, error: autErr } = await supabase
        .from("autorizacoes")
        .insert({
          paciente_id: guiaRecebida.paciente_id,
          plano: guiaRecebida.plano || "—",
          numero_guia: formGuia.numero_guia || null,
          sessoes_autorizadas: formGuia.sessoes_autorizadas,
          sessoes_realizadas: 0,
          data_emissao: formGuia.data_emissao || null,
          data_validade: formGuia.data_validade || null,
          status: "ativa",
          observacoes: formGuia.observacoes || null,
        })
        .select()
        .single();
      if (autErr) throw autErr;

      await supabase.from("paciente_pacotes").insert({
        paciente_id: guiaRecebida.paciente_id,
        autorizacao_id: novaAut.id,
        sessoes_totais: formGuia.sessoes_autorizadas,
        sessoes_realizadas: 0,
        sessoes_restantes: formGuia.sessoes_autorizadas,
        preco_pago: 0,
        status_pagamento: "pago",
      });

      await supabase
        .from("solicitacoes_guia")
        .update({ status: "guia_recebida", autorizacao_id: novaAut.id })
        .eq("id", guiaRecebida.id);

      toast.success("Guia cadastrada com sucesso!");
      setGuiaRecebida(null);
      carregarDados();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setSalvandoGuia(false);
    }
  }

  async function baixarFoto(url: string, nomePaciente: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = url.split(".").pop()?.split("?")[0] || "jpg";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `pedido-${nomePaciente.replace(/\s+/g, "-")}-${Date.now()}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast.success("Download iniciado");
    } catch {
      toast.error("Erro ao baixar imagem");
    }
  }

  // ============ FILTROS E ORDENAÇÃO ============
  const pacotesFiltrados = useMemo(() => {
    return pacotes.filter(p => {
      if (filtroProfissional && p.profissional?.id !== filtroProfissional) return false;
      if (filtroPlano && p.autorizacao?.plano !== filtroPlano) return false;
      if (filtroUrgencia === "2" && p.sessoes_restantes !== 2) return false;
      if (filtroUrgencia === "1" && p.sessoes_restantes !== 1) return false;
      if (filtroUrgencia === "0" && p.sessoes_restantes !== 0) return false;
      if (filtroUrgencia === "solicitacao") return false;
      return true;
    });
  }, [pacotes, filtroProfissional, filtroPlano, filtroUrgencia]);

  const solicitacoesFiltradas = useMemo(() => {
    return solicitacoes.filter(s => {
      if (filtroProfissional && s.profissional?.id !== filtroProfissional) return false;
      if (filtroPlano && s.plano !== filtroPlano) return false;
      if (filtroUrgencia && filtroUrgencia !== "solicitacao") return false;
      return true;
    });
  }, [solicitacoes, filtroProfissional, filtroPlano, filtroUrgencia]);

  const listaOrdenada = useMemo((): ItemPendente[] => {
    const itens: ItemPendente[] = [];
    pacotesFiltrados.forEach(p => {
      let ordem = 4;
      if (p.sessoes_restantes === 0) ordem = 1;
      else if (p.sessoes_restantes === 1) ordem = 3;
      itens.push({ tipo: "renovacao", ordem, data: p });
    });
    solicitacoesFiltradas.forEach(s => {
      itens.push({ tipo: "solicitacao", ordem: 2, data: s });
    });
    return itens.sort((a, b) => a.ordem - b.ordem);
  }, [pacotesFiltrados, solicitacoesFiltradas]);

  const planosUnicos = useMemo(() => {
    const set = new Set<string>();
    pacotes.forEach(p => p.autorizacao?.plano && set.add(p.autorizacao.plano));
    solicitacoes.forEach(s => s.plano && set.add(s.plano));
    return [...set];
  }, [pacotes, solicitacoes]);

  const porPlano = useMemo(() => {
    const map: Record<string, { nome: string; ativos: number; pendentes: number; portal: string | null }> = {};
    planos.forEach(p => {
      map[p.nome] = { nome: p.nome, ativos: 0, pendentes: 0, portal: p.link_portal };
    });
    pacotesAtivos.forEach(p => {
      const nome = p.autorizacao?.plano;
      if (nome && map[nome]) map[nome].ativos++;
    });
    pacotes.forEach(p => {
      const nome = p.autorizacao?.plano;
      if (nome && map[nome]) map[nome].pendentes++;
    });
    return Object.values(map).filter(p => p.ativos > 0 || p.pendentes > 0);
  }, [pacotes, pacotesAtivos, planos]);

  const totalPendentes = pacotesFiltrados.length + solicitacoesFiltradas.length;

  if (loading) {
    return <div className="p-10 text-center text-muted-foreground animate-pulse">A carregar autorizações...</div>;
  }

  return (
    <div className="space-y-4 p-4 pb-10 max-w-7xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">Autorizações 📋</h1>
          <p className="text-xs text-muted-foreground font-medium">
            Gestão de guias e renovações de planos de saúde
          </p>
        </div>
        <Button size="sm" className="shadow-sm bg-slate-800" onClick={() => navigate("/pacientes")}>
          <FileCheck2 className="w-4 h-4 mr-2" /> Nova Autorização
        </Button>
      </div>

      <Card className="p-3 border shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 shrink-0">
            <Filter className="w-3.5 h-3.5" />
            <span className="uppercase tracking-wider">Filtros:</span>
          </div>

          <select className="text-xs h-8 px-2 rounded border bg-background" value={filtroPlano} onChange={(e) => setFiltroPlano(e.target.value)}>
            <option value="">Todos planos</option>
            {planosUnicos.map(p => (<option key={p} value={p}>{p}</option>))}
          </select>

          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg flex-wrap">
            <Button size="sm" variant={filtroUrgencia === "" ? "default" : "ghost"} onClick={() => setFiltroUrgencia("")} className="h-7 text-xs">Todos</Button>
            <Button size="sm" variant={filtroUrgencia === "0" ? "default" : "ghost"} onClick={() => setFiltroUrgencia("0")} className="h-7 text-xs">🔴 0</Button>
            <Button size="sm" variant={filtroUrgencia === "1" ? "default" : "ghost"} onClick={() => setFiltroUrgencia("1")} className="h-7 text-xs">🟠 1</Button>
            <Button size="sm" variant={filtroUrgencia === "2" ? "default" : "ghost"} onClick={() => setFiltroUrgencia("2")} className="h-7 text-xs">🟡 2</Button>
            <Button size="sm" variant={filtroUrgencia === "solicitacao" ? "default" : "ghost"} onClick={() => setFiltroUrgencia("solicitacao")} className="h-7 text-xs">🆕 Solicitações</Button>
          </div>

          <Badge variant="outline" className="ml-auto text-[10px] h-6">
            {totalPendentes} pendentes
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap border-t pt-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1">Profissional:</span>
          <Button
            size="sm"
            variant={filtroProfissional === "" ? "default" : "ghost"}
            onClick={() => setFiltroProfissional("")}
            className="h-6 text-[10px] px-2"
          >
            <User className="w-3 h-3 mr-1" /> Todos
          </Button>
          {profissionais.map(p => {
            const ativo = filtroProfissional === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setFiltroProfissional(ativo ? "" : p.id)}
                className={`h-6 text-[10px] px-2 rounded-full font-medium border transition-all ${
                  ativo ? "ring-2 ring-offset-1" : "opacity-70 hover:opacity-100"
                }`}
                style={{
                  backgroundColor: (p.cor_agenda || "#94a3b8") + (ativo ? "30" : "15"),
                  borderColor: p.cor_agenda || "#94a3b8",
                  color: p.cor_agenda || "#64748b",
                }}
              >
                {p.nome.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </Card>

      <Tabs defaultValue="pendentes" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="pendentes" className="text-xs">🚨 Pendentes ({totalPendentes})</TabsTrigger>
          <TabsTrigger value="analise" className="text-xs">⏳ Em Análise ({emAnalise.length})</TabsTrigger>
          <TabsTrigger value="ativas" className="text-xs">📋 Ativas ({pacotesAtivos.length})</TabsTrigger>
          <TabsTrigger value="planos" className="text-xs">📊 Por Plano</TabsTrigger>
          <TabsTrigger value="historico" className="text-xs">📜 Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes" className="space-y-3 mt-4">
          {listaOrdenada.length === 0 ? (
            <Card className="p-10 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma pendência no momento.</p>
            </Card>
          ) : (
            listaOrdenada.map(item => {
              if (item.tipo === "solicitacao") {
                return (
                  <CardSolicitacao
                    key={item.data.id}
                    sol={item.data}
                    onCancelar={() => cancelarSolicitacao(item.data)}
                    onPedirGuia={() => abrirPortalPlano(item.data.plano, item.data.paciente_id)}
                    onEmAnalise={() => moverSolicitacaoParaAnalise(item.data)}
                    onGuiaRecebida={() => abrirModalGuiaRecebidaSolicitacao(item.data)}
                    onAbrirFicha={() => navigate(`/pacientes/${item.data.paciente_id}`)}
                    onBaixarFoto={() => item.data.foto_pedido_url && baixarFoto(item.data.foto_pedido_url, item.data.paciente?.nome ?? "paciente")}
                  />
                );
              }
              return (
                <CardPaciente
                  key={item.data.id}
                  pacote={item.data}
                  onAlta={() => darAlta(item.data.id, item.data.paciente?.nome ?? "")}
                  onDispensar={() => dispensar(item.data.id, item.data.paciente?.nome ?? "")}
                  onPedirGuia={() => abrirPortalPlano(item.data.autorizacao?.plano, item.data.paciente_id)}
                  onEmAnalise={() => moverPacoteParaAnalise(item.data)}
                  onGuiaRecebida={() => abrirModalGuiaRecebidaPacote(item.data)}
                  onAbrirFicha={() => navigate(`/pacientes/${item.data.paciente_id}`)}
                />
              );
            })
          )}
        </TabsContent>

        <TabsContent value="analise" className="space-y-3 mt-4">
          {emAnalise.length === 0 ? (
            <Card className="p-10 text-center">
              <Clock className="w-10 h-10 text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma solicitação em análise.</p>
            </Card>
          ) : (
            emAnalise.map(s => (
              <CardSolicitacao
                key={s.id}
                sol={s}
                modoAnalise
                onCancelar={() => cancelarSolicitacao(s)}
                onVoltar={() => voltarParaPendentes(s)}
                onPedirGuia={() => abrirPortalPlano(s.plano, s.paciente_id)}
                onGuiaRecebida={() => abrirModalGuiaRecebidaSolicitacao(s)}
                onAbrirFicha={() => navigate(`/pacientes/${s.paciente_id}`)}
                onBaixarFoto={() => s.foto_pedido_url && baixarFoto(s.foto_pedido_url, s.paciente?.nome ?? "paciente")}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="ativas" className="mt-4">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-left">
                    <th className="p-3 font-bold uppercase tracking-wider text-slate-600">Paciente</th>
                    <th className="p-3 font-bold uppercase tracking-wider text-slate-600">Plano</th>
                    <th className="p-3 font-bold uppercase tracking-wider text-slate-600">Guia</th>
                    <th className="p-3 font-bold uppercase tracking-wider text-slate-600 text-center">Sessões</th>
                    <th className="p-3 font-bold uppercase tracking-wider text-slate-600">Profissional</th>
                    <th className="p-3 font-bold uppercase tracking-wider text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pacotesAtivos.map(p => {
                    const ratio = p.sessoes_totais > 0 ? p.sessoes_restantes / p.sessoes_totais : 0;
                    const cor = ratio > 0.5 ? "text-emerald-600" : ratio > 0.2 ? "text-amber-600" : "text-rose-600";
                    return (
                      <tr key={p.id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/pacientes/${p.paciente_id}`)}>
                        <td className="p-3 font-medium">{p.paciente?.nome}</td>
                        <td className="p-3">{p.autorizacao?.plano ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{p.autorizacao?.numero_guia ?? "—"}</td>
                        <td className={`p-3 text-center font-bold ${cor}`}>{p.sessoes_restantes}/{p.sessoes_totais}</td>
                        <td className="p-3">
                          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: p.profissional?.cor_agenda || "#94a3b8" }} />
                          {p.profissional?.nome?.split(" ")[0] ?? "—"}
                        </td>
                        <td className="p-3">
                          {p.alta_programada ? (
                            <Badge className="bg-purple-100 text-purple-700 text-[10px]">🏁 Alta</Badge>
                          ) : p.status_renovacao === "vai_renovar" ? (
                            <Badge className="bg-amber-100 text-amber-700 text-[10px]">Renovar</Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Ativa</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="planos" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {porPlano.length === 0 ? (
              <Card className="p-10 text-center col-span-full">
                <p className="text-sm text-muted-foreground">Nenhum plano com pacientes ativos.</p>
              </Card>
            ) : (
              porPlano.map(p => (
                <Card key={p.nome} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm">{p.nome}</h3>
                    {p.portal && (
                      <a href={p.portal} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="h-7 text-[10px]">
                          <ExternalLink className="w-3 h-3 mr-1" /> Portal
                        </Button>
                      </a>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-slate-50 rounded p-2">
                      <div className="text-lg font-bold text-emerald-600">{p.ativos}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">Ativos</div>
                    </div>
                    <div className="bg-amber-50 rounded p-2">
                      <div className="text-lg font-bold text-amber-600">{p.pendentes}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">Renovar</div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <HistoricoTab />
        </TabsContent>
      </Tabs>

      <Dialog open={!!guiaRecebida} onOpenChange={(o) => !o && setGuiaRecebida(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cadastrar Guia Recebida</DialogTitle>
          </DialogHeader>
          {guiaRecebida && (
            <div className="space-y-4 pt-2">
              <div className="text-xs bg-slate-50 border rounded p-3 space-y-1">
                <div><span className="font-medium">Paciente:</span> {guiaRecebida.paciente?.nome}</div>
                <div><span className="font-medium">Plano:</span> {guiaRecebida.plano || "—"}</div>
                <div><span className="font-medium">Carteirinha:</span> {guiaRecebida.numero_carteirinha || "—"}</div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nº da guia</label>
                <Input value={formGuia.numero_guia} onChange={(e) => setFormGuia({ ...formGuia, numero_guia: e.target.value })} placeholder="Ex: 12345/2026" />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Sessões autorizadas *</label>
                <Input type="number" min={1} value={formGuia.sessoes_autorizadas} onChange={(e) => setFormGuia({ ...formGuia, sessoes_autorizadas: parseInt(e.target.value) || 0 })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Emissão</label>
                  <Input type="date" value={formGuia.data_emissao} onChange={(e) => setFormGuia({ ...formGuia, data_emissao: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Validade</label>
                  <Input type="date" value={formGuia.data_validade} onChange={(e) => setFormGuia({ ...formGuia, data_validade: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Observações</label>
                <Textarea value={formGuia.observacoes} onChange={(e) => setFormGuia({ ...formGuia, observacoes: e.target.value })} rows={2} />
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={salvarGuiaRecebida} disabled={salvandoGuia}>
                  {salvandoGuia ? "Salvando..." : "✅ Cadastrar Guia"}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setGuiaRecebida(null)} disabled={salvandoGuia}>
                  Fechar (já cadastrei pela ficha)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =====================================================
// CARD DE PACIENTE (renovação)
// =====================================================
function CardPaciente({
  pacote, onAlta, onDispensar, onPedirGuia, onEmAnalise, onGuiaRecebida, onAbrirFicha,
}: {
  pacote: PacoteComDados;
  onAlta: () => void;
  onDispensar: () => void;
  onPedirGuia: () => void;
  onEmAnalise: () => void;
  onGuiaRecebida: () => void;
  onAbrirFicha: () => void;
}) {
  const cor = pacote.profissional?.cor_agenda || "#94a3b8";
  const sessoes = pacote.sessoes_restantes;
  const urgencia = sessoes === 0
    ? { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-300", label: "🔴 0 sessões" }
    : sessoes === 1
    ? { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300", label: "🟠 1 sessão" }
    : { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300", label: `🟡 ${sessoes} sessões` };

  return (
    <div className="rounded-lg border-l-4 shadow-sm overflow-hidden bg-white" style={{ borderLeftColor: cor }}>
      <div className="p-3" style={{ backgroundColor: cor + "10" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <button onClick={onAbrirFicha} className="font-bold text-slate-800 hover:text-indigo-600 text-sm truncate block w-full text-left">
              {pacote.paciente?.nome}
            </button>
            <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
              <div><span className="font-medium">Plano:</span> {pacote.autorizacao?.plano ?? "—"}</div>
              {pacote.paciente?.numero_carteirinha && (<div><span className="font-medium">Carteirinha:</span> {pacote.paciente.numero_carteirinha}</div>)}
              {pacote.autorizacao?.numero_guia && (<div><span className="font-medium">Guia:</span> {pacote.autorizacao.numero_guia}</div>)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge className="bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-bold">
              🔄 Renovação
            </Badge>
            <Badge className={`${urgencia.bg} ${urgencia.text} border ${urgencia.border} text-[10px] font-bold`}>
              {pacote.alta_programada ? "🏁 Alta" : urgencia.label}
            </Badge>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: cor + "20", color: cor }}>
              {pacote.profissional?.nome?.split(" ")[0] ?? "—"}
            </span>
          </div>
        </div>

        {/* Linha 1: ações secundárias */}
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={onDispensar}>
            <XCircle className="w-3 h-3 mr-1" /> Remover
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 border-purple-200 text-purple-700 hover:bg-purple-50" onClick={onAlta}>
            <Award className="w-3 h-3 mr-1" /> Alta
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 border-amber-200 text-amber-700 hover:bg-amber-50" onClick={onEmAnalise}>
            <Clock className="w-3 h-3 mr-1" /> Em Análise
          </Button>
        </div>

        {/* Linha 2: ações principais */}
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={onPedirGuia}>
            <ExternalLink className="w-3 h-3 mr-1" /> Pedir Guia
          </Button>
          <Button size="sm" className="h-7 text-[10px] flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={onGuiaRecebida}>
            <CheckCircle className="w-3 h-3 mr-1" /> Guia Recebida
          </Button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// CARD DE SOLICITAÇÃO
// =====================================================
function CardSolicitacao({
  sol, modoAnalise, onCancelar, onVoltar, onPedirGuia, onEmAnalise, onGuiaRecebida, onAbrirFicha, onBaixarFoto,
}: {
  sol: SolicitacaoGuia;
  modoAnalise?: boolean;
  onCancelar: () => void;
  onVoltar?: () => void;
  onPedirGuia: () => void;
  onEmAnalise?: () => void;
  onGuiaRecebida: () => void;
  onAbrirFicha: () => void;
  onBaixarFoto: () => void;
}) {
  const cor = sol.profissional?.cor_agenda || "#94a3b8";
  const dias = Math.floor((Date.now() - new Date(sol.created_at).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="rounded-lg border-l-4 shadow-sm overflow-hidden bg-white" style={{ borderLeftColor: cor }}>
      <div className="p-3" style={{ backgroundColor: cor + "10" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <button onClick={onAbrirFicha} className="font-bold text-slate-800 hover:text-indigo-600 text-sm truncate block w-full text-left">
              {sol.paciente?.nome}
            </button>
            <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
              <div><span className="font-medium">Plano:</span> {sol.plano || "—"}</div>
              {sol.numero_carteirinha && (<div><span className="font-medium">Carteirinha:</span> {sol.numero_carteirinha}</div>)}
              <div><span className="font-medium">Solicitada em:</span> {format(new Date(sol.created_at), "dd/MM/yyyy")} ({dias}d)</div>
              {sol.observacoes && (<div className="italic">"{sol.observacoes}"</div>)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {modoAnalise ? (
              <Badge className="bg-amber-100 text-amber-700 border border-amber-300 text-[10px] font-bold">
                ⏳ Em análise
              </Badge>
            ) : (
              <Badge className="bg-indigo-100 text-indigo-700 border border-indigo-300 text-[10px] font-bold">
                🆕 Primeira guia
              </Badge>
            )}
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: cor + "20", color: cor }}>
              {sol.profissional?.nome?.split(" ")[0] ?? "—"}
            </span>
          </div>
        </div>

        {sol.foto_pedido_url && (
          <div className="mt-3 flex items-center gap-2 p-2 bg-white/70 border rounded text-[11px]">
            <Paperclip className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-muted-foreground flex-1 truncate">Pedido médico anexado</span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => window.open(sol.foto_pedido_url!, "_blank")}>
              <Eye className="w-3 h-3 mr-1" /> Ver
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={onBaixarFoto}>
              <Download className="w-3 h-3 mr-1" /> Baixar
            </Button>
          </div>
        )}

        {/* Linha 1: ações secundárias */}
        <div className="flex gap-2 mt-3">
          {modoAnalise && onVoltar && (
            <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 border-slate-200 text-slate-700 hover:bg-slate-50" onClick={onVoltar}>
              <Undo2 className="w-3 h-3 mr-1" /> Voltar
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={onCancelar}>
            <XCircle className="w-3 h-3 mr-1" /> Cancelar
          </Button>
          {!modoAnalise && onEmAnalise && (
            <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 border-amber-200 text-amber-700 hover:bg-amber-50" onClick={onEmAnalise}>
              <Clock className="w-3 h-3 mr-1" /> Em Análise
            </Button>
          )}
        </div>

        {/* Linha 2: ações principais */}
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={onPedirGuia}>
            <ExternalLink className="w-3 h-3 mr-1" /> Pedir Guia
          </Button>
          <Button size="sm" className="h-7 text-[10px] flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={onGuiaRecebida}>
            <CheckCircle className="w-3 h-3 mr-1" /> Guia Recebida
          </Button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// ABA HISTÓRICO
// =====================================================
function HistoricoTab() {
  const [historico, setHistorico] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("autorizacoes")
        .select(`id, plano, numero_guia, sessoes_autorizadas, sessoes_realizadas, data_emissao, data_validade, status, paciente:pacientes(id, nome)`)
        .order("data_validade", { ascending: false })
        .limit(100);
      setHistorico(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-10 text-center text-xs text-muted-foreground animate-pulse">Carregando histórico...</div>;

  if (historico.length === 0) {
    return <Card className="p-10 text-center"><p className="text-sm text-muted-foreground">Nenhuma autorização registrada.</p></Card>;
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b">
            <tr className="text-left">
              <th className="p-3 font-bold uppercase tracking-wider text-slate-600">Paciente</th>
              <th className="p-3 font-bold uppercase tracking-wider text-slate-600">Plano</th>
              <th className="p-3 font-bold uppercase tracking-wider text-slate-600">Guia</th>
              <th className="p-3 font-bold uppercase tracking-wider text-slate-600">Emissão</th>
              <th className="p-3 font-bold uppercase tracking-wider text-slate-600">Validade</th>
              <th className="p-3 font-bold uppercase tracking-wider text-slate-600 text-center">Sessões</th>
              <th className="p-3 font-bold uppercase tracking-wider text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {historico.map(a => (
              <tr key={a.id} className="border-b hover:bg-slate-50">
                <td className="p-3 font-medium">{a.paciente?.nome ?? "—"}</td>
                <td className="p-3">{a.plano}</td>
                <td className="p-3 text-muted-foreground">{a.numero_guia ?? "—"}</td>
                <td className="p-3">{a.data_emissao ? format(new Date(a.data_emissao), "dd/MM/yy") : "—"}</td>
                <td className="p-3">{a.data_validade ? format(new Date(a.data_validade), "dd/MM/yy") : "—"}</td>
                <td className="p-3 text-center">{a.sessoes_realizadas ?? 0}/{a.sessoes_autorizadas ?? 0}</td>
                <td className="p-3"><Badge variant="outline" className="text-[10px]">{a.status ?? "—"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
