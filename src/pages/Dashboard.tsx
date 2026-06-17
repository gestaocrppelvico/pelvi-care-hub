import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  Calendar, Users, AlertTriangle, CheckCircle, XCircle, 
  TrendingUp, Activity, DollarSign, Stethoscope, Clock
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, startOfDay, isBefore } from "date-fns";
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

  // Estados de Auditoria (Ações)
  const [faltasPendentes, setFaltasPendentes] = useState<any[]>([]);
  const [evolucoesAtrasadas, setEvolucoesAtrasadas] = useState<any[]>([]);
  const [guiasRenovar, setGuiasRenovar] = useState<any[]>([]);

  // Estados de BI (Gráficos)
  const [atendimentosMes, setAtendimentosMes] = useState<any[]>([]);
  const [distribuicaoConvenios, setDistribuicaoConvenios] = useState<any[]>([]);

  useEffect(() => {
    async function carregarDashboardAdmin() {
      if (!user) return;
      setLoading(true);
      try {
        const { data: prof } = await supabase.from("profiles").select("nome_completo").eq("id", user.id).maybeSingle();
        setNome(prof?.nome_completo?.split(" ")[0] ?? "");

        // Se não for Admin, não carrega os dados pesados
        if ((isSecretaria && !isAdmin) || (isFisio && !isAdmin && !isSecretaria)) {
          setLoading(false);
          return; 
        }

        const hoje = new Date();
        const inicioMes = startOfMonth(hoje).toISOString();
        const fimMes = endOfMonth(hoje).toISOString();
        const inicioDia = startOfDay(hoje).toISOString();

        // 1. Buscas de Auditoria Operacional
        const [resFaltas, resEvolucoes, resGuias] = await Promise.all([
          // Faltas marcadas pela recepção/fisio
          supabase.from("atendimentos").select("id, data_inicio, paciente:pacientes(nome), profissional:profissionais(nome)").eq("status", "faltou"),
          // Agendamentos antigos que não foram marcados como "realizado" ou "cancelado" (Esqueceram de evoluir)
          supabase.from("atendimentos").select("id, data_inicio, paciente:pacientes(nome), profissional:profissionais(nome)").eq("status", "agendado").lt("data_inicio", inicioDia),
          // Pacotes de plano de saúde a acabar com intenção de renovar
          supabase.from("paciente_pacotes").select("id, paciente_id, sessoes_restantes, autorizacao:autorizacoes(plano), paciente:pacientes(nome)").not("autorizacao_id", "is", null).eq("status_renovacao", "vai_renovar")
        ]);

        // 2. Buscas para BI e Gráficos
        const resAtendimentosMes = await supabase.from("atendimentos").select("id, data_inicio, status, profissional:profissionais(nome)").gte("data_inicio", inicioMes).lte("data_inicio", fimMes).not("status", "eq", "cancelado");
        const resPacotesPlano = await supabase.from("paciente_pacotes").select("id, autorizacao:autorizacoes(plano)");

        setFaltasPendentes(resFaltas.data || []);
        setEvolucoesAtrasadas((resEvolucoes.data || []).slice(0, 10)); // Top 10 mais urgentes
        setGuiasRenovar(resGuias.data || []);
        setAtendimentosMes(resAtendimentosMes.data || []);

        // Processar Dados para o Gráfico de Rosca (Particular vs Planos)
        const contagemPlanos: Record<string, number> = { "Particular": 0 };
        (resPacotesPlano.data || []).forEach(p => {
          if (p.autorizacao?.plano) {
            contagemPlanos[p.autorizacao.plano] = (contagemPlanos[p.autorizacao.plano] || 0) + 1;
          } else {
            contagemPlanos["Particular"] += 1;
          }
        });
        setDistribuicaoConvenios(Object.entries(contagemPlanos).map(([name, value]) => ({ name, value })).filter(i => i.value > 0));

      } catch (err) {
        console.error("Erro ao carregar BI:", err);
      } finally {
        setLoading(false);
      }
    }
    carregarDashboardAdmin();
  }, [user, isSecretaria, isAdmin, isFisio]);

  // Processamento de Dados dos Gráficos
  const dadosGraficoLinha = useMemo(() => {
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

  // Funções de Ação (Gestor)
  const processarFalta = async (id: string, decisao: "cobrada" | "abonada") => {
    try {
      const { error } = await supabase.from("atendimentos").update({ status: `falta_${decisao}` }).eq("id", id);
      if (error) throw error;
      toast.success(`Falta ${decisao} registada com sucesso!`);
      setFaltasPendentes(prev => prev.filter(f => f.id !== id));
      // Nota: A lógica complexa de subtrair saldo deverá ser acoplada numa Cloud Function no futuro, 
      // ou tratada aqui expandindo esta função.
    } catch (err: any) {
      toast.error("Erro ao processar falta.");
    }
  };

  // ==========================================
  // ROTEAMENTO DE UTILIZADORES
  // ==========================================
  if (isSecretaria && !isAdmin) return <DashboardSecretaria nomeUsuario={nome} />;
  if (isFisio && !isAdmin && !isSecretaria) return <DashboardFisio />;

  // ==========================================
  // PAINEL GERENCIAL (FELIPE / JULIANA)
  // ==========================================
  if (loading) return <div className="p-10 text-center text-muted-foreground animate-pulse">A carregar o Painel de Gestão (BI)...</div>;

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

      {/* 1º ANDAR: AUDITORIA E AÇÕES IMEDIATAS (PRONTO-SOCORRO) */}
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

        {/* Renovações de Convénios */}
        <Card className="p-0 overflow-hidden shadow-sm border-t-4 border-t-blue-500 flex flex-col h-64">
          <div className="bg-blue-50/50 p-3 border-b border-blue-100 flex items-center justify-between">
            <h3 className="font-bold text-xs uppercase tracking-wider text-blue-700 flex items-center gap-1.5"><Stethoscope className="w-4 h-4"/> Renovar Guias</h3>
            <Badge className="bg-blue-100 text-blue-700">{guiasRenovar.length}</Badge>
          </div>
          <div className="p-3 overflow-y-auto flex-1 space-y-2">
            {guiasRenovar.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground mt-10">Nenhum convénio a expirar.</p>
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

        {/* Evoluções Atrasadas */}
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

      {/* 2º ANDAR: INDICADORES E GRÁFICOS (BI) */}
      <h2 className="text-lg font-bold text-slate-800 mt-8 mb-4 border-b pb-2 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-indigo-600"/> Indicadores de Desempenho (Mês Atual)
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Gráfico 1: Ritmo de Atendimentos */}
        <Card className="p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 text-center">Curva de Atendimentos Mensal</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dadosGraficoLinha}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="dia" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                <YAxis tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                <ChartTooltip contentStyle={{ borderRadius: '8px', fontSize: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Line type="monotone" dataKey="Atendimentos" stroke="#4f46e5" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Gráfico 2: Particular vs Convénios */}
          <Card className="p-4 shadow-sm flex flex-col justify-center items-center">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 text-center w-full">Receita: Particular vs Planos</h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={distribuicaoConvenios} innerRadius={50} outerRadius={70} paddingAngle={3} dataKey="value">
                    {distribuicaoConvenios.map((entry, index) => <Cell key={`cell-${index}`} fill={CORES_PIZZA[index % CORES_PIZZA.length]} />)}
                  </Pie>
                  <ChartTooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Gráfico 3: Ocupação por Profissional */}
          <Card className="p-4 shadow-sm flex flex-col justify-center items-center">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 text-center w-full">Ocupação / Repasses Estimados</h3>
            <div className="h-48 w-full">
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

      </div>
    </div>
  );
}
