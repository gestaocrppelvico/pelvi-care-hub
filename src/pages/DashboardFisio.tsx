import { useEffect, useState } from "react";
import { startOfMonth, endOfMonth } from "date-fns";
import { Activity, Users, Wallet, Clock, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardFisio() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    atendimentos: 0,
    pacientesUnicos: 0,
    repasseParaCalculo: 0, // Pendentes
    repasseConferido: 0,   // Pagos / Conferidos
    totalPrevisibilidade: 0
  });

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
        const inicioMes = startOfMonth(new Date()).toISOString();
        const fimMes = endOfMonth(new Date()).toISOString();

        // 2. Busca Atendimentos realizados por ela neste mês
        const { data: atendimentos } = await supabase
          .from("atendimentos")
          .select("paciente_id")
          .eq("profissional_id", meuId)
          .eq("status", "realizado")
          .gte("data_inicio", inicioMes)
          .lte("data_inicio", fimMes);

        // Conta quantos pacientes diferentes ela atendeu
        const pacientesUnicos = new Set((atendimentos || []).map(a => a.paciente_id));

        // 3. Busca os Repasses gerados neste mês
        const { data: repasses } = await supabase
          .from("repasses_atendimento")
          .select("valor_repasse, status")
          .eq("profissional_id", meuId)
          .gte("created_at", inicioMes)
          .lte("created_at", fimMes);

        let paraCalculo = 0;
        let conferidos = 0;

        (repasses || []).forEach(r => {
          const valor = Number(r.valor_repasse) || 0;
          if (r.status === "pendente") {
            paraCalculo += valor;
          } else {
            conferidos += valor; // status 'pago' ou 'conferido'
          }
        });

        setMetrics({
          atendimentos: (atendimentos || []).length,
          pacientesUnicos: pacientesUnicos.size,
          repasseParaCalculo: paraCalculo,
          repasseConferido: conferidos,
          totalPrevisibilidade: paraCalculo + conferidos
        });

      } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
      } finally {
        setLoading(false);
      }
    }

    carregarMetricas();
  }, [user]);

  const fmt = (val: number) => val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Carregando seus indicadores...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Meu Painel</h1>
        <p className="text-sm text-muted-foreground">Resumo do seu desempenho e previsibilidade neste mês.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Card 1: Produtividade (Atendimentos) */}
        <Card className="border-l-4 border-l-blue-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Sessões Realizadas</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">{metrics.atendimentos}</div>
            <p className="text-xs text-muted-foreground mt-1">Neste mês</p>
          </CardContent>
        </Card>

        {/* Card 2: Carteira de Pacientes */}
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

        {/* Card 3: Previsibilidade Total */}
        <Card className="border-l-4 border-l-emerald-500 bg-emerald-50/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-emerald-800">Previsibilidade de Repasse</CardTitle>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{fmt(metrics.totalPrevisibilidade)}</div>
            <p className="text-xs text-emerald-600/80 mt-1">Soma de todos os repasses do mês</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Card 4: Para Cálculo */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Repasses para Cálculo</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{fmt(metrics.repasseParaCalculo)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Valores gerados aguardando conferência da administração.
            </p>
          </CardContent>
        </Card>

        {/* Card 5: Conferidos */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Repasses Conferidos</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{fmt(metrics.repasseConferido)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Valores já validados e liberados. Se não baterem, verifique os pendentes.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
