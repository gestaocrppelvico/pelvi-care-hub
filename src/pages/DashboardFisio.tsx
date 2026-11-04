import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay 
} from "date-fns";
import { 
  Activity, Users, Wallet, CheckCircle, AlertTriangle, 
  TrendingUp, Target, XCircle, Filter, Calendar
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// 🔥 DATA DE CORTE — mesma do EvolucoesPendentes
const DATA_CORTE = new Date("2026-10-01T00:00:00");

// 🔥 META MENSAL DE SESSÕES PARA GAMIFICAÇÃO (Pode ajustar conforme a clínica)
const META_MENSAL = 80;

type FiltroPeriodo = "dia" | "semana" | "mes";

export default function DashboardFisio() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("mes");

  const [metrics, setMetrics] = useState({
    atendimentos: 0,
    pacientesUnicos: 0,
    faltas: 0,
    cancelados: 0,
    taxaComparecimento: 0,
    repasseTotal: 0,
    repassePendente: 0,
    sessoesSemEvolucao: 0,
    metaAtingida: 0,
  });

  // Calcula o período selecionado
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
    } else {
      inicio = startOfMonth(hoje);
      fim = endOfMonth(hoje);
    }

    return {
      inicioISO: inicio.toISOString(),
      fimISO: fim.toISOString(),
    };
  }, [filtroPeriodo]);

  useEffect(() => {
    async function carregarMetricas() {
      if (!user) return;
      setLoading(true);

      try {
        // 1. Descobre quem é a fisio logada
        const { data: prof } = await supabase
          .from("profissionais")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!prof) {
          setLoading(false);
          return;
        }

        const meuId = prof.id;

        // 2. Busca TODOS os atendimentos do período para calcular métricas
        const { data: atendimentos } = await supabase
          .from("atendimentos")
          .select("id, paciente_id, status")
          .eq("profissional_id", meuId)
          .gte("data_inicio", periodo.inicioISO)
          .lte("data_inicio", periodo.fimISO);

        const realizados = (atendimentos || []).filter(a => a.status === "realizado");
        const faltas = (atendimentos || []).filter(a => a.status === "faltou").length;
        const cancelados = (atendimentos || []).filter(a => a.status === "cancelado").length;
        
        // Conta pacientes únicos que compareceram
        const pacientesUnicos = new Set(realizados.map(a => a.paciente_id)).size;

        // Taxa de Comparecimento (Baseado no que já aconteceu: Realizados + Faltas + Cancelados)
        const totalConcluidos = realizados.length + faltas + cancelados;
        const taxaComparecimento = totalConcluidos > 0 
          ? Math.round((realizados.length / totalConcluidos) * 100) 
          : 0;

        // 3. Busca os Repasses gerados neste período
        const { data: repasses } = await supabase
          .from("repasses_atendimento")
          .select("valor_repasse, status")
          .eq("profissional_id", meuId)
          .gte("data_atendimento", periodo.inicioISO)
          .lte("data_atendimento", periodo.fimISO);

        let repasseTotal = 0;
        let repassePendente = 0;

        (repasses || []).forEach(r => {
          const valor = Number(r.valor_repasse) || 0;
          repasseTotal += valor;
          if (r.status === "pendente") {
            repassePendente += valor;
          }
        });

        // 4. Buscar sessões sem evolução (>48h) - Regra global
        const limite48h = new Date();
        limite48h.setHours(limite48h.getHours() - 48);

        const { data: atends48h } = await supabase
          .from("atendimentos")
          .select("id")
          .eq("profissional_id", meuId)
          .eq("status", "realizado")
          .lt("data_inicio", limite48h.toISOString())
          .gte("data_inicio", DATA_CORTE.toISOString());

        const idsAtend = (atends48h || []).map((a: any) => a.id);
        let pendentesCount = 0;

        if (idsAtend.length > 0) {
          const { data: pronts } = await supabase
            .from("prontuarios")
            .select("atendimento_id")
            .eq("tipo", "evolucao")
            .in("atendimento_id", idsAtend);
          const comEv = new Set((pronts || []).map((p: any) => p.atendimento_id));
          pendentesCount = idsAtend.filter((id: string) => !comEv.has(id)).length;
        }

        // 5. Calcula progresso da meta (apenas se for visualização mensal)
        let metaAtingida = 0;
        if (filtroPeriodo === "mes") {
          metaAtingida = Math.min(Math.round((realizados.length / META_MENSAL) * 100), 100);
        } else if (filtroPeriodo === "semana") {
          metaAtingida = Math.min(Math.round((realizados.length / (META_MENSAL / 4)) * 100), 100);
        } else {
          metaAtingida = Math.min(Math.round((realizados.length / (META_MENSAL / 22)) * 100), 100); // 22 dias úteis
        }

        setMetrics({
          atendimentos: realizados.length,
          pacientesUnicos,
          faltas,
          cancelados,
          taxaComparecimento,
          repasseTotal,
          repassePendente,
          sessoesSemEvolucao: pendentesCount,
          metaAtingida
        });

      } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
        toast.error("Erro ao carregar seus indicadores.");
      } finally {
        setLoading(false);
      }
    }

    carregarMetricas();
  }, [user, periodo, filtroPeriodo]);

  const fmt = (val: number) => val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Carregando seus indicadores...</div>;
  }

  return (
    <div className="space-y-6 pb-20 p-2 max-w-5xl mx-auto">
      {/* Header e Filtro */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Meu Painel</h1>
          <p className="text-sm text-muted-foreground">Sua produtividade e previsibilidade.</p>
        </div>

        <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border shadow-sm">
          <Filter className="w-3.5 h-3.5 text-slate-400 ml-2" />
          <Button size="sm" variant={filtroPeriodo === "dia" ? "default" : "ghost"} onClick={() => setFiltroPeriodo("dia")} className="h-8 text-xs">Hoje</Button>
          <Button size="sm" variant={filtroPeriodo === "semana" ? "default" : "ghost"} onClick={() => setFiltroPeriodo("semana")} className="h-8 text-xs">Semana</Button>
          <Button size="sm" variant={filtroPeriodo === "mes" ? "default" : "ghost"} onClick={() => setFiltroPeriodo("mes")} className="h-8 text-xs">Mês</Button>
        </div>
      </div>

      {/* Top Row: Produtividade e Faturamento */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-l-4 border-l-blue-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Sessões Realizadas</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">{metrics.atendimentos}</div>
            <p className="text-xs text-muted-foreground mt-1">Pacientes atendidos no período</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-indigo-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pacientes Únicos</CardTitle>
            <Users className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">{metrics.pacientesUnicos}</div>
            <p className="text-xs text-muted-foreground mt-1">Pessoas diferentes atendidas</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 bg-emerald-50/30 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-emerald-800">Meus Ganhos</CardTitle>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{fmt(metrics.repasseTotal)}</div>
            <p className="text-xs text-emerald-600/80 mt-1">
              {fmt(metrics.repassePendente)} a receber (pendente)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Middle Row: Gamificação (Meta) e Qualidade (Taxa e Faltas) */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Card de Meta */}
        <Card className="shadow-sm border-t-4 border-t-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Target className="w-4 h-4 text-purple-600" /> 
              Meta de Produtividade ({filtroPeriodo === 'mes' ? 'Mensal' : filtroPeriodo === 'semana' ? 'Semanal' : 'Diária'})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-slate-500">Seu progresso</span>
              <span className="text-purple-700 font-bold">{metrics.metaAtingida}%</span>
            </div>
            <Progress value={metrics.metaAtingida} className="h-3" />
            <p className="text-xs text-muted-foreground">
              {metrics.metaAtingida >= 100 
                ? "🎉 Parabéns! Você bateu a meta do período!" 
                : `Faltam ${Math.max(0, (filtroPeriodo === 'mes' ? META_MENSAL : filtroPeriodo === 'semana' ? META_MENSAL/4 : META_MENSAL/22) - metrics.atendimentos)} sessões para a meta.`}
            </p>
          </CardContent>
        </Card>

        {/* Card de Qualidade */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" /> 
              Taxa de Comparecimento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <div className={`text-3xl font-black ${metrics.taxaComparecimento >= 85 ? 'text-emerald-600' : metrics.taxaComparecimento >= 70 ? 'text-amber-500' : 'text-rose-500'}`}>
                {metrics.taxaComparecimento}%
              </div>
              <span className="text-xs text-muted-foreground">de presença</span>
            </div>
            <div className="flex gap-4 text-xs font-medium text-slate-600">
              <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-amber-500" /> {metrics.faltas} faltas</span>
              <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-rose-500" /> {metrics.cancelados} cancelados</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Pendências */}
      <Card 
        className={`border-l-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${
          metrics.sessoesSemEvolucao > 0 ? "border-l-orange-500 bg-orange-50/30" : "border-l-emerald-500"
        }`}
        onClick={() => navigate("/evolucoes-pendentes")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className={`text-sm font-medium ${
            metrics.sessoesSemEvolucao > 0 ? "text-orange-800" : "text-emerald-800"
          }`}>
            Sessões sem Evolução
          </CardTitle>
          <AlertTriangle className={`h-4 w-4 ${
            metrics.sessoesSemEvolucao > 0 ? "text-orange-500" : "text-emerald-500"
          }`} />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <div className={`text-2xl font-bold ${
              metrics.sessoesSemEvolucao > 0 ? "text-orange-700" : "text-emerald-700"
            }`}>
              {metrics.sessoesSemEvolucao}
            </div>
            <span className="text-xs text-muted-foreground">
              {metrics.sessoesSemEvolucao > 0 ? "aguardando evolução (clique para resolver)" : "tudo em dia! 🎉"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Sessões realizadas há mais de 48h
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
