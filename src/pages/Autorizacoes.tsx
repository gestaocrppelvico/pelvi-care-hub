import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  FileText, AlertTriangle, CheckCircle, XCircle, Clock, 
  Filter, ExternalLink, Award, Phone
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type PlanoSaude = {
  id: string;
  nome: string;
  link_portal: string | null;
  ativo: boolean;
};

export default function Autorizacoes() {
  const navigate = useNavigate();
  const [pacotes, setPacotes] = useState<PacoteComDados[]>([]);
  const [pacotesAtivos, setPacotesAtivos] = useState<PacoteComDados[]>([]);
  const [planos, setPlanos] = useState<PlanoSaude[]>([]);
  const [profissionais, setProfissionais] = useState<{ id: string; nome: string; cor_agenda: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filtroProfissional, setFiltroProfissional] = useState<string>("");
  const [filtroPlano, setFiltroPlano] = useState<string>("");
  const [filtroUrgencia, setFiltroUrgencia] = useState<string>("");

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setLoading(true);
    try {
      // 1. Pacotes pendentes de renovação (status_renovacao = 'vai_renovar' e não dispensado)
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

      // 2. Todos os pacotes ativos de plano (para aba "Ativas")
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

      // 3. Planos de saúde
      const { data: planosData } = await supabase
        .from("planos_saude")
        .select("id, nome, link_portal, ativo")
        .eq("ativo", true)
        .order("nome");

      // 4. Profissionais
      const { data: profsData } = await supabase
        .from("profissionais")
        .select("id, nome, cor_agenda")
        .eq("ativo", true)
        .order("nome");

      // 5. Buscar profissionais para os pacotes
      const profMap = new Map((profsData ?? []).map(p => [p.id, p]));
      
      const enriquecer = (lista: any[]): PacoteComDados[] => {
        return (lista ?? []).map(p => ({
          ...p,
          profissional: p.paciente?.profissional_responsavel_id 
            ? profMap.get(p.paciente.profissional_responsavel_id) ?? null
            : null,
        }));
      };

      setPacotes(enriquecer(pendentes ?? []));
      setPacotesAtivos(enriquecer(ativos ?? []));
      setPlanos(planosData ?? []);
      setProfissionais(profsData ?? []);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar autorizações");
    } finally {
      setLoading(false);
    }
  }

  async function darAlta(pacoteId: string, pacienteNome: string) {
    if (!confirm(`Marcar alta fisioterapêutica programada para ${pacienteNome}?`)) return;
    const { error } = await supabase.rpc("dar_alta_programada", { pacote_id: pacoteId });
    if (error) {
      toast.error("Erro ao dar alta: " + error.message);
      return;
    }
    toast.success(`Alta programada para ${pacienteNome}`);
    carregarDados();
  }

  async function dispensar(pacoteId: string, pacienteNome: string) {
    if (!confirm(`Remover ${pacienteNome} da lista de renovações?`)) return;
    const { error } = await supabase.rpc("dispensar_renovacao", { pacote_id: pacoteId });
    if (error) {
      toast.error("Erro ao dispensar: " + error.message);
      return;
    }
    toast.success(`${pacienteNome} removido da lista`);
    carregarDados();
  }

  function pedirGuia(pacote: PacoteComDados) {
    const planoNome = pacote.autorizacao?.plano;
    const plano = planos.find(p => p.nome.toLowerCase() === planoNome?.toLowerCase());
    
    if (plano?.link_portal) {
      window.open(plano.link_portal, "_blank");
      toast.info(`Abrindo portal ${plano.nome}`);
    } else {
      toast.warning(`Portal do plano ${planoNome ?? "—"} não cadastrado. Cadastre em Configurações → Planos.`);
      navigate(`/pacientes/${pacote.paciente_id}`);
    }
  }

  // ===== Filtros =====
  const pacotesFiltrados = useMemo(() => {
    return pacotes.filter(p => {
      if (filtroProfissional && p.profissional?.id !== filtroProfissional) return false;
      if (filtroPlano && p.autorizacao?.plano !== filtroPlano) return false;
      if (filtroUrgencia === "2" && p.sessoes_restantes !== 2) return false;
      if (filtroUrgencia === "1" && p.sessoes_restantes !== 1) return false;
      if (filtroUrgencia === "0" && p.sessoes_restantes !== 0) return false;
      return true;
    });
  }, [pacotes, filtroProfissional, filtroPlano, filtroUrgencia]);

  const planosUnicos = useMemo(() => {
    const set = new Set(pacotes.map(p => p.autorizacao?.plano).filter(Boolean));
    return [...set];
  }, [pacotes]);

  // ===== Agrupamento por plano =====
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

  if (loading) {
    return <div className="p-10 text-center text-muted-foreground animate-pulse">A carregar autorizações...</div>;
  }

  return (
    <div className="space-y-4 p-4 pb-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">Autorizações 📋</h1>
          <p className="text-xs text-muted-foreground font-medium">
            Gestão de guias e renovações de planos de saúde
          </p>
        </div>
        <Button size="sm" className="shadow-sm bg-slate-800" onClick={() => navigate("/pacientes")}>
          <Phone className="w-4 h-4 mr-2" /> Nova Autorização
        </Button>
      </div>

      {/* Filtros */}
      <Card className="p-3 border shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 shrink-0">
            <Filter className="w-3.5 h-3.5" />
            <span className="uppercase tracking-wider">Filtros:</span>
          </div>

          <select
            className="text-xs h-8 px-2 rounded border bg-background"
            value={filtroProfissional}
            onChange={(e) => setFiltroProfissional(e.target.value)}
          >
            <option value="">Todos profissionais</option>
            {profissionais.map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>

          <select
            className="text-xs h-8 px-2 rounded border bg-background"
            value={filtroPlano}
            onChange={(e) => setFiltroPlano(e.target.value)}
          >
            <option value="">Todos planos</option>
            {planosUnicos.map(p => (
              <option key={p} value={p!}>{p}</option>
            ))}
          </select>

          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            <Button size="sm" variant={filtroUrgencia === "" ? "default" : "ghost"} onClick={() => setFiltroUrgencia("")} className="h-7 text-xs">Todos</Button>
            <Button size="sm" variant={filtroUrgencia === "2" ? "default" : "ghost"} onClick={() => setFiltroUrgencia("2")} className="h-7 text-xs">🟡 2</Button>
            <Button size="sm" variant={filtroUrgencia === "1" ? "default" : "ghost"} onClick={() => setFiltroUrgencia("1")} className="h-7 text-xs">🟠 1</Button>
            <Button size="sm" variant={filtroUrgencia === "0" ? "default" : "ghost"} onClick={() => setFiltroUrgencia("0")} className="h-7 text-xs">🔴 0</Button>
          </div>

          <Badge variant="outline" className="ml-auto text-[10px] h-6">
            {pacotesFiltrados.length} pendentes
          </Badge>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="pendentes" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pendentes">🚨 Pendentes ({pacotesFiltrados.length})</TabsTrigger>
          <TabsTrigger value="ativas">📋 Ativas ({pacotesAtivos.length})</TabsTrigger>
          <TabsTrigger value="planos">📊 Por Plano</TabsTrigger>
          <TabsTrigger value="historico">📜 Histórico</TabsTrigger>
        </TabsList>

        {/* ===== ABA 1: PENDENTES ===== */}
        <TabsContent value="pendentes" className="space-y-3 mt-4">
          {pacotesFiltrados.length === 0 ? (
            <Card className="p-10 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma renovação pendente com esses filtros.</p>
            </Card>
          ) : (
            pacotesFiltrados.map(p => (
              <CardPaciente
                key={p.id}
                pacote={p}
                onAlta={() => darAlta(p.id, p.paciente?.nome ?? "")}
                onDispensar={() => dispensar(p.id, p.paciente?.nome ?? "")}
                onPedirGuia={() => pedirGuia(p)}
                onAbrirFicha={() => navigate(`/pacientes/${p.paciente_id}`)}
              />
            ))
          )}
        </TabsContent>

        {/* ===== ABA 2: ATIVAS ===== */}
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
                        <td className={`p-3 text-center font-bold ${cor}`}>
                          {p.sessoes_restantes}/{p.sessoes_totais}
                        </td>
                        <td className="p-3">
                          <span 
                            className="inline-block w-2 h-2 rounded-full mr-1.5" 
                            style={{ backgroundColor: p.profissional?.cor_agenda || "#94a3b8" }}
                          />
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

        {/* ===== ABA 3: POR PLANO ===== */}
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

        {/* ===== ABA 4: HISTÓRICO ===== */}
        <TabsContent value="historico" className="mt-4">
          <HistoricoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================
// COMPONENTE: CARD DO PACIENTE (aba pendentes)
// =====================================================
function CardPaciente({
  pacote,
  onAlta,
  onDispensar,
  onPedirGuia,
  onAbrirFicha,
}: {
  pacote: PacoteComDados;
  onAlta: () => void;
  onDispensar: () => void;
  onPedirGuia: () => void;
  onAbrirFicha: () => void;
}) {
  const cor = pacote.profissional?.cor_agenda || "#94a3b8";
  const sessoes = pacote.sessoes_restantes;
  
  const urgencia = sessoes === 0 
    ? { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-300", label: "0 sessões" }
    : sessoes === 1 
    ? { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300", label: "1 sessão" }
    : { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300", label: `${sessoes} sessões` };

  return (
    <div 
      className="rounded-lg border-l-4 shadow-sm overflow-hidden bg-white"
      style={{ borderLeftColor: cor }}
    >
      <div className="p-3" style={{ backgroundColor: cor + "10" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <button 
              onClick={onAbrirFicha}
              className="font-bold text-slate-800 hover:text-indigo-600 text-sm truncate block w-full text-left"
            >
              {pacote.paciente?.nome}
            </button>
            <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
              <div><span className="font-medium">Plano:</span> {pacote.autorizacao?.plano ?? "—"}</div>
              {pacote.paciente?.numero_carteirinha && (
                <div><span className="font-medium">Carteirinha:</span> {pacote.paciente.numero_carteirinha}</div>
              )}
              {pacote.autorizacao?.numero_guia && (
                <div><span className="font-medium">Guia:</span> {pacote.autorizacao.numero_guia}</div>
              )}
              {pacote.autorizacao?.data_validade && (
                <div><span className="font-medium">Validade:</span> {format(new Date(pacote.autorizacao.data_validade), "dd/MM/yyyy")}</div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Badge className={`${urgencia.bg} ${urgencia.text} border ${urgencia.border} text-[10px] font-bold`}>
              {pacote.alta_programada ? "🏁 Alta programada" : urgencia.label}
            </Badge>
            <span 
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: cor + "20", color: cor }}
            >
              {pacote.profissional?.nome?.split(" ")[0] ?? "—"}
            </span>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <Button 
            size="sm" 
            variant="outline" 
            className="h-7 text-[10px] flex-1 border-rose-200 text-rose-700 hover:bg-rose-50"
            onClick={onDispensar}
          >
            <XCircle className="w-3 h-3 mr-1" /> Remover
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            className="h-7 text-[10px] flex-1 border-purple-200 text-purple-700 hover:bg-purple-50"
            onClick={onAlta}
          >
            <Award className="w-3 h-3 mr-1" /> Alta
          </Button>
          <Button 
            size="sm"
            className="h-7 text-[10px] flex-1 bg-indigo-600 hover:bg-indigo-700"
            onClick={onPedirGuia}
          >
            <ExternalLink className="w-3 h-3 mr-1" /> Pedir Guia
          </Button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// COMPONENTE: ABA HISTÓRICO
// =====================================================
function HistoricoTab() {
  const [historico, setHistorico] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Autorizações com validade expirada ou sessões esgotadas
      const { data } = await supabase
        .from("autorizacoes")
        .select(`
          id, plano, numero_guia, sessoes_autorizadas, sessoes_realizadas,
          data_emissao, data_validade, status,
          paciente:pacientes(id, nome)
        `)
        .order("data_validade", { ascending: false })
        .limit(100);
      setHistorico(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-10 text-center text-xs text-muted-foreground animate-pulse">Carregando histórico...</div>;

  if (historico.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-muted-foreground">Nenhuma autorização registrada.</p>
      </Card>
    );
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
                <td className="p-3">
                  <Badge variant="outline" className="text-[10px]">{a.status ?? "—"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
