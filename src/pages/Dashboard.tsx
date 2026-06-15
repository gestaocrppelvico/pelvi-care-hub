import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar, Users, FileText, CheckCircle, Clock, AlertTriangle, MessageCircle, Cake, UserX, ArrowRight, ShieldAlert, Link2, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { abrirWhatsapp } from "@/lib/crm";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import DashboardFisio from "./DashboardFisio";

export default function Dashboard() {
  const { user, isFisio, isSecretaria, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(true);

  // Estados dos blocos de dados
  const [atendimentosHoje, setAtendimentosHoje] = useState<any[]>([]);
  const [atendimentosAmanha, setAtendimentosAmanha] = useState<any[]>([]);
  const [aniversariantesHoje, setAniversariantesHoje] = useState<any[]>([]);
  const [dataCrmAlvo, setDataCrmAlvo] = useState<Date>(new Date());

  // Estados dos Gatilhos Inteligentes (Smart Tasks)
  const [guiasExpirando, setGuiasExpirando] = useState<any[]>([]);
  const [totalOrfaos, setTotalOrfaos] = useState(0);
  const [fichasIncompletas, setFichasIncompletas] = useState<any[]>([]);

  useEffect(() => {
    async function carregarDashboard() {
      if (!user) return;
      setLoading(true);
      try {
        // 1. Nome do Usuário
        const { data: prof } = await supabase.from("profiles").select("nome_completo").eq("id", user.id).maybeSingle();
        setNome(prof?.nome_completo?.split(" ")[0] ?? "");

        const hoje = new Date();
        const startHoje = startOfDay(hoje).toISOString();
        const endHoje = endOfDay(hoje).toISOString();

        // Cálculo da Data Inteligente para o CRM Reduzido (Próximo Dia Útil)
        const diaSemana = hoje.getDay(); // 5 = Sexta, 6 = Sábado, 0 = Domingo
        let dataProxima = addDays(hoje, 1);
        if (diaSemana === 5) dataProxima = addDays(hoje, 3);
        if (diaSemana === 6) dataProxima = addDays(hoje, 2);
        if (diaSemana === 0) dataProxima = addDays(hoje, 1);
        setDataCrmAlvo(dataProxima);

        const startProximo = startOfDay(dataProxima).toISOString();
        const endProximo = endOfDay(dataProxima).toISOString();

        // Executa todas as consultas de auditoria de forma simultânea
        const [
          resHoje,
          resProximo,
          resPacientes,
          resGuias,
          resOrfaos
        ] = await Promise.all([
          // Atendimentos de Hoje
          supabase.from("atendimentos").select("id, data_inicio, status, nome_paciente_livre, paciente:pacientes(nome), profissional:profissionais(nome)").gte("data_inicio", startHoje).lte("data_inicio", endHoje).not("status", "eq", "cancelado"),
          // Atendimentos do Próximo dia útil (CRM)
          supabase.from("atendimentos").select("id, data_inicio, nome_paciente_livre, paciente:pacientes(nome), profissional:profissionais(nome)").gte("data_inicio", startProximo).lte("data_inicio", endProximo).eq("status", "agendado"),
          // Todos os pacientes para cálculo de aniversário e fichas incompletas
          supabase.from("pacientes").select("id, nome, telefone, data_nascimento").eq("ativo", true),
          // Gatilho: Contratos ou guias com saldo terminando (<= 2 sessões)
          supabase.from("paciente_pacotes").select("id, sessoes_restantes, sessoes_totais, paciente:pacientes(nome), pacote:pacotes(nome), servico:servicos(nome), autorizacao:autorizacoes(plano)").gt("sessoes_restantes", 0).lte("sessoes_restantes", 2),
          // Gatilho: Quantidade de atendimentos sem vínculo
          supabase.from("atendimentos").select("id", { count: "exact", head: true }).is("paciente_id", null)
        ]);

        // Processa Atendimentos de Hoje
        setAtendimentosHoje(resHoje.data || []);
        setAtendimentosAmanha(resProximo.data || []);
        setTotalOrfaos(resOrfaos.count || 0);
        setGuiasExpirando(resGuias.data || []);

        // Processa Aniversariantes e Fichas Incompletas
        const mmDdHoje = format(hoje, "MM-dd");
        const nivers: any[] = [];
        const incompletas: any[] = [];

        (resPacientes.data || []).forEach((p) => {
          // Verifica Aniversário
          if (p.data_nascimento && p.data_nascimento.slice(5) === mmDdHoje) {
            nivers.push(p);
          }
          // Gatilho: Dados Faltantes (Sem telefone ou sem data de nascimento)
          if (!p.telefone || !p.data_nascimento) {
            incompletas.push({
              id: p.id,
              nome: p.nome,
              motivo: !p.telefone && !p.data_nascimento 
                ? "Sem Telefone e Data Nasc." 
                : !p.telefone 
                  ? "Sem Telefone" 
                  : "Sem Data Nasc."
            });
          }
        });

        setAniversariantesHoje(nivers);
        setFichasIncompletas(incompletas.slice(0, 5)); // Limitamos top 5 no painel para não estourar layout

      } catch (err) {
        console.error("Erro ao processar dashboard:", err);
      } finally {
        setLoading(false);
      }
    };

    carregarDashboard();
  }, [user]);

  // Agrupa os atendimentos de hoje pelo nome do profissional
  const atendimentosAgrupadosPorProf = useMemo(() => {
    const grupos: Record<string, any[]> = {};
    atendimentosHoje.forEach((at) => {
      const profNome = at.profissional?.nome || "Profissional Não Definido";
      if (!grupos[profNome]) grupos[profNome] = [];
      grupos[profNome].push(at);
    });
    return grupos;
  }, [atendimentosHoje]);

  const parabenizar = (p: any) => {
    const msg = `Olá ${p.nome.split(" ")[0]}! 🎉 Nós da clínica passamos para te desejar um feliz aniversário! Que seu novo ciclo seja repleto de saúde e conquistas. Parabéns! 🎂`;
    abrirWhatsapp(p.telefone, msg, isSecretaria);
  };

  if (isFisio && !isAdmin && !isSecretaria) {
    return <DashboardFisio />;
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Carregando painel de controle...</div>;

  return (
    <div className="space-y-5 p-2">
      {/* Mensagem de Boas-vindas */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Olá, {nome || "Secretária"} 👋</h1>
        <p className="text-xs text-muted-foreground">Aqui está o balanço e as ações preventivas para o dia de hoje.</p>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* BLOCO 1: RESUMO DE ATENDIMENTOS DO DIA (SEPARADO POR PROFISSIONAL) */}
      {/* ---------------------------------------------------------------------- */}
      <Card className="p-4 shadow-sm border-t-4 border-t-blue-600">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600" /> Grade de Atendimentos de Hoje
        </h2>
        
        {atendimentosHoje.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">Nenhum atendimento registrado para o dia de hoje.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(atendimentosAgrupadosPorProf).map(([profNome, lista]) => (
              <Card key={profNome} className="p-3 bg-slate-50/50 border shadow-inner">
                <div className="font-bold text-xs text-blue-800 border-b pb-1.5 mb-2 uppercase flex justify-between items-center">
                  <span>{profNome}</span>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10px] h-5">{lista.length} sessões</Badge>
                </div>
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {lista.map((at) => (
                    <div key={at.id} className="flex items-center justify-between text-xs p-2 bg-white rounded border shadow-sm">
                      <div className="truncate font-medium text-slate-700 max-w-[70%]">
                        {at.paciente?.nome || at.nome_paciente_livre || "Particular"}
                      </div>
                      <div className="flex items-center gap-1.5 font-bold shrink-0 text-slate-500">
                        <Clock className="w-3 h-3 text-primary" />
                        {format(new Date(at.data_inicio), "HH:mm")}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* PAINEL CENTRAL DIVIDIDO EM DUAS COLUNAS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* ---------------------------------------------------------------------- */}
        {/* BLOCO 2: GATILHOS INTELIGENTES (SMART TASKS) - COLUNAS 1 ATÉ 7 */}
        {/* ---------------------------------------------------------------------- */}
        <Card className="p-4 shadow-sm lg:col-span-7 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 border-b pb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Ações e Gatilhos Pendentes
          </h2>

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {/* Gatilho 1: Sessões/Guias Terminando */}
            {guiasExpirando.map((g) => (
              <div key={g.id} className="p-2.5 border border-amber-200 bg-amber-50/40 rounded-lg flex items-center justify-between gap-3 text-xs">
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-amber-800 uppercase block text-[10px] tracking-wide">Renovação Necessária</span>
                  <p className="font-semibold text-slate-700 truncate">{g.paciente?.nome}</p>
                  <p className="text-muted-foreground truncate">{g.autorizacao ? `Plano ${g.autorizacao.plano}` : `Pacote: ${g.pacote?.nome || g.servico?.nome}`}</p>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="destructive" className="bg-amber-600 text-white font-bold h-6">
                    {g.sessoes_restantes} rest.
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-7 w-7 mt-1 text-amber-700" onClick={() => navigate(`/pacientes/${g.paciente_id}`)}>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Gatilho 2: Atendimentos Órfãos da Agenda */}
            {totalOrfaos > 0 && (
              <div className="p-2.5 border border-blue-200 bg-blue-50/30 rounded-lg flex items-center justify-between gap-3 text-xs">
                <div className="flex-1">
                  <span className="font-bold text-blue-700 uppercase block text-[10px] tracking-wide">Faturamento Travado</span>
                  <p className="font-semibold text-slate-700">Existem {totalOrfaos} agendamentos sem identificação</p>
                  <p className="text-muted-foreground">Vincule-os para computar os prontuários e repasses.</p>
                </div>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm shrink-0" onClick={() => navigate("/crm/vinculos")}>
                  <Link2 className="w-3.5 h-3.5 mr-1" /> Resolver
                </Button>
              </div>
            )}

            {/* Gatilho 3: Fichas de Pacientes Incompletas */}
            {fichasIncompletas.map((f) => (
              <div key={f.id} className="p-2.5 border border-slate-200 bg-slate-50/50 rounded-lg flex items-center justify-between gap-3 text-xs">
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-slate-500 uppercase block text-[10px] tracking-wide">Ficha Incompleta</span>
                  <p className="font-semibold text-slate-700 truncate">{f.nome}</p>
                  <p className="text-red-500 font-medium text-[11px]">{f.motivo}</p>
                </div>
                <Button size="icon" variant="outline" className="h-7 w-7 shrink-0 text-slate-600" onClick={() => navigate(`/pacientes/${f.id}/editar`)}>
                  <FileText className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}

            {/* Estado Limpo: Caso nenhum gatilho esteja ativo */}
            {guiasExpirando.length === 0 && totalOrfaos === 0 && fichasIncompletas.length === 0 && (
              <div className="text-center py-10 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                🎉 Parabéns! Nenhuma pendência cadastral ou de guias encontrada no momento.
              </div>
            )}
          </div>
        </Card>

        {/* ---------------------------------------------------------------------- */}
        {/* BLOCO 3: CRM REDUZIDO & ANIVERSARIANTES - COLUNAS 8 ATÉ 12 */}
        {/* ---------------------------------------------------------------------- */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Alerta de Aniversário Premiado */}
          {aniversariantesHoje.length > 0 && (
            <Card className="p-3.5 bg-gradient-to-br from-pink-50 to-rose-50 border-rose-200 border text-xs space-y-2.5 shadow-sm animate-bounce">
              <div className="flex items-center gap-1.5 font-bold text-rose-700">
                <Cake className="w-4 h-4 text-rose-500" />
                <span>ANIVERSARIANTE(S) DE HOJE! 🎉</span>
              </div>
              <div className="space-y-2">
                {aniversariantesHoje.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 bg-white rounded border border-rose-100 shadow-sm">
                    <span className="font-bold text-slate-700 truncate max-w-[60%]">{p.nome}</span>
                    <Button size="sm" variant="outline" className="h-7 text-[11px] text-rose-700 border-rose-200 hover:bg-rose-50" onClick={() => parabenizar(p)}>
                      <MessageCircle className="w-3 h-3 mr-1 text-rose-500" /> Parabenizar
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* CRM Reduzido: Próximo Dia Útil */}
          <Card 
            className="p-4 shadow-sm border-l-4 border-l-indigo-500 bg-white hover:shadow-md transition-all cursor-pointer group"
            onClick={() => navigate("/crm")}
          >
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-500" /> CRM: Próximos Envios
              </h2>
              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                {format(dataCrmAlvo, "dd/MM", { locale: ptBR })}
              </Badge>
            </div>

            <p className="text-[11px] text-muted-foreground mb-3 bg-indigo-50/50 p-1.5 rounded text-center">
              Pacientes agendados para <span className="font-bold capitalize">{format(dataCrmAlvo, "eeee", { locale: ptBR })}</span>. Clique para gerenciar o CRM completo.
            </p>

            <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
              {atendimentosAmanha.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum atendimento agendado para o próximo dia útil.</p>
              ) : (
                atendimentosAmanha.map((at) => (
                  <div key={at.id} className="p-2 border rounded bg-slate-50/30 flex justify-between items-center text-xs">
                    <div className="truncate font-semibold text-slate-700 max-w-[65%]">
                      {at.paciente?.nome || at.nome_paciente_livre}
                    </div>
                    <div className="text-[11px] text-muted-foreground shrink-0 italic">
                      {at.profissional?.nome?.split(" ")[0]} · {format(new Date(at.data_inicio), "HH:mm")}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="text-right text-[11px] font-bold text-indigo-600 mt-3 group-hover:underline flex items-center justify-end gap-1">
              Abrir Painel CRM <ArrowRight className="w-3 h-3" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
