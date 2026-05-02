import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Calendar, DollarSign, TrendingUp, Clock, CheckCircle, XCircle, Activity } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface DashData {
  totalPacientes: number;
  pacientesAtivos: number;
  totalProfissionais: number;
  atendimentosHoje: number;
  atendimentosMes: number;
  realizadosMes: number;
  canceladosMes: number;
  agendadosMes: number;
  faturamentoMes: number;
  repassesPendentesMes: number;
  repassesPagos: number;
  medicosCadastrados: number;
  medicosVisitados: number;
  pacotesAtivos: number;
  alertasEstoque: number;
  topProfissionais: { nome: string; count: number }[];
  topServicos: { nome: string; count: number }[];
  atendimentosPorDia: { dia: string; count: number }[];
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [d, setD] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const now = new Date();
    const mesStart = startOfMonth(now).toISOString();
    const mesEnd = endOfMonth(now).toISOString();
    const hojeStart = startOfDay(now).toISOString();
    const hojeEnd = endOfDay(now).toISOString();

    const [
      { count: totalPac },
      { count: pacAtivos },
      { count: totalProf },
      { count: atendHoje },
      { data: atendMesData },
      { data: repassesData },
      { count: medCount },
      { data: medVisitados },
      { data: pacotesData },
      { data: estoqueData },
      { data: pagamentosData },
    ] = await Promise.all([
      supabase.from("pacientes").select("id", { count: "exact", head: true }),
      supabase.from("pacientes").select("id", { count: "exact", head: true }).eq("ativo", true),
      supabase.from("profissionais").select("id", { count: "exact", head: true }).eq("ativo", true),
      supabase.from("atendimentos").select("id", { count: "exact", head: true }).gte("data_inicio", hojeStart).lte("data_inicio", hojeEnd),
      supabase.from("atendimentos").select("id, status, data_inicio, profissional_id, servico_id, profissional:profissionais(nome), servico:servicos(nome)").gte("data_inicio", mesStart).lte("data_inicio", mesEnd),
      supabase.from("repasses_atendimento").select("id, valor_repasse, status").gte("created_at", mesStart).lte("created_at", mesEnd),
      supabase.from("medicos").select("id", { count: "exact", head: true }),
      supabase.from("medicos").select("id, ultima_visita").not("ultima_visita", "is", null),
      supabase.from("paciente_pacotes").select("id, sessoes_restantes").gt("sessoes_restantes", 0),
      supabase.from("estoque_insumos").select("id, quantidade_atual, quantidade_minima"),
      supabase.from("pagamentos").select("valor, data_pagamento").gte("data_pagamento", format(startOfMonth(now), "yyyy-MM-dd")).lte("data_pagamento", format(endOfMonth(now), "yyyy-MM-dd")),
    ]);

    const atendMes = atendMesData ?? [];
    const realizados = atendMes.filter((a) => a.status === "realizado");
    const cancelados = atendMes.filter((a) => a.status === "cancelado");
    const agendados = atendMes.filter((a) => a.status === "agendado");

    const repasses = repassesData ?? [];
    const repassesPend = repasses.filter((r) => r.status === "pendente").reduce((s, r) => s + Number(r.valor_repasse), 0);
    const repassesPg = repasses.filter((r) => r.status === "pago").reduce((s, r) => s + Number(r.valor_repasse), 0);

    const faturamento = (pagamentosData ?? []).reduce((s, p) => s + Number(p.valor), 0);

    const alertas = (estoqueData ?? []).filter((i) => Number(i.quantidade_atual) <= Number(i.quantidade_minima)).length;

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

    // Atendimentos por dia (últimos 14 dias)
    const porDia: { dia: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const dia = format(subDays(now, i), "yyyy-MM-dd");
      const label = format(subDays(now, i), "dd/MM");
      const count = atendMes.filter((a) => a.data_inicio.startsWith(dia)).length;
      porDia.push({ dia: label, count });
    }

    // Médicos visitados nos últimos 30 dias
    const trintaDias = format(subDays(now, 30), "yyyy-MM-dd");
    const medVisRecentes = (medVisitados ?? []).filter((m) => m.ultima_visita && m.ultima_visita >= trintaDias).length;

    setD({
      totalPacientes: totalPac ?? 0,
      pacientesAtivos: pacAtivos ?? 0,
      totalProfissionais: totalProf ?? 0,
      atendimentosHoje: atendHoje ?? 0,
      atendimentosMes: atendMes.length,
      realizadosMes: realizados.length,
      canceladosMes: cancelados.length,
      agendadosMes: agendados.length,
      faturamentoMes: faturamento,
      repassesPendentesMes: repassesPend,
      repassesPagos: repassesPg,
      medicosCadastrados: medCount ?? 0,
      medicosVisitados: medVisRecentes,
      pacotesAtivos: (pacotesData ?? []).length,
      alertasEstoque: alertas,
      topProfissionais: topProf,
      topServicos: topServ,
      atendimentosPorDia: porDia,
    });
    setLoading(false);
  }

  if (loading) return <p className="text-muted-foreground text-center py-8">Carregando dashboard...</p>;
  if (!d) return null;

  const maxDia = Math.max(...d.atendimentosPorDia.map((x) => x.count), 1);
  const taxaRealizacao = d.atendimentosMes > 0 ? Math.round((d.realizadosMes / d.atendimentosMes) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">{format(new Date(), "MMMM yyyy", { locale: ptBR })}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KPI icon={Calendar} label="Atend. hoje" value={d.atendimentosHoje} />
        <KPI icon={TrendingUp} label="Atend. mês" value={d.atendimentosMes} />
        <KPI icon={Users} label="Pacientes ativos" value={d.pacientesAtivos} />
        <KPI icon={DollarSign} label="Faturamento mês" value={`R$ ${d.faturamentoMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
      </div>

      {/* Taxa de realização */}
      <Card className="p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Taxa de realização</span>
          <span className="font-bold">{taxaRealizacao}%</span>
        </div>
        <Progress value={taxaRealizacao} className="h-3" />
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-primary" /> {d.realizadosMes} realizados</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {d.agendadosMes} agendados</span>
          <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-destructive" /> {d.canceladosMes} cancelados</span>
        </div>
      </Card>

      {/* Gráfico de barras simples */}
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-sm">Atendimentos — últimos 14 dias</h2>
        <div className="flex items-end gap-1 h-24">
          {d.atendimentosPorDia.map((x) => (
            <div key={x.dia} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-primary transition-all"
                style={{ height: `${(x.count / maxDia) * 100}%`, minHeight: x.count > 0 ? 4 : 0 }}
              />
              <span className="text-[8px] text-muted-foreground">{x.dia.split("/")[0]}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Repasses */}
      <Card className="p-4 space-y-2">
        <h2 className="font-semibold text-sm">Repasses do mês</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center">
            <div className="text-lg font-bold text-amber-500">R$ {d.repassesPendentesMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
            <div className="text-xs text-muted-foreground">Pendentes</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-primary">R$ {d.repassesPagos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
            <div className="text-xs text-muted-foreground">Pagos</div>
          </div>
        </div>
      </Card>

      {/* Rankings */}
      <div className="grid grid-cols-1 gap-3">
        {d.topProfissionais.length > 0 && (
          <Card className="p-4 space-y-2">
            <h2 className="font-semibold text-sm">Top Profissionais</h2>
            {d.topProfissionais.map((p, i) => (
              <div key={p.nome} className="flex items-center justify-between text-sm">
                <span>{i + 1}. {p.nome}</span>
                <span className="font-semibold text-primary">{p.count}</span>
              </div>
            ))}
          </Card>
        )}
        {d.topServicos.length > 0 && (
          <Card className="p-4 space-y-2">
            <h2 className="font-semibold text-sm">Top Serviços</h2>
            {d.topServicos.map((s, i) => (
              <div key={s.nome} className="flex items-center justify-between text-sm">
                <span>{i + 1}. {s.nome}</span>
                <span className="font-semibold text-primary">{s.count}</span>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Resumo geral */}
      <Card className="p-4 space-y-2">
        <h2 className="font-semibold text-sm">Resumo geral</h2>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted-foreground">Total pacientes</span><span className="font-medium text-right">{d.totalPacientes}</span>
          <span className="text-muted-foreground">Profissionais ativos</span><span className="font-medium text-right">{d.totalProfissionais}</span>
          <span className="text-muted-foreground">Médicos cadastrados</span><span className="font-medium text-right">{d.medicosCadastrados}</span>
          <span className="text-muted-foreground">Médicos visitados (30d)</span><span className="font-medium text-right">{d.medicosVisitados}</span>
          <span className="text-muted-foreground">Pacotes ativos</span><span className="font-medium text-right">{d.pacotesAtivos}</span>
          <span className="text-muted-foreground">Alertas de estoque</span><span className="font-medium text-right text-destructive">{d.alertasEstoque}</span>
        </div>
      </Card>
    </div>
  );
}

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
