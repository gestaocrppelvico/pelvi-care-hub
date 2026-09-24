import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  Calendar, Users, AlertTriangle, CheckCircle, XCircle, 
  TrendingUp, Activity, DollarSign, Stethoscope, Clock, FileText, Award, Filter
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  format, startOfMonth, endOfMonth, startOfDay, endOfDay, 
  startOfWeek, endOfWeek, subDays, eachDayOfInterval 
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';

import DashboardFisio from "./DashboardFisio";
import DashboardSecretaria from "./DashboardSecretaria";

const CORES_PIZZA = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

type FiltroPeriodo = "dia" | "semana" | "mes" | "personalizado";

export default function Dashboard() {
  const { user, isFisio, isSecretaria, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(true);

  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("mes");
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  // ===== Estados de Auditoria =====
  const [faltasPendentes, setFaltasPendentes] = useState<any[]>([]);
  const [evolucoesAtrasadas, setEvolucoesAtrasadas] = useState<any[]>([]);
  const [guiasRenovar, setGuiasRenovar] = useState<any[]>([]);

  // ===== Estados de BI =====
  const [atendimentosPeriodo, setAtendimentosPeriodo] = useState<any[]>([]);
  const [distribuicaoConvenios, setDistribuicaoConvenios] = useState<any[]>([]);
  const [totalPac, setTotalPac] = useState(0);
  const [pacAtivos, setPacAtivos] = useState(0);
  const [totalProf, setTotalProf] = useState(0);
  // 🔥 NOVOS: Atendimentos hoje (previstos + realizados)
  const [atendPrevistosHoje, setAtendPrevistosHoje] = useState(0);
  const [atendRealizadosHoje, setAtendRealizadosHoje] = useState(0);
  const [repassesPend, setRepassesPend] = useState(0);
  const [repassesPg, setRepassesPg] = useState(0);
  const [faturamento, setFaturamento] = useState(0);
  const [avaliacoes, setAvaliacoes] = useState(0);
  const [novosTratamentos, setNovosTratamentos] = useState(0);
  const [novosTratamentosManual, setNovosTratamentosManual] = useState(0);
  const [altas, setAltas] = useState(0);
  const [topAltasProfissionais, setTopAltasProfissionais] = useState<{ nome: string; count: number }[]>([]);
  const [topProfissionais, setTopProfissionais] = useState<{ nome: string; count: number }[]>([]);
  const [topServicos, setTopServicos] = useState<{ nome: string; count: number }[]>([]);
  const [medicosCadastrados, setMedicosCadastrados] = useState(0);
  const [medicosVisitados, setMedicosVisitados] = useState(0);
  const [pacotesAtivos, setPacotesAtivos] = useState(0);
  const [alertasEstoque, setAlertasEstoque] = useState(0);
  const [dadosGraficoLinha, setDadosGraficoLinha] = useState<{ dia: string; agendados: number; realizados: number }[]>([]);

  const periodo = useMemo(() => {
    const hoje = new Date();
    let inicio: Date;
    let fim: Date;

    if (filtroPeriodo === "dia") {
      inicio = startOfDay(hoje);
      fim = endOfDay(hoje);
    } else if (filtroPeriodo === "semana") {
      inicio = startOfWeek(hoje, { weekStartsOn: 1 });
      fim = endOfWeek(hoje, { weekStartsOn: 1 });
    } else if (filtroPeriodo === "mes") {
      inicio = startOfMonth(hoje);
      fim = endOfMonth(hoje);
    } else {
      inicio = dataInicio ? startOfDay(new Date(dataInicio + "T00:00:00")) : startOfMonth(hoje);
      fim = dataFim ? endOfDay(new Date(dataFim + "T00:00:00")) : endOfMonth(hoje);
    }

    return {
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      inicioDate: inicio,
      fimDate: fim,
    };
  }, [filtroPeriodo, dataInicio, dataFim]);

  const labelPeriodo = useMemo(() => {
    if (filtroPeriodo === "dia") return "Hoje";
    if (filtroPeriodo === "semana") return "Esta Semana";
    if (filtroPeriodo === "mes") return "Este Mês";
    if (!dataInicio || !dataFim) return "Período Personalizado";
    return `${format(new Date(dataInicio + "T00:00:00"), "dd/MM/yy")} a ${format(new Date(dataFim + "T00:00:00"), "dd/MM/yy")}`;
  }, [filtroPeriodo, dataInicio, dataFim]);

  useEffect(() => {
    async function carregarDashboard() {
      if (!user) return;
      setLoading(true);
      try {
        const { data: prof } = await supabase.from("profiles").select("nome_completo").eq("id", user.id).maybeSingle();
        setNome(prof?.nome_completo?.split(" ")[0] ?? "");

        if ((isSecretaria && !isAdmin) || (isFisio && !isAdmin && !isSecretaria)) {
          setLoading(false);
          return;
        }

        const agora = new Date();
        const inicioPeriodo = periodo.inicio;
        const fimPeriodo = periodo.fim;
        const inicioDia = startOfDay(agora).toISOString();
        const fimDia = endOfDay(agora).toISOString();

        const { data: servicoAvaliacao } = await supabase
          .from("servicos")
          .select("id")
          .ilike("nome", "%avaliação%")
          .limit(1)
          .maybeSingle();
        const servicoAvaliacaoId = servicoAvaliacao?.id;

        const [
          resFaltas,
          resEvolucoes,
          resGuias,
          resAtendPeriodo,
          resPacotesPlano,
          { count: totalPacCount },
          { count: pacAtivosCount },
          { count: totalProfCount },
          { data: atendHojeData }, // 🔥 mudou: agora pega data e status
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
          supabase.from("atendimentos").select("id, data_inicio, paciente:pacientes(nome), profissional:profissionais(nome)").eq("status", "faltou"),
          supabase.from("atendimentos").select("id, data_inicio, paciente:pacientes(nome), profissional:profissionais(nome)").eq("status", "agendado").lt("data_inicio", inicioDia),
          supabase.from("paciente_pacotes").select("id, paciente_id, sessoes_restantes, autorizacao:autorizacoes(plano), paciente:pacientes(nome)").not("autorizacao_id", "is", null).eq("status_renovacao", "vai_renovar"),
          supabase.from("atendimentos").select("id, data_inicio, status, profissional_id, servico_id, profissional:profissionais(nome), servico:servicos(nome)").gte("data_inicio", inicioPeriodo).lte("data_inicio", fimPeriodo),
          supabase.from("paciente_pacotes").select("id, autorizacao:autorizacoes(plano)"),
          supabase.from("pacientes").select("id", { count: "exact", head: true }),
          supabase.from("pacientes").select("id", { count: "exact", head: true }).eq("ativo", true),
          supabase.from("profissionais").select("id", { count: "exact", head: true }).eq("ativo", true),
          // 🔥 NOVO: busca hoje com status
          supabase.from("atendimentos").select("id, status").gte("data_inicio", inicioDia).lte("data_inicio", fimDia),
          supabase.from("repasses_atendimento").select("id, valor_repasse, status").gte("created_at", inicioPeriodo).lte("created_at", fimPeriodo),
          supabase.from("medicos").select("id", { count: "exact", head: true }),
          supabase.from("medicos").select("id, ultima_visita").not("ultima_visita", "is", null),
          supabase.from("paciente_pacotes").select("id, sessoes_restantes").gt("sessoes_restantes", 0),
          supabase.from("estoque_insumos").select("id, quantidade_atual, quantidade_minima"),
          supabase.from("pagamentos").select("valor, data_pagamento").gte("data_pagamento", format(periodo.inicioDate, "yyyy-MM-dd")).lte("data_pagamento", format(periodo.fimDate, "yyyy-MM-dd")),
          supabase.from("atendimentos").select("id", { count: "exact", head: true }).eq("servico_id", servicoAvaliacaoId || "").eq("status", "realizado").gte("data_inicio", inicioPeriodo).lte("data_inicio", fimPeriodo),
          supabase.from("pacientes").select("id").gte("data_inicio_tratamento", format(periodo.inicioDate, "yyyy-MM-dd")).lte("data_inicio_tratamento", format(periodo.fimDate, "yyyy-MM-dd")),
          supabase.from("atendimentos").select("paciente_id").eq("servico_id", servicoAvaliacaoId || "").eq("status", "realizado").gte("data_inicio", inicioPeriodo).lte("data_inicio", fimPeriodo),
          servicoAvaliacaoId ? supabase.from("atendimentos").select("paciente_id").not("servico_id", "eq", servicoAvaliacaoId).eq("status", "realizado").gte("data_inicio", inicioPeriodo).lte("data_inicio", fimPeriodo) : supabase.from("atendimentos").select("paciente_id", { count: "exact", head: true }).limit(0),
          supabase.from("prontuarios").select("id, created_at, paciente_id, profissional_id, profissional:profissionais(nome)").eq("alta_medica", true).gte("created_at", inicioPeriodo).lte("created_at", fimPeriodo),
        ]);

        const atendPeriodo = resAtendPeriodo.data ?? [];
        const realizados = atendPeriodo.filter((a) => a.status === "realizado");

        // 🔥 NOVO: calcular previstos e realizados hoje
        const atendHojeLista = atendHojeData ?? [];
        const previstosHoje = atendHojeLista.length;
        const realizadosHoje = atendHojeLista.filter((a) => a.status === "realizado").length;

        const repasses = repassesData ?? [];
        const repassesPendSum = repasses.filter((r) => r.status === "pendente").reduce((s, r) => s + Number(r.valor_repasse), 0);
        const repassesPgSum = repasses.filter((r) => r.status === "pago").reduce((s, r) => s + Number(r.valor_repasse), 0);

        const faturamentoSum = (pagamentosData ?? []).reduce((s, p) => s + Number(p.valor), 0);
        const alertas = (estoqueData ?? []).filter((i) => Number(i.quantidade_atual) <= Number(i.quantidade_minima)).length;

        const manualCount = pacientesManual?.length || 0;
        const pacientesComAvaliacao = pacientesAvaliacao?.map((a: any) => a.paciente_id) || [];
        const pacientesComSessao = pacientesSessao?.map((a: any) => a.paciente_id) || [];
        const automaticos = pacientesComAvaliacao.filter((id: string) => pacientesComSessao.includes(id));
        const automaticosFiltrados = automaticos.filter((id: string) => !pacientesManual?.some((p: any) => p.id === id));
        const novosTratamentosTotal = manualCount + automaticosFiltrados.length;

        const altasPeriodo = altasData ?? [];
        const altasCount = altasPeriodo.length;
        const altaMap = new Map<string, number>();
        altasPeriodo.forEach((a: any) => {
          const nome = a.profissional?.nome ?? "—";
          altaMap.set(nome, (altaMap.get(nome) ?? 0) + 1);
        });
        const topAltas = [...altaMap.entries()].map(([nome, count]) => ({ nome, count })).sort((a, b) => b.count - a.count);

        const profMap = new Map<string, number>();
        realizados.forEach((a: any) => {
          const nome = a.profissional?.nome ?? "—";
          profMap.set(nome, (profMap.get(nome) ?? 0) + 1);
        });
        const topProf = [...profMap.entries()].map(([nome, count]) => ({ nome, count })).sort((a, b) => b.count - a.count).slice(0, 5);

        const servMap = new Map<string, number>();
        realizados.forEach((a: any) => {
          const nome = a.servico?.nome ?? "Sem serviço";
          servMap.set(nome, (servMap.get(nome) ?? 0) + 1);
        });
        const topServ = [...servMap.entries()].map(([nome, count]) => ({ nome, count })).sort((a, b) => b.count - a.count).slice(0, 5);

        const porDiaDetalhado: { dia: string; agendados: number; realizados: number }[] = [];

        if (filtroPeriodo === "dia") {
          const horasMap: Record<string, { agendados: number; realizados: number }> = {};
          for (let h = 7; h <= 21; h++) {
            const label = `${h.toString().padStart(2, "0")}h`;
            horasMap[label] = { agendados: 0, realizados: 0 };
          }
          atendPeriodo.forEach((a) => {
            const h = new Date(a.data_inicio).getHours();
            const label = `${h.toString().padStart(2, "0")}h`;
            if (horasMap[label]) {
              if (a.status === "agendado") horasMap[label].agendados++;
              if (a.status === "realizado") horasMap[label].realizados++;
            }
          });
          Object.entries(horasMap).forEach(([dia, v]) => porDiaDetalhado.push({ dia, ...v }));
        } else {
          const dias = eachDayOfInterval({ start: periodo.inicioDate, end: periodo.fimDate });
          const diasLimitados = dias.length > 60 ? dias.slice(-60) : dias;

          diasLimitados.forEach((dia) => {
            const diaISO = format(dia, "yyyy-MM-dd");
            const label = format(dia, "dd/MM");
            const diaAtend = atendPeriodo.filter((a) => a.data_inicio.startsWith(diaISO));
            porDiaDetalhado.push({
              dia: label,
              agendados: diaAtend.filter(a => a.status === "agendado").length,
              realizados: diaAtend.filter(a => a.status === "realizado").length,
            });
          });
        }

        const trintaDias = format(subDays(agora, 30), "yyyy-MM-dd");
        const medVisRecentes = (medVisitados ?? []).filter((m: any) => m.ultima_visita && m.ultima_visita >= trintaDias).length;

        const contagemPlanos: Record<string, number> = { "Particular": 0 };
        (resPacotesPlano.data || []).forEach((p: any) => {
          if (p.autorizacao?.plano) {
            contagemPlanos[p.autorizacao.plano] = (contagemPlanos[p.autorizacao.plano] || 0) + 1;
          } else {
            contagemPlanos["Particular"] += 1;
          }
        });

        setFaltasPendentes(resFaltas.data || []);
        setEvolucoesAtrasadas((resEvolucoes.data || []).slice(0, 10));
        setGuiasRenovar(resGuias.data || []);
        setAtendimentosPeriodo(atendPeriodo);
        setDistribuicaoConvenios(Object.entries(contagemPlanos).map(([name, value]) => ({ name, value })).filter(i => i.value > 0));

        setTotalPac(totalPacCount ?? 0);
        setPacAtivos(pacAtivosCount ?? 0);
        setTotalProf(totalProfCount ?? 0);
        // 🔥 NOVO
        setAtendPrevistosHoje(previstosHoje);
        setAtendRealizadosHoje(realizadosHoje);

        setRepassesPend(repassesPendSum);
        setRepassesPg(repassesPgSum);
        setFaturamento(faturamentoSum);
        setAvaliacoes(avaliacoesCount ?? 0);
        setNovosTratamentos(novosTratamentosTotal);
        setNovosTratamentosManual(manualCount);
        setAltas(altasCount);
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
  }, [user, isSecretaria, isAdmin, isFisio, filtroPeriodo, dataInicio, dataFim, periodo]);

  const dadosGraficoMensal = useMemo(() => {
    const dias: Record<string, number> = {};
    atendimentosPeriodo.forEach(at => {
      const dia = format(new Date(at.data_inicio), "dd/MMM", { locale: ptBR });
      dias[dia] = (dias[dia] || 0) + 1;
    });
    return Object.entries(dias).map(([dia, total]) => ({ dia, Atendimentos: total }));
  }, [atendimentosPeriodo]);

  const dadosOcupacao = useMemo(() => {
    const profs: Record<string, number> = {};
    atendimentosPeriodo.forEach(at => {
      const nome = at.profissional?.nome?.split(" ")[0] || "Sem Profissional";
      profs[nome] = (profs[nome] || 0) + 1;
    });
    return Object.entries(profs).map(([name, Atendimentos]) => ({ name, Atendimentos }));
  }, [atendimentosPeriodo]);

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

  if (isSecretaria && !isAdmin) return <DashboardSecretaria nomeUsuario={nome} />;
  if (isFisio && !isAdmin && !isSecretaria) return <DashboardFisio />;

  if (loading) return <div className="p-10 text-center text-muted-foreground animate-pulse">A carregar o Painel de Gestão...</div>;

  const taxaRealizacao = atendimentosPeriodo.length > 0 
    ? Math.round((atendimentosPeriodo.filter(a => a.status === "realizado").length / atendimentosPeriodo.length) * 100) 
    : 0;
  const totalRealizados = atendimentosPeriodo.filter(a => a.status === "realizado").length;
  const totalAgendados = atendimentosPeriodo.filter(a => a.status === "agendado").length;
  const totalCancelados = atendimentosPeriodo.filter(a => a.status === "cancelado").length;

  const percentualHoje = atendPrevistosHoje > 0 ? Math.round((atendRealizadosHoje / atendPrevistosHoje) * 100) : 0;

  return (
    <div className="space-y-6 p-2 pb-10 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">Diretoria 👋</h1>
          <p className="text-xs text-muted-foreground font-medium">Bem-vindo(a), {nome}. Este é o seu raio-X da clínica.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/agenda")} className="shadow-sm"><Calendar className="w-4 h-4 mr-2"/> Agenda</Button>
          <Button variant="default" size="sm" onClick={() => navigate("/pacientes")} className="shadow-sm bg-slate-800"><Users className="w-4 h-4 mr-2"/> Pacientes</Button>
        </div>
      </div>

      <Card className="p-3 border shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 shrink-0">
            <Filter className="w-3.5 h-3.5" />
            <span className="uppercase tracking-wider">Período:</span>
          </div>

          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg flex-wrap">
            <Button size="sm" variant={filtroPeriodo === "dia" ? "default" : "ghost"} onClick={() => setFiltroPeriodo("dia")} className="h-8 text-xs">Hoje</Button>
            <Button size="sm" variant={filtroPeriodo === "semana" ? "default" : "ghost"} onClick={() => setFiltroPeriodo("semana")} className="h-8 text-xs">Esta Semana</Button>
            <Button size="sm" variant={filtroPeriodo === "mes" ? "default" : "ghost"} onClick={() => setFiltroPeriodo("mes")} className="h-8 text-xs">Este Mês</Button>
            <Button size="sm" variant={filtroPeriodo === "personalizado" ? "default" : "ghost"} onClick={() => setFiltroPeriodo("personalizado")} className="h-8 text-xs">Personalizado</Button>
          </div>

          {filtroPeriodo === "personalizado" && (
            <div className="flex items-center gap-2 bg-background p-1 rounded-md border">
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-8 border-none focus-visible:ring-0 w-[130px] text-xs" />
              <span className="text-[10px] text-muted-foreground font-medium">até</span>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="h-8 border-none focus-visible:ring-0 w-[130px] text-xs" />
            </div>
          )}

          <Badge variant="outline" className="ml-auto text-[10px] h-6">📅 {labelPeriodo}</Badge>
        </div>
      </Card>

      {/* ===== 1º ANDAR: AUDITORIA ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <TrendingUp className="w-5 h-5 text-indigo-600"/> Indicadores de Desempenho — {labelPeriodo}
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 🔥 NOVO: Previstos hoje */}
