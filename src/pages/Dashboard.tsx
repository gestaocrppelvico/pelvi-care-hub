import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  Calendar, Users, AlertTriangle, CheckCircle, XCircle, 
  TrendingUp, Activity, DollarSign, Stethoscope, Clock, FileText, Award
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, subDays, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';

// Painéis Secundários
import DashboardFisio from "./DashboardFisio";
import DashboardSecretaria from "./DashboardSecretaria";

const CORES_PIZZA = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function Dashboard() {
  const { user, isFisio, isSecretaria, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(true);

  // ===== Estados de Auditoria (Ações) =====
  const [faltasPendentes, setFaltasPendentes] = useState<any[]>([]);
  const [evolucoesAtrasadas, setEvolucoesAtrasadas] = useState<any[]>([]);
  const [guiasRenovar, setGuiasRenovar] = useState<any[]>([]);

  // ===== Estados de BI (Gráficos e KPIs) =====
  const [atendimentosMes, setAtendimentosMes] = useState<any[]>([]);
  const [distribuicaoConvenios, setDistribuicaoConvenios] = useState<any[]>([]);
  const [totalPac, setTotalPac] = useState(0);
  const [pacAtivos, setPacAtivos] = useState(0);
  const [totalProf, setTotalProf] = useState(0);
  const [atendHoje, setAtendHoje] = useState(0);
  const [repassesPend, setRepassesPend] = useState(0);
  const [repassesPg, setRepassesPg] = useState(0);
  const [faturamentoMes, setFaturamentoMes] = useState(0);
  const [avaliacoesMes, setAvaliacoesMes] = useState(0);
  const [novosTratamentosMes, setNovosTratamentosMes] = useState(0);
  const [novosTratamentosManual, setNovosTratamentosManual] = useState(0);
  const [altasMes, setAltasMes] = useState(0);
  const [topAltasProfissionais, setTopAltasProfissionais] = useState<{ nome: string; count: number }[]>([]);
  const [topProfissionais, setTopProfissionais] = useState<{ nome: string; count: number }[]>([]);
  const [topServicos, setTopServicos] = useState<{ nome: string; count: number }[]>([]);
  const [medicosCadastrados, setMedicosCadastrados] = useState(0);
  const [medicosVisitados, setMedicosVisitados] = useState(0);
  const [pacotesAtivos, setPacotesAtivos] = useState(0);
  const [alertasEstoque, setAlertasEstoque] = useState(0);
  const [dadosGraficoLinha, setDadosGraficoLinha] = useState<{ dia: string; agendados: number; realizados: number }[]>([]);

  useEffect(() => {
    async function carregarDashboard() {
      if (!user) return;
      setLoading(true);
      try {
        const { data: prof } = await supabase.from("profiles").select("nome_completo").eq("id", user.id).maybeSingle();
        setNome(prof?.nome_completo?.split(" ")[0] ?? "");

        // Se NÃO for Admin, não carrega os dados pesados
        if ((isSecretaria && !isAdmin) || (isFisio && !isAdmin && !isSecretaria)) {
          setLoading(false);
          return;
        }

        const agora = new Date();
        const inicioMes = startOfMonth(agora).toISOString();
        const fimMes = endOfMonth(agora).toISOString();
        const inicioDia = startOfDay(agora).toISOString();
        const fimDia = endOfDay(agora).toISOString();

        // Buscar ID do serviço "Avaliação"
        const { data: servicoAvaliacao } = await supabase
          .from("servicos")
          .select("id")
          .ilike("nome", "%avaliação%")
          .limit(1)
          .maybeSingle();
        const servicoAvaliacaoId = servicoAvaliacao?.id;

        // ===== QUERIES EM PARALELO =====
        const [
          resFaltas,
          resEvolucoes,
          resGuias,
          resAtendMes,
          resPacotesPlano,
          { count: totalPacCount },
          { count: pacAtivosCount },
          { count: totalProfCount },
          { count: atendHojeCount },
          { data: repassesData },
          { count: medCount },
          { data: medVisitados },
          { data: pacotesData },
          { data: estoqueData },
          { data: pagamentosData },
          { count: avaliacoesCount },
          { data: pacientesManual },
          { data: pacientesAvaliacao },
          { data: pacientesSessao },
          { data: altasData },
        ] = await Promise.all([
          // Faltas pendentes
          supabase.from("atendimentos").select("id, data_inicio, paciente:pacientes(nome), profissional:profissionais(nome)").eq("status", "faltou"),
          // Evoluções atrasadas (agendadas no passado sem ser realizadas)
          supabase.from("atendimentos").select("id, data_inicio, paciente:pacientes(nome), profissional:profissionais(nome)").eq("status", "agendado").lt("data_inicio", inicioDia),
          // Guias a renovar
          supabase.from("paciente_pacotes").select("id, paciente_id, sessoes_restantes, autorizacao:autorizacoes(plano), paciente:pacientes(nome)").not("autorizacao_id", "is", null).eq("status_renovacao", "vai_renovar"),
          // Atendimentos do mês (com profissional e serviço)
          supabase.from("atendimentos").select("id, data_inicio, status, profissional_id, servico_id, profissional:profissionais(nome), servico:servicos(nome)").gte("data_inicio", inicioMes).lte("data_inicio", fimMes),
          // Pacotes de plano (para gráfico de pizza)
          supabase.from("paciente_pacotes").select("id, autorizacao:autorizacoes(plano)"),
          // KPIs
          supabase.from("pacientes").select("id", { count: "exact", head: true }),
          supabase.from("pacientes").select("id", { count: "exact", head: true }).eq("ativo", true),
          supabase.from("profissionais").select("id", { count: "exact", head: true }).eq("ativo", true),
          supabase.from("atendimentos").select("id", { count: "exact", head: true }).gte("data_inicio", inicioDia).lte("data_inicio", fimDia),
          supabase.from("repasses_atendimento").select("id, valor_repasse, status").gte("created_at", inicioMes).lte("created_at", fimMes),
          supabase.from("medicos").select("id", { count: "exact", head: true }),
          supabase.from("medicos").select("id, ultima_visita").not("ultima_visita", "is", null),
          supabase.from("paciente_pacotes").select("id, sessoes_restantes").gt("sessoes_restantes", 0),
          supabase.from("estoque_insumos").select("id, quantidade_atual, quantidade_minima"),
          supabase.from("pagamentos").select("valor, data_pagamento").gte("data_pagamento", format(startOfMonth(agora), "yyyy-MM-dd")).lte("data_pagamento", format(endOfMonth(agora), "yyyy-MM-dd")),
          supabase.from("atendimentos").select("id", { count: "exact", head: true }).eq("servico_id", servicoAvaliacaoId || "").eq("status", "realizado").gte("data_inicio", inicioMes).lte("data_inicio", fimMes),
          supabase.from("pacientes").select("id").gte("data_inicio_tratamento", format(startOfMonth(agora), "yyyy-MM-dd")).lte("data_inicio_tratamento", format(endOfMonth(agora), "yyyy-MM-dd")),
          supabase.from("atendimentos").select("paciente_id").eq("servico_id", servicoAvaliacaoId || "").eq("status", "realizado").gte("data_inicio", inicioMes).lte("data_inicio", fimMes),
          servicoAvaliacaoId ? supabase.from("atendimentos").select("paciente_id").not("servico_id", "eq", servicoAvaliacaoId).eq("status", "realizado").gte("data_inicio", inicioMes).lte("data_inicio", fimMes) : supabase.from("atendimentos").select("paciente_id", { count: "exact", head: true }).limit(0),
          // Altas fisioterapêuticas
          supabase.from("prontuarios").select("id, created_at, paciente_id, profissional_id, profissional:profissionais(nome)").eq("alta_medica", true),
        ]);

        // ===== PROCESSAR DADOS =====
        const atendMes = resAtendMes.data ?? [];
        const realizados = atendMes.filter((a) => a.status === "realizado");
        const cancelados = atendMes.filter((a) => a.status === "cancelado");
        const agendados = atendMes.filter((a) => a.status === "agendado");

        // Repasses
        const repasses = repassesData ?? [];
        const repassesPendSum = repasses.filter((r) => r.status === "pendente").reduce((s, r) => s + Number(r.valor_repasse), 0);
        const repassesPgSum = repasses.filter((r) => r.status === "pago").reduce((s, r) => s + Number(r.valor_repasse), 0);

        // Faturamento
        const faturamento = (pagamentosData ?? []).reduce((s, p) => s + Number(p.valor), 0);

        // Estoque
        const alertas = (estoqueData ?? []).filter((i) => Number(i.quantidade_atual) <= Number(i.quantidade_minima)).length;

        // Novos tratamentos
        const manualCount = pacientesManual?.length || 0;
        const pacientesComAvaliacao = pacientesAvaliacao?.map((a: any) => a.paciente_id) || [];
        const pacientesComSessao = pacientesSessao?.map((a: any) => a.paciente_id) || [];
        const automaticos = pacientesComAvaliacao.filter((id: string) => pacientesComSessao.includes(id));
        const automaticosFiltrados = automaticos.filter((id: string) => !pacientesManual?.some((p: any) => p.id === id));
        const novosTratamentosTotal = manualCount + automaticosFiltrados.length;

        // Altas
        const altas = altasData ?? [];
        const altasMesCount = altas.filter((a: any) => a.created_at >= inicioMes && a.created_at <= fimMes).length;
        const altaMap = new Map<string, number>();
        altas.forEach((a: any) => {
          const nome = a.profissional?.nome ?? "—";
          altaMap.set(nome, (altaMap.get(nome) ?? 0) + 1);
        });
        const topAltas = [...altaMap.entries()].map(([nome, count]) => ({ nome, count })).sort((a, b) => b.count - a.count);

        // Top profissionais
        const profMap = new Map<string, number>();
        realizados.forEach((a: any) => {
          const nome = a.profissional?.nome ?? "—";
          profMap.set(nome, (profMap.get(nome) ?? 0) + 1);
        });
        const topProf = [...profMap.entries()].map(([nome, count]) => ({ nome, count })).sort((a, b) => b.count - a.count).slice(0, 5);

        // Top serviços
        const servMap = new Map<string, number>();
        realizados.forEach((a: any) => {
          const nome = a.servico?.nome ?? "Sem serviço";
          servMap.set(nome, (servMap.get(nome) ?? 0) + 1);
        });
        const topServ = [...servMap.entries()].map(([nome, count]) => ({ nome, count })).sort((a, b) => b.count - a.count).slice(0, 5);

        // Gráfico de linha dos últimos 14 dias
        const porDiaDetalhado: { dia: string; agendados: number; realizados: number }[] = [];
        for (let i = 13; i >= 0; i--) {
          const dataRef = subDays(agora, i);
          const diaISO = format(dataRef, "yyyy-MM-dd");
          const label = format(dataRef, "dd/MM");
          const diaAtendimentos = atendMes.filter((a) => a.data_inicio.startsWith(diaISO));
          porDiaDetalhado.push({
            dia: label,
            agendados: diaAtendimentos.filter(a => a.status === "agendado").length,
            realizados: diaAtendimentos.filter(a => a.status === "realizado").length,
          });
        }

        // Médicos visitados (30d)
        const trintaDias = format(subDays(agora, 30), "yyyy-MM-dd");
        const medVisRecentes = (medVisitados ?? []).filter((m: any) => m.ultima_visita && m.ultima_visita >= trintaDias).length;

        // Distribuição de convênios (pizza)
        const contagemPlanos: Record<string, number> = { "Particular": 0 };
        (resPacotesPlano.data || []).forEach((p: any) => {
          if (p.autorizacao?.plano) {
            contagemPlanos[p.autorizacao.plano] = (contagemPlanos[p.autorizacao.plano] || 0) + 1;
          } else {
            contagemPlanos["Particular"] += 1;
          }
        });

        // ===== SETAR TUDO =====
        setFaltasPendentes(resFaltas.data || []);
        setEvolucoesAtrasadas((resEvolucoes.data || []).slice(0, 10));
        setGuiasRenovar(resGuias.data || []);
        setAtendimentosMes(atendMes);
        setDistribuicaoConvenios(Object.entries(contagemPlanos).map(([name, value]) => ({ name, value })).filter(i => i.value > 0));

        setTotalPac(totalPacCount ?? 0);
        setPacAtivos(pacAtivosCount ?? 0);
        setTotalProf(totalProfCount ?? 0);
        setAtendHoje(atendHojeCount ?? 0);
        setRepassesPend(repassesPendSum);
        setRepassesPg(repassesPgSum);
        setFaturamentoMes(faturamento);
        setAvaliacoesMes(avaliacoesCount ?? 0);
        setNovosTratamentosMes(novosTratamentosTotal);
        setNovosTratamentosManual(manualCount);
        setAltasMes(altasMesCount);
        setTopAltasProfissionais(topAltas);
        setTopProfissionais(topProf);
        setTopServicos(topServ);
        setMedicosCadastrados(medCount ?? 0);
        setMedicosVisitados(medVisRecentes);
        setPacotesAtivos((pacotesData ?? []).length);
        setAlertasEstoque(alertas);
        setDadosGraficoLinha(porDiaDetalhado);

      } catch (err) {
        console.error("Erro ao carregar dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    carregarDashboard();
  }, [user, isSecretaria, isAdmin, isFisio]);

  // Processamento dos gráficos mensais
  const dadosGraficoMensal = useMemo(() => {
    const dias: Record<string, number> = {};
    atendimentosMes.forEach(at => {
      const dia = format(new Date(at.data_inicio), "dd/MMM", { locale: ptBR });
      dias[dia] = (dias[dia] || 0) + 1;
    });
    return Object.entries(dias).map(([dia, total]) => ({ dia, Atendimentos: total }));
  }, [atendimentosMes]);

  const dadosOcupacao = useMemo(() => {
    const profs: Record<string, number> = {};
    atendimentosMes.forEach(at => {
      const nome = at.profissional?.nome?.split(" ")[0] || "Sem Profissional";
      profs[nome] = (profs[nome] || 0) + 1;
    });
    return Object.entries(profs).map(([name, Atendimentos]) => ({ name, Atendimentos }));
  }, [atendimentosMes]);

  // Ações de auditoria
  const processarFalta = async (id: string, decisao: "cobrada" | "abonada") => {
    try {
      const { error } = await supabase.from("atendimentos").update({ status: `falta_${decisao}` }).eq("id", id);
      if (error) throw error;
      toast.success(`Falta ${decisao} registrada com sucesso!`);
      setFaltasPendentes(prev => prev.filter(f => f.id !== id));
    } catch (err: any) {
      toast.error("Erro ao processar falta.");
    }
  };

  // ===== ROTEAMENTO POR PERFIL =====
  if (isSecretaria && !isAdmin) return <DashboardSecretaria nomeUsuario={nome} />;
  if (isFisio && !isAdmin && !isSecretaria) return <DashboardFisio />;

  if (loading) return <div className="p-10 text-center text-muted-foreground animate-pulse">A carregar o Painel de Gestão...</div>;

  const taxaRealizacao = atendimentosMes.length > 0 
    ? Math.round((atendimentosMes.filter(a => a.status === "realizado").length / atendimentosMes.length) * 100) 
    : 0;
  const totalRealizados = atendimentosMes.filter(a => a.status === "realizado").length;
  const totalAgendados = atendimentosMes.filter(a => a.status === "agendado").length;
  const totalCancelados = atendimentosMes.filter(a => a.status === "cancelado").length;

  // ===== PAINEL GERENCIAL (ADMIN) =====
  return (
    <div className="space-y-6 p-2 pb-10 max-w-7xl mx-auto">
      {/* CABEÇALHO */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">Diretoria 👋</h1>
          <p className="text-xs text-muted-foreground font-medium">Bem-vindo(a), {nome}. Este é o seu raio-X da clínica.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/agenda")} className="shadow-sm"><Calendar className="w-4 h-4 mr-2"/> Agenda</Button>
          <Button variant="default" size="sm" onClick={() => navigate("/pacientes")} className="shadow-sm bg-slate-800"><Users className="w-4 h-4 mr-2"/> Pacientes</Button>
        </div>
      </div>

      {/* ===== 1º ANDAR: AUDITORIA E AÇÕES IMEDIATAS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Faltas Pendentes */}
        <Card className="p-0 overflow-hidden shadow-sm border-t-4 border-t-rose-500 flex flex-col h-64">
          <div className="bg-rose-50/50 p-3 border-b border-rose-100 flex items-center justify-between">
            <h3 className="font-bold text-xs uppercase tracking-wider text-rose-700 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4"/> Auditoria de Faltas</h3>
            <Badge className="bg-rose-100 text-rose-700">{faltasPendentes.length}</Badge>
          </div>
          <div className="p-3 overflow-y-auto flex-1 space-y-2">
            {faltasPendentes.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground mt-10">Nenhuma falta para auditar.</p>
            ) : (
              faltasPendentes.map(f => (
                <div key={f.id} className="text-xs border rounded-lg p-2.5 bg-white shadow-sm hover:border-rose-200 transition-all">
                  <div className="font-bold text-slate-800 truncate mb-1">{f.paciente?.nome}</div>
                  <div className="text-[10px] text-muted-foreground mb-2 flex justify-between">
                    <span>{format(new Date(f.data_inicio), "dd/MM 'às' HH:mm")}</span>
                    <span className="uppercase text-slate-500">{f.profissional?.nome?.split(" ")[0]}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => processarFalta(f.id, "abonada")}><CheckCircle className="w-3 h-3 mr-1"/> Abonar</Button>
                    <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => processarFalta(f.id, "cobrada")}><XCircle className="w-3 h-3 mr-1"/> Cobrar</Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Renovar Guias */}
        <Card className="p-0 overflow-hidden shadow-sm border-t-4 border-t-blue-500 flex flex-col h-64">
          <div className="bg-blue-50/50 p-3 border-b border-blue-100 flex items-center justify-between">
            <h3 className="font-bold text-xs uppercase tracking-wider text-blue-700 flex items-center gap-1.5"><Stethoscope className="w-4 h-4"/> Renovar Guias</h3>
            <Badge className="bg-blue-100 text-blue-700">{guiasRenovar.length}</Badge>
          </div>
          <div className="p-3 overflow-y-auto flex-1 space-y-2">
            {guiasRenovar.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground mt-10">Nenhum convênio a expirar.</p>
            ) : (
              guiasRenovar.map(g => (
                <div key={g.id} className="text-xs border rounded-lg p-2.5 bg-white shadow-sm flex items-center justify-between hover:border-blue-200 cursor-pointer" onClick={() => navigate(`/pacientes/${g.paciente_id}`)}>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 truncate">{g.paciente?.nome}</div>
                    <div className="text-[10px] text-blue-600 font-bold mt-0.5">{g.autorizacao?.plano} ({g.sessoes_restantes} restantes)</div>
                  </div>
                  <Button size="sm" className="h-7 text-[10px] bg-blue-600">Pedir Guia</Button>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Prontuários Atrasados */}
        <Card className="p-0 overflow-hidden shadow-sm border-t-4 border-t-amber-500 flex flex-col h-64">
          <div className="bg-amber-50/50 p-3 border-b border-amber-100 flex items-center justify-between">
            <h3 className="font-bold text-xs uppercase tracking-wider text-amber-700 flex items-center gap-1.5"><Clock className="w-4 h-4"/> Prontuários Atrasados</h3>
            <Badge className="bg-amber-100 text-amber-700">{evolucoesAtrasadas.length}</Badge>
          </div>
          <div className="p-3 overflow-y-auto flex-1 space-y-2">
            {evolucoesAtrasadas.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground mt-10">Evoluções em dia!</p>
            ) : (
              evolucoesAtrasadas.map(e => (
                <div key={e.id} className="text-xs border rounded-lg p-2 bg-amber-50/30 border-amber-100 shadow-sm">
                  <span className="font-bold text-amber-800 block mb-0.5">{e.profissional?.nome?.split(" ")[0] || "Fisio"}</span>
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="truncate max-w-[120px]">{e.paciente?.nome}</span>
                    <span className="text-[10px] bg-white px-1.5 py-0.5 rounded border">{format(new Date(e.data_inicio), "dd/MM")}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* ===== 2º ANDAR: KPIs ===== */}
      <h2 className="text-lg font-bold text-slate-800 mt-8 mb-2 border-b pb-2 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-indigo-600"/> Indicadores de Desempenho (Mês Atual)
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={Calendar} label="Atend. hoje" value={atendHoje} />
        <KPI icon={TrendingUp} label="Atend. mês" value={atendimentosMes.length} />
        <KPI icon={Users} label="Pacientes ativos" value={pacAtivos} />
        <KPI icon={DollarSign} label="Faturamento mês" value={`R$ ${faturamentoMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
        <KPI icon={FileText} label="Avaliações no mês" value={avaliacoesMes} />
        <KPI icon={TrendingUp} label="Novos tratamentos" value={novosTratamentosMes} />
        <KPI icon={Award} label="Altas fisioterapêuticas" value={altasMes} />
        <KPI icon={Activity} label="Repasses pagos" value={`R$ ${repassesPg.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
      </div>

      {novosTratamentosManual > 0 && (
        <div className="text-xs text-muted-foreground text-center -mt-1">
          * {novosTratamentosManual} pacientes de plano com início manual
        </div>
      )}

      {/* Taxa de realização */}
      <Card className="p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Taxa de realização</span>
          <span className="font-bold">{taxaRealizacao}%</span>
        </div>
        <Progress value={taxaRealizacao} className="h-3" />
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-primary" /> {totalRealizados} realizados</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {totalAgendados} agendados</span>
          <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-destructive" /> {totalCancelados} cancelados</span>
        </div>
      </Card>

      {/* ===== 3º ANDAR: GRÁFICOS ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Curva de Atendimentos Mensal */}
        <Card className="p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 text-center">Curva de Atendimentos Mensal</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dadosGraficoMensal}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="dia" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                <YAxis tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                <ChartTooltip contentStyle={{ borderRadius: '8px', fontSize: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Line type="monotone" dataKey="Atendimentos" stroke="#4f46e5" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Agendados vs Realizados (14 dias) */}
        <Card className="p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 text-center">Agendados vs Realizados (14 dias)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dadosGraficoLinha}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="dia" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <ChartTooltip contentStyle={{ borderRadius: '8px', fontSize: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend />
                <Line type="monotone" dataKey="agendados" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} name="Agendados" />
                <Line type="monotone" dataKey="realizados" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3 }} name="Realizados" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Pizza: Particular vs Planos */}
        <Card className="p-4 shadow-sm flex flex-col justify-center items-center">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 text-center w-full">Receita: Particular vs Planos</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distribuicaoConvenios} innerRadius={60} outerRadius={85} paddingAngle={3} dataKey="value">
                  {distribuicaoConvenios.map((entry, index) => <Cell key={`cell-${index}`} fill={CORES_PIZZA[index % CORES_PIZZA.length]} />)}
                </Pie>
                <ChartTooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Barras: Ocupação por Profissional */}
        <Card className="p-4 shadow-sm flex flex-col justify-center items-center">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 text-center w-full">Ocupação por Profissional (Mês)</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosOcupacao} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                <YAxis tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={{fill: '#f8fafc'}} contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                <Bar dataKey="Atendimentos" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ===== 4º ANDAR: RANKINGS E REPASSES ===== */}
      <Card className="p-4 space-y-2">
        <h2 className="font-semibold text-sm">Repasses do mês</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center">
            <div className="text-lg font-bold text-amber-500">R$ {repassesPend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
            <div className="text-xs text-muted-foreground">Pendentes</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-primary">R$ {repassesPg.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
            <div className="text-xs text-muted-foreground">Pagos</div>
          </div>
        </div>
      </Card>

      {/* Ranking de Altas Fisioterapêuticas */}
      {topAltasProfissionais.length > 0 && (
        <Card className="p-4 space-y-2 border-l-4 border-l-purple-500">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Award className="w-4 h-4 text-purple-600" />
            Ranking de Altas Fisioterapêuticas
          </h2>
          <p className="text-[11px] text-muted-foreground">Histórico total de altas por profissional</p>
          <div className="space-y-1.5 mt-2">
            {topAltasProfissionais.map((p, i) => {
              const medalhas = ["🥇", "🥈", "🥉"];
              const prefixo = i < 3 ? medalhas[i] : `${i + 1}.`;
              return (
                <div key={p.nome} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-6 text-center">{prefixo}</span>
                    <span>{p.nome}</span>
                  </span>
                  <span className="font-semibold text-purple-600">
                    {p.count} {p.count === 1 ? "alta" : "altas"}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Top Profissionais e Top Serviços */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {topProfissionais.length > 0 && (
          <Card className="p-4 space-y-2">
            <h2 className="font-semibold text-sm">Top Profissionais (atendimentos no mês)</h2>
            {topProfissionais.map((p, i) => (
              <div key={p.nome} className="flex items-center justify-between text-sm">
                <span>{i + 1}. {p.nome}</span>
                <span className="font-semibold text-primary">{p.count}</span>
              </div>
            ))}
          </Card>
        )}
        {topServicos.length > 0 && (
          <Card className="p-4 space-y-2">
            <h2 className="font-semibold text-sm">Top Serviços</h2>
            {topServicos.map((s, i) => (
              <div key={s.nome} className="flex items-center justify-between text-sm">
                <span>{i + 1}. {s.nome}</span>
                <span className="font-semibold text-primary">{s.count}</span>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Resumo Geral */}
      <Card className="p-4 space-y-2">
        <h2 className="font-semibold text-sm">Resumo geral</h2>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted-foreground">Total pacientes</span><span className="font-medium text-right">{totalPac}</span>
          <span className="text-muted-foreground">Profissionais ativos</span><span className="font-medium text-right">{totalProf}</span>
          <span className="text-muted-foreground">Médicos cadastrados</span><span className="font-medium text-right">{medicosCadastrados}</span>
          <span className="text-muted-foreground">Médicos visitados (30d)</span><span className="font-medium text-right">{medicosVisitados}</span>
          <span className="text-muted-foreground">Pacotes ativos</span><span className="font-medium text-right">{pacotesAtivos}</span>
          <span className="text-muted-foreground">Alertas de estoque</span><span className="font-medium text-right text-destructive">{alertasEstoque}</span>
        </div>
      </Card>
    </div>
  );
}

// ===== COMPONENTE KPI =====
function KPI({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <Card className="p-4 shadow-card">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
    </Card>
  );
}
