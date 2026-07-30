import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Wallet, Package, Settings, CheckCircle2, Activity, Undo2, Pencil, 
  Search, ArrowUpDown, AlertTriangle, Check, X, DollarSign 
} from "lucide-react";
import { toast } from "sonner";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfDay, endOfDay, format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ===== INTERFACES =====
interface RepasseRow {
  id: string;
  atendimento_id: string;
  profissional_id: string;
  valor_atendimento: number;
  valor_repasse: number;
  status: string;
  created_at: string;
  observacoes?: string | null;
  profissional?: { id: string; nome: string; cor_agenda: string };
  atendimento?: { 
    tipo: string; 
    data_inicio: string; 
    google_event_id?: string | null;
    paciente?: { nome: string } 
  };
}

interface FaltaRow {
  id: string;
  data_inicio: string;
  paciente_id: string;
  profissional_id: string;
  tipo: string;
  paciente_pacote_id: string | null;
  servico_id: string | null;
  paciente: { nome: string } | null;
  profissional: { id: string; nome: string } | null;
  paciente_pacote?: {
    id: string;
    preco_pago: number;
    sessoes_totais: number;
    sessoes_realizadas: number;
    autorizacao_id: string | null;
    pacote_id: string | null;
    servico_id: string | null;
  } | null;
  falta_cobrada?: boolean;
}

type Ordenacao = "data_desc" | "data_asc" | "paciente_asc" | "valor_repasse_desc" | "valor_repasse_asc" | "valor_atendimento_desc";

// ===== COMPONENTE PRINCIPAL =====
export default function Financeiro() {
  const { isAdmin, isSecretaria, isFisio } = useAuth();
  const podeGerenciar = isAdmin || isSecretaria;

  // ----- TODOS OS STATES -----
  const [repasses, setRepasses] = useState<RepasseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroProfissional, setFiltroProfissional] = useState<string>("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>("semana");
  const [buscaPaciente, setBuscaPaciente] = useState<string>("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("data_desc");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [editando, setEditando] = useState<RepasseRow | null>(null);
  const [valorAtendimento, setValorAtendimento] = useState("");
  const [valorRepasse, setValorRepasse] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [fatorRecalculo, setFatorRecalculo] = useState(0.35);
  const [activeTab, setActiveTab] = useState("pendentes");

  // Estados para faltas
  const [faltas, setFaltas] = useState<FaltaRow[]>([]);
  const [loadingFaltas, setLoadingFaltas] = useState(false);
  const [filtroFaltasProfissional, setFiltroFaltasProfissional] = useState<string>("todos");
  const [filtroFaltasPeriodo, setFiltroFaltasPeriodo] = useState<string>("mes");

  // ----- FUNÇÃO PARA FORMATAR MOEDA -----
  const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // ----- CARREGAR REPASSES -----
  async function carregar() {
    setLoading(true);
    const { data } = await supabase
      .from("repasses_atendimento")
      .select(`*, profissional:profissionais(id, nome, cor_agenda), atendimento:atendimentos(tipo, data_inicio, google_event_id, paciente:pacientes(nome))`)
      .order("created_at", { ascending: false })
      .limit(500);
    setRepasses((data as any[]) ?? []);
    setLoading(false);
  }

  // ----- CARREGAR FALTAS (CORRIGIDO) -----
  async function carregarFaltas() {
    setLoadingFaltas(true);
    try {
      let start, end;
      const hoje = new Date();
      if (filtroFaltasPeriodo === "semana") {
        start = startOfWeek(hoje, { weekStartsOn: 1 });
        end = endOfWeek(hoje, { weekStartsOn: 1 });
      } else if (filtroFaltasPeriodo === "mes") {
        start = startOfMonth(hoje);
        end = endOfMonth(hoje);
      } else {
        start = new Date(0);
        end = new Date(8640000000000000);
      }

      let query = supabase
        .from("atendimentos")
        .select(`
          id,
          data_inicio,
          paciente_id,
          profissional_id,
          tipo,
          paciente_pacote_id,
          servico_id,
          falta_cobrada,
          paciente:pacientes(nome),
          profissional:profissionais(id, nome),
          paciente_pacote:paciente_pacotes!atendimentos_paciente_pacote_id_fkey(
            id,
            preco_pago,
            sessoes_totais,
            sessoes_realizadas,
            autorizacao_id,
            pacote_id,
            servico_id
          )
        `)
        .eq("status", "faltou")
        .gte("data_inicio", start.toISOString())
        .lte("data_inicio", end.toISOString());

      if (filtroFaltasProfissional !== "todos") {
        query = query.eq("profissional_id", filtroFaltasProfissional);
      }

      const { data, error } = await query;
      if (error) throw error;
      setFaltas(data || []);
    } catch (err: any) {
      toast.error("Erro ao carregar faltas: " + err.message);
    } finally {
      setLoadingFaltas(false);
    }
  }

  // ----- EFFECTS -----
  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    if (activeTab === "faltas") {
      carregarFaltas();
    }
  }, [activeTab, filtroFaltasProfissional, filtroFaltasPeriodo]);

  // ----- LISTA DE PROFISSIONAIS PARA FILTROS -----
  const profissionaisFiltro = useMemo(() => {
    const lista = new Map();
    repasses.forEach(r => {
      if (r.profissional) lista.set(r.profissional.id, r.profissional.nome);
    });
    return Array.from(lista.entries()).map(([id, nome]) => ({ id, nome }));
  }, [repasses]);

  // ----- FILTROS E ORDENAÇÃO DOS REPASSES -----
  const repassesFiltrados = useMemo(() => {
    let filtrados = repasses;
    
    if (filtroProfissional !== "todos") {
      filtrados = filtrados.filter(r => r.profissional_id === filtroProfissional);
    }
    
    if (filtroPeriodo !== "todos") {
      const hoje = new Date();
      let start, end;
      
      if (filtroPeriodo === "semana") { 
        start = startOfWeek(hoje, { weekStartsOn: 1 }); 
        end = endOfWeek(hoje, { weekStartsOn: 1 }); 
      } else if (filtroPeriodo === "mes") { 
        start = startOfMonth(hoje); 
        end = endOfMonth(hoje); 
      } else if (filtroPeriodo === "personalizado") {
        start = dataInicio ? startOfDay(parseISO(dataInicio)) : new Date(0);
        end = dataFim ? endOfDay(parseISO(dataFim)) : new Date(8640000000000000);
      }
      
      if (start && end) {
        filtrados = filtrados.filter(r => isWithinInterval(parseISO(r.created_at), { start, end }));
      }
    }

    if (buscaPaciente.trim() !== "") {
      const termo = buscaPaciente.trim().toLowerCase();
      filtrados = filtrados.filter(r => 
        r.atendimento?.paciente?.nome?.toLowerCase().includes(termo) ?? false
      );
    }

    const comparar = (a: RepasseRow, b: RepasseRow) => {
      switch (ordenacao) {
        case "data_desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "data_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "paciente_asc":
          const nomeA = a.atendimento?.paciente?.nome || "";
          const nomeB = b.atendimento?.paciente?.nome || "";
          return nomeA.localeCompare(nomeB);
        case "valor_repasse_desc":
          return Number(b.valor_repasse) - Number(a.valor_repasse);
        case "valor_repasse_asc":
          return Number(a.valor_repasse) - Number(b.valor_repasse);
        case "valor_atendimento_desc":
          return Number(b.valor_atendimento) - Number(a.valor_atendimento);
        default:
          return 0;
      }
    };

    return [...filtrados].sort(comparar);
  }, [repasses, filtroProfissional, filtroPeriodo, dataInicio, dataFim, buscaPaciente, ordenacao]);

  const pendentes = repassesFiltrados.filter(r => r.status === "pendente");
  const conferidos = repassesFiltrados.filter(r => r.status === "conferido" || r.status === "pago");
  
  const totalPendente = pendentes.reduce((s, r) => s + Number(r.valor_repasse), 0);
  const totalConferido = conferidos.reduce((s, r) => s + Number(r.valor_repasse), 0);
  const totalReceitas = repassesFiltrados.reduce((s, r) => s + Number(r.valor_atendimento), 0);

  // ----- FUNÇÕES DE AÇÃO -----
  async function atualizarStatus(id: string, status: string) {
    const { error } = await supabase.from("repasses_atendimento").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Repasse alterado para ${status}`);
    carregar();
  }

  async function conferirVisiveis() {
    if (pendentes.length === 0) return;
    if (!confirm(`Confirmar todos os ${pendentes.length} repasses visíveis?`)) return;
    const ids = pendentes.map(r => r.id);
    const { error } = await supabase.from("repasses_atendimento").update({ status: "conferido" }).in("id", ids);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Todos conferidos!");
    carregar();
  }

  async function salvarEdicao() {
    if (!editando) return;
    const { error } = await supabase.from("repasses_atendimento")
      .update({ 
        valor_atendimento: parseFloat(valorAtendimento), 
        valor_repasse: parseFloat(valorRepasse),
        observacoes: justificativa.trim() || null
      })
      .eq("id", editando.id);
      
    if (error) { toast.error(error.message); return; }
    toast.success("Valores e justificativa atualizados!");
    setEditando(null);
    setJustificativa("");
    carregar();
  }

  function handleMudancaAtendimento(val: string) {
    setValorAtendimento(val);
    const numero = parseFloat(val.replace(",", "."));
    if (!isNaN(numero)) {
      setValorRepasse((numero * fatorRecalculo).toFixed(2));
    } else {
      setValorRepasse("");
    }
  }

  // ----- FUNÇÕES PARA FALTAS (AJUSTADAS) -----
  async function handleAbonarFalta(faltaId: string) {
    if (!confirm("Deseja abonar esta falta? O atendimento será cancelado.")) return;
    try {
      const { error } = await supabase
        .from("atendimentos")
        .update({ 
          status: "cancelado", 
          observacoes: "Falta abonada pela administração" 
        })
        .eq("id", faltaId);
      if (error) throw error;
      toast.success("Falta abonada com sucesso!");
      carregarFaltas();
      carregar();
    } catch (err: any) {
      toast.error("Erro ao abonar: " + err.message);
    }
  }

  async function handleCobrarFalta(falta: FaltaRow) {
    if (!falta.paciente_pacote_id) {
      toast.error("Este atendimento não está vinculado a um pacote. Não é possível cobrar.");
      return;
    }

    if (!confirm(`Deseja cobrar a falta de ${falta.paciente?.nome}? Isso irá descontar uma sessão e gerar um repasse.`)) return;

    try {
      const pacote = falta.paciente_pacote;
      if (!pacote) {
        toast.error("Dados do pacote não encontrados.");
        return;
      }

      const ehPlano = pacote.autorizacao_id !== null;
      const precoPago = pacote.preco_pago || 0;
      const sessoesTotais = pacote.sessoes_totais || 1;
      let valorSessao = 0;
      let valorRepasseCalculado = 0;

      // Buscar regra de repasse
      const { data: regras } = await supabase
        .from("repasses_servico")
        .select("*")
        .eq("profissional_id", falta.profissional_id)
        .eq("ativo", true)
        .order("created_at", { ascending: true });

      if (ehPlano) {
        valorSessao = 0;
        const regraFixa = regras?.find(r => r.tipo_repasse === "fixo" && r.ativo);
        valorRepasseCalculado = regraFixa?.valor_repasse || 45.50;
      } else {
        valorSessao = precoPago / sessoesTotais;
        const regraPercentual = regras?.find(r => r.tipo_repasse === "percentual" && r.ativo);
        const percentual = regraPercentual?.valor_repasse || 35;
        valorRepasseCalculado = valorSessao * (percentual / 100);
      }

      // Atualizar sessões
      const { error: updateError } = await supabase
        .from("paciente_pacotes")
        .update({
          sessoes_realizadas: pacote.sessoes_realizadas + 1,
          sessoes_restantes: pacote.sessoes_totais - (pacote.sessoes_realizadas + 1)
        })
        .eq("id", pacote.id);
      if (updateError) throw updateError;

      // Inserir repasse
      const { error: insertError } = await supabase
        .from("repasses_atendimento")
        .insert({
          atendimento_id: falta.id,
          profissional_id: falta.profissional_id,
          valor_atendimento: valorSessao,
          valor_repasse: valorRepasseCalculado,
          status: "pendente",
          observacoes: "Gerado por falta cobrada"
        });
      if (insertError) throw insertError;

      await supabase
        .from("atendimentos")
        .update({ falta_cobrada: true })
        .eq("id", falta.id);

      toast.success(`Falta cobrada! Repasse de ${formatBRL(valorRepasseCalculado)} gerado.`);
      carregarFaltas();
      carregar();
    } catch (err: any) {
      toast.error("Erro ao cobrar falta: " + err.message);
    }
  }

  // ----- RENDER -----
  if (isFisio && !isAdmin && !isSecretaria) {
    return (
      <div className="p-8 text-center mt-10 space-y-4">
        <h2 className="text-xl font-bold text-slate-700">Acesso Restrito</h2>
        <p className="text-muted-foreground">Seu resumo financeiro agora está disponível na sua página de Início (Dashboard).</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Financeiro</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Link to="/financeiro/servicos">
          <Card className="p-3 flex items-center gap-2 hover:bg-accent transition-colors h-full">
            <Package className="w-5 h-5 text-primary" />
            <div className="font-medium text-sm">Serviços e Pacotes</div>
          </Card>
        </Link>
        {isAdmin && (
          <Link to="/financeiro/repasses">
            <Card className="p-3 flex items-center gap-2 hover:bg-accent transition-colors h-full">
              <Settings className="w-5 h-5 text-primary" />
              <div className="font-medium text-sm">Regras de Repasse</div>
            </Card>
          </Link>
        )}
        <Link to="/financeiro/relatorios">
          <Card className="p-3 flex items-center gap-2 hover:bg-emerald-50 transition-colors h-full border-emerald-200">
            <Activity className="w-5 h-5 text-emerald-600" />
            <div className="font-medium text-sm text-emerald-800">Relatórios</div>
          </Card>
        </Link>
      </div>

      {/* Filtros principais */}
      <div className="flex flex-col sm:flex-row gap-3 p-3 bg-muted/50 rounded-lg border flex-wrap items-center">
        <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semana">Esta Semana</SelectItem>
            <SelectItem value="mes">Este Mês</SelectItem>
            <SelectItem value="todos">Tudo</SelectItem>
            <SelectItem value="personalizado">Período Específico</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={filtroProfissional} onValueChange={setFiltroProfissional}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Profissional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {profissionaisFiltro.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filtroPeriodo === "personalizado" && (
          <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 bg-background p-1 rounded-md border">
            <Input 
              type="date" 
              value={dataInicio} 
              onChange={(e) => setDataInicio(e.target.value)} 
              className="h-8 border-none focus-visible:ring-0 w-[130px] text-sm" 
            />
            <span className="text-xs text-muted-foreground font-medium">até</span>
            <Input 
              type="date" 
              value={dataFim} 
              onChange={(e) => setDataFim(e.target.value)} 
              className="h-8 border-none focus-visible:ring-0 w-[130px] text-sm" 
            />
          </div>
        )}

        <div className="relative w-full sm:w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar paciente..."
            value={buscaPaciente}
            onChange={(e) => setBuscaPaciente(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as Ordenacao)}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <ArrowUpDown className="w-4 h-4 mr-1" />
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="data_desc">Data (mais recente)</SelectItem>
            <SelectItem value="data_asc">Data (mais antiga)</SelectItem>
            <SelectItem value="paciente_asc">Paciente (A-Z)</SelectItem>
            <SelectItem value="valor_repasse_desc">Repasse (maior)</SelectItem>
            <SelectItem value="valor_repasse_asc">Repasse (menor)</SelectItem>
            <SelectItem value="valor_atendimento_desc">Atendimento (maior)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Receita</div>
          <div className="font-bold">{formatBRL(totalReceitas)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Pendentes</div>
          <div className="font-bold text-amber-600">{formatBRL(totalPendente)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Conferidos</div>
          <div className="font-bold text-emerald-600">{formatBRL(totalConferido)}</div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="pendentes" className="flex-1">
            Pendentes ({pendentes.length})
          </TabsTrigger>
          <TabsTrigger value="conferidos" className="flex-1">
            Conferidos ({conferidos.length})
          </TabsTrigger>
          <TabsTrigger value="faltas" className="flex-1">
            Faltas ({faltas.length})
          </TabsTrigger>
        </TabsList>
        
        {/* ABA: PENDENTES */}
        <TabsContent value="pendentes" className="space-y-3 mt-3">
          {podeGerenciar && pendentes.length > 0 && (
            <Button onClick={conferirVisiveis} className="w-full bg-emerald-600">
              Conferir {pendentes.length} visíveis
            </Button>
          )}
          {pendentes.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhum repasse pendente.
            </Card>
          ) : (
            pendentes.map((r) => (
              <Card key={r.id} className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="font-semibold text-slate-800">{r.profissional?.nome}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Paciente: {r.atendimento?.paciente?.nome || "—"}
                  </div>
                  {r.atendimento?.data_inicio && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <span>Data: {format(parseISO(r.atendimento.data_inicio), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                      {!r.atendimento?.google_event_id && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] h-4 py-0 px-1.5 font-medium">
                          Lançamento Manual
                        </Badge>
                      )}
                    </div>
                  )}
                  <div className="font-bold text-amber-600 mt-1.5">{formatBRL(Number(r.valor_repasse))}</div>
                  {r.observacoes && (
                    <div className="text-[11px] text-slate-600 italic bg-amber-50/40 border border-amber-100 rounded px-2 py-1 mt-1.5 max-w-md">
                      Motivo: {r.observacoes}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditando(r);
                    setValorAtendimento(String(r.valor_atendimento));
                    setValorRepasse(String(r.valor_repasse));
                    setJustificativa(r.observacoes || "");
                    const vAtend = Number(r.valor_atendimento);
                    const vRep = Number(r.valor_repasse);
                    if (vAtend > 0) setFatorRecalculo(vRep / vAtend);
                    else setFatorRecalculo(0.35);
                  }}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => atualizarStatus(r.id, "conferido")}>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </Button>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ABA: CONFERIDOS */}
        <TabsContent value="conferidos" className="space-y-3 mt-3">
          {conferidos.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhum repasse conferido.
            </Card>
          ) : (
            conferidos.map((r) => (
              <Card key={r.id} className="p-4 flex items-center gap-4 bg-slate-50/70 border-slate-100">
                <div className="flex-1">
                  <div className="font-semibold text-slate-700">{r.profissional?.nome}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Paciente: {r.atendimento?.paciente?.nome || "—"}
                  </div>
                  {r.atendimento?.data_inicio && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <span>Data: {format(parseISO(r.atendimento.data_inicio), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                      {!r.atendimento?.google_event_id && (
                        <Badge variant="outline" className="bg-amber-50/50 text-amber-700 border-amber-200/60 text-[10px] h-4 py-0 px-1.5 font-medium">
                          Lançamento Manual
                        </Badge>
                      )}
                    </div>
                  )}
                  <div className="font-bold text-emerald-600 mt-1.5">{formatBRL(Number(r.valor_repasse))}</div>
                  {r.observacoes && (
                    <div className="text-[11px] text-slate-600 italic bg-background border rounded px-2 py-1 mt-1.5 max-w-md">
                      Motivo: {r.observacoes}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditando(r);
                    setValorAtendimento(String(r.valor_atendimento));
                    setValorRepasse(String(r.valor_repasse));
                    setJustificativa(r.observacoes || "");
                    const vAtend = Number(r.valor_atendimento);
                    const vRep = Number(r.valor_repasse);
                    if (vAtend > 0) setFatorRecalculo(vRep / vAtend);
                    else setFatorRecalculo(0.35);
                  }}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => atualizarStatus(r.id, "pendente")}>
                    <Undo2 className="w-4 h-4 text-slate-500" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => atualizarStatus(r.id, "pago")}>
                    <DollarSign className="w-4 h-4 text-green-600" />
                  </Button>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ABA: FALTAS */}
        <TabsContent value="faltas" className="space-y-3 mt-3">
          <div className="flex flex-col sm:flex-row gap-2 p-2 bg-muted/30 rounded-lg border flex-wrap items-center">
            <Select value={filtroFaltasPeriodo} onValueChange={setFiltroFaltasPeriodo}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semana">Esta Semana</SelectItem>
                <SelectItem value="mes">Este Mês</SelectItem>
                <SelectItem value="todos">Tudo</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filtroFaltasProfissional} onValueChange={setFiltroFaltasProfissional}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Profissional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {profissionaisFiltro.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={carregarFaltas} className="ml-auto">
              Atualizar
            </Button>
          </div>

          {loadingFaltas ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Carregando faltas...</div>
          ) : faltas.length === 0 ? (
            <Card className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">Nenhuma falta registrada no período.</p>
            </Card>
          ) : (
            faltas.map((falta) => {
              const data = format(parseISO(falta.data_inicio), "dd/MM/yyyy HH:mm", { locale: ptBR });
              const ehPlano = falta.tipo === "Plano" || falta.paciente_pacote?.autorizacao_id !== null;
              const jaCobrada = falta.falta_cobrada;

              return (
                <Card key={falta.id} className={`p-4 border-l-4 ${jaCobrada ? 'border-l-emerald-500' : 'border-l-red-400'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-800">{falta.paciente?.nome || "Paciente"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {falta.profissional?.nome || "Profissional"} · {data}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <Badge variant={ehPlano ? "default" : "outline"} className="text-[10px]">
                          {ehPlano ? "Plano" : "Particular"}
                        </Badge>
                        {jaCobrada && (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                            Cobrada
                          </Badge>
                        )}
                      </div>
                      {falta.paciente_pacote && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Sessões: {falta.paciente_pacote.sessoes_realizadas || 0}/{falta.paciente_pacote.sessoes_totais}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {!jaCobrada ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => handleCobrarFalta(falta)}
                          >
                            <DollarSign className="w-4 h-4 mr-1" /> Cobrar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-slate-600"
                            onClick={() => handleAbonarFalta(falta.id)}
                          >
                            <X className="w-4 h-4 mr-1" /> Abonar
                          </Button>
                        </>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-800 px-3 py-1 text-xs">
                          <Check className="w-3 h-3 mr-1" /> Cobrada
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      {/* MODAL DE EDIÇÃO */}
      <Dialog open={!!editando} onOpenChange={() => setEditando(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Valores de Repasse</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Valor Atendimento (Total Pago)</Label>
              <Input 
                value={valorAtendimento} 
                onChange={(e) => handleMudancaAtendimento(e.target.value)} 
              />
            </div>
            <div>
              <Label>Valor do Repasse da Profissional</Label>
              <Input 
                value={valorRepasse} 
                onChange={(e) => setValorRepasse(e.target.value.replace(",", "."))} 
              />
            </div>
            
            <div className="space-y-1.5">
              <Label>Justificativa / Motivo da Alteração</Label>
              <Textarea 
                placeholder="Ex: Ajuste manual devido a bônus acordado ou valor diferenciado cobrado por fora..."
                value={justificativa} 
                onChange={(e) => setJustificativa(e.target.value)} 
                rows={3}
              />
            </div>
            
            <Button onClick={salvarEdicao} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
