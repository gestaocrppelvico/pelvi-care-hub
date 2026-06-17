import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Calendar, Users, AlertTriangle, CheckCircle, XCircle, 
  TrendingUp, Activity, DollarSign, Clock, Stethoscope, Briefcase
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, startOfDay } from "date-fns";
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

        // Otimização: bloqueia o carregamento de dados pesados se não for admin
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
          supabase.from("atendimentos").select("id, data_inicio, paciente:pacientes(nome), profissional:profissionais(nome)").eq("status", "faltou"),
          supabase.from("atendimentos").select("id, data_inicio, paciente:pacientes(nome), profissional:profissionais(nome)").eq("status", "agendado").lt("data_inicio", inicioDia),
          supabase.from("paciente_pacotes").select("id, paciente_id, sessoes_restantes, autorizacao:autorizacoes(plano), paciente:pacientes(nome)").not("autorizacao_id", "is", null).eq("status_renovacao", "vai_renovar")
        ]);

        // 2. Buscas para BI e Gráficos
        const resAtendimentosMes = await supabase.from("atendimentos").select("id, data_inicio, status, profissional:profissionais(nome)").gte("data_inicio", inicioMes).lte("data_inicio", fimMes).not("status", "eq", "cancelado");
        const resPacotesPlano = await supabase.from("paciente_pacotes").select("id, autorizacao:autorizacoes(plano)");

        setFaltasPendentes(resFaltas.data || []);
        setEvolucoesAtrasadas((resEvolucoes.data || []).slice(0, 10));
        setGuiasRenovar(resGuias.data || []);
        setAtendimentosMes(resAtendimentosMes.data || []);

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

  const dadosGraficoLinha = useMemo(() => {
    const dias: Record<string, number> = {};
    atendimentosMes.forEach(at => {
      const dia = format(new Date(at.data_inicio), "dd/MM", { locale: ptBR });
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

  const processarFalta = async (id: string, decisao: "cobrada" | "abonada") => {
    try {
      const { error } = await supabase.from("atendimentos").update({ status: `falta_${decisao}` }).eq("id", id);
      if (error) throw error;
      toast.success(`Falta ${decisao} registada!`);
      setFaltasPendentes(prev => prev.filter(f => f.id !== id));
    } catch (err: any) {
      toast.error("Erro ao processar falta.");
    }
  };

  // ROTEAMENTO INTELIGENTE
  if (isSecretaria && !isAdmin) return <DashboardSecretaria nomeUsuario={nome} />;
  if (isFisio && !isAdmin && !isSecretaria) return <DashboardFisio />;

  // SE CHEGOU AQUI, É ADMIN (FELIPE/JULIANA)
  if (loading) return <div className="p-10 text-center text-muted-foreground animate-pulse">A carregar o Cockpit de Gestão...</div>;

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8">
      {/* Container principal otimizado para monitores largos */}
      <div className="max-w-[1600px] mx-auto space-y-8">
        
        {/* HEADER RESPONSIVO */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">Cockpit de Gestão</h1>
            <p className="text-sm md:text-base text-slate-500 font-medium mt-1">Olá, {nome}. Este é o panorama gerencial da clínica.</p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <Button variant="outline" size="lg" onClick={() => navigate("/agenda")} className="flex-1 md:flex-none border-slate-300 shadow-sm"><Calendar className="w-4 h-4 mr-2"/> Agenda</Button>
            <Button size="lg" onClick={() => navigate("/pacientes")} className="flex-1 md:flex-none bg-slate-900 hover:bg-slate-800 shadow-sm"><Users className="w-4 h-4 mr-2"/> Pacientes</Button>
          </div>
        </header>

        {/* ESTRUTURA EM GRID: 12 COLUNAS NO DESKTOP */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* COLUNA ESQUERDA (3/12 no Desktop): AUDITORIA (Sticky) */}
          <aside className="lg:col-span-4 xl:col-span-3 space-y-6">
            <div className="lg:sticky lg:top-8 space-y-6">
              
              {/* Card de Faltas */}
              <Card className="p-0 overflow-hidden shadow-sm border-t-4 border-t-rose-500 flex flex-col max-h-[400px]">
                <div className="bg-rose-50/50 p-4 border-b border-rose-100 flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-rose-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> Faltas Pendentes</h3>
                  <Badge className="bg-rose-100 text-rose-700">{faltasPendentes.length}</Badge>
                </div>
                <div className="p-3 overflow-y-auto flex-1 space-y-2">
                  {faltasPendentes.length === 0 ? (
                    <p className="text-xs text-center text-muted-foreground py-6">Nenhuma falta para auditar.</p>
                  ) : (
                    faltasPendentes.map(f => (
                      <div key={f.id} className="text-sm border border-slate-100 rounded-xl p-3 bg-white shadow-sm hover:border-rose-200 transition-all">
                        <div className="font-bold text-slate-800 truncate">{f.paciente?.nome}</div>
                        <div className="text-xs text-muted-foreground mt-1 mb-3 flex justify-between">
                          <span>{format(new Date(f.data_inicio), "dd/MM 'às' HH:mm")}</span>
                          <span className="uppercase text-slate-400 font-semibold">{f.profissional?.nome?.split(" ")[0]}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-8 text-xs flex-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => processarFalta(f.id, "abonada")}><CheckCircle className="w-3 h-3 mr-1"/> Abonar</Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs flex-1 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => processarFalta(f.id, "cobrada")}><XCircle className="w-3 h-3 mr-1"/> Cobrar</Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* Card de Guias */}
              <Card className="p-0 overflow-hidden shadow-sm border-t-4 border-t-blue-500 flex flex-col max-h-[300px]">
                <div className="bg-blue-50/50 p-4 border-b border-blue-100 flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-blue-700 flex items-center gap-2"><Stethoscope className="w-4 h-4"/> Renovar Guias</h3>
                  <Badge className="bg-blue-100 text-blue-700">{guiasRenovar.length}</Badge>
                </div>
                <div className="p-3 overflow-y-auto flex-1 space-y-2">
                  {guiasRenovar.length === 0 ? (
                    <p className="text-xs text-center text-muted-foreground py-6">Nenhum convênio expirando.</p>
                  ) : (
                    guiasRenovar.map(g => (
                      <div key={g.id} className="text-sm border border-slate-100 rounded-xl p-3 bg-white shadow-sm flex flex-col gap-2 hover:border-blue-200 cursor-pointer transition-all" onClick={() => navigate(`/pacientes/${g.paciente_id}`)}>
                        <div className="font-bold text-slate-800 truncate">{g.paciente?.nome}</div>
                        <div className="flex justify-between items-center">
                          <div className="text-xs text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded">{g.autorizacao?.plano}</div>
                          <span className="text-[10px] font-semibold text-slate-400">Restam {g.sessoes_restantes}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

            </div>
          </aside>

          {/* COLUNA DIREITA (9/12 no Desktop): DASHBOARD BI */}
          <main className="lg:col-span-8 xl:col-span-9 space-y-8">
            
            {/* Linha de KPIs (4 colunas no Desktop grande, 2 no Tablet) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { label: "Atendimentos / Mês", val: atendimentosMes.length, icon: Calendar, color: "text-indigo-600", bg: "bg-indigo-50" },
                { label: "Faturamento Previsto", val: "R$ ---", icon: DollarSign, color: "text-amber-600", bg: "bg-amber-50" },
                { label: "Ocupação Estimada", val: "---", icon: Activity, color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "Evoluções Atrasadas", val: evolucoesAtrasadas.length, icon: Clock, color: "text-rose-600", bg: "bg-rose-50" },
              ].map((stat, i) => (
                <Card key={i} className="p-5 flex items-center gap-4 shadow-sm border-slate-200/60 hover:shadow-md transition-shadow">
                  <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}><stat.icon className="w-6 h-6"/></div>
                  <div>
                    <p className="text-[10px] md:text-xs uppercase font-bold text-slate-400 tracking-wider mb-0.5">{stat.label}</p>
                    <p className="text-xl md:text-2xl font-black text-slate-800">{stat.val}</p>
                  </div>
                </Card>
              ))}
            </div>

            {/* Linha de Gráficos */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              
              {/* Gráfico Ocupação Total */}
              <Card className="p-6 shadow-sm border-slate-200/60 xl:col-span-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-6 flex items-center gap-2"><TrendingUp className="w-4 h-4"/> Ritmo de Atendimentos Mensal</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dadosGraficoLinha} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="dia" tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                      <YAxis tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                      <ChartTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Line type="monotone" dataKey="Atendimentos" stroke="#4f46e5" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Gráfico Pizza */}
              <Card className="p-6 shadow-sm border-slate-200/60 flex flex-col">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Receita: Particular vs Planos</h3>
                <div className="flex-1 min-h-[250px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={distribuicaoConvenios} innerRadius={60} outerRadius={85} paddingAngle={2} dataKey="value">
                        {distribuicaoConvenios.map((entry, index) => <Cell key={`cell-${index}`} fill={CORES_PIZZA[index % CORES_PIZZA.length]} />)}
                      </Pie>
                      <ChartTooltip contentStyle={{ borderRadius: '8px' }} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Gráfico Barras */}
              <Card className="p-6 shadow-sm border-slate-200/60 flex flex-col">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Ocupação / Repasses Estimados</h3>
                <div className="flex-1 min-h-[250px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dadosOcupacao} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                      <YAxis tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                      <ChartTooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px' }} />
                      <Bar dataKey="Atendimentos" fill="#0ea5e9" radius={[6, 6, 0, 0]} maxBarSize={60} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

            </div>
          </main>

        </div>
      </div>
    </div>
  );
}
