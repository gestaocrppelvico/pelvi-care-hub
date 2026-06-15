import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar, Users, Clock, AlertTriangle, MessageCircle, Cake, ArrowRight, Link2, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { abrirWhatsapp } from "@/lib/crm";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

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

        // Executa todas as consultas de auditoria em paralelo para máxima performance
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
          // Todos os pacientes ativos para cálculo de aniversários e fichas incompletas
          supabase.from("pacientes").select("id, nome, telefone, data_nascimento").eq("ativo", true),
          // Gatilho: Contratos ou guias com saldo terminando (<= 2 sessões)
          supabase.from("paciente_pacotes").select("id, sessoes_restantes, sessoes_totais, paciente_id, paciente:pacientes(nome), pacote:pacotes(nome), servico:servicos(nome), autorizacao:autorizacoes(plano)").gt("sessoes_restantes", 0).lte("sessoes_restantes", 2),
          // Gatilho: Quantidade de atendimentos sem vínculo
          supabase.from("atendimentos").select("id", { count: "exact", head: true }).is("paciente_id", null)
        ]);

        setAtendimentosHoje(resHoje.data || []);
        setAtendimentosAmanha(resProximo.data || []);
        setTotalOrfaos(resOrfaos.count || 0);
        setGuiasExpirando(resGuias.data || []);

        // Processa Aniversariantes e Fichas Incompletas localmente
        const mmDdHoje = format(hoje, "MM-dd");
        const nivers: any[] = [];
        const incompletas: any[] = [];

        (resPacientes.data || []).forEach((p) => {
          // Verifica Aniversário hoje
          if (p.data_nascimento && p.data_nascimento.slice(5) === mmDdHoje) {
            nivers.push(p);
          }
          // Gatilho: Dados em falta na Ficha (Sem telefone ou sem data de nascimento)
          if (!p.telefone || !p.data_nascimento) {
            incompletas.push({
              id: p.id,
              nome: p.nome,
              motivo: !p.telefone && !p.data_nascimento 
                ? "Falta Telefone e Nascimento" 
                : !p.telefone 
                  ? "Falta Telefone" 
                  : "Falta Data de Nascimento"
            });
          }
        });

        setAniversariantesHoje(nivers);
        setFichasIncompletas(incompletas.slice(0, 5)); // Exibe no máximo as 5 mais antigas para organizar o layout

      } catch (err) {
        console.error("Erro ao carregar os blocos do dashboard:", err);
      } finally {
        setLoading(false);
      }
    };

    carregarDashboard();
  }, [user]);

  // Agrupa os atendimentos de hoje por profissional fisio
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
    const msg = `Olá ${p.nome.split(" ")[0]}! 🎉 Nós da clínica CRPPélvico passamos para lhe desejar um feliz aniversário! Que o seu novo ciclo seja repleto de saúde, paz e conquistas. Parabéns! 🎂`;
    abrirWhatsapp(p.telefone, msg, isSecretaria);
  };

  if (isFisio && !isAdmin && !isSecretaria) {
    return <DashboardFisio />;
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">A carregar o Centro de Comando...</div>;

  return (
    <div className="space-y-5 p-2">
      {/* Cabeçalho de Boas-vindas */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Olá, {nome || "Secretária"} 👋</h1>
        <p className="text-xs text-muted-foreground">Bem-vinda ao seu painel de monitorização diária.</p>
      </div>

      {/* CORREÇÃO DO LAYOUT: BOTÃO DA AGENDA E PACIENTES LADO A LADO */}
      <div className="grid grid-cols-2 gap-4">
        <Link to="/agenda">
          <Card className="p-4 flex items-center gap-3 hover:bg-blue-50/50 hover:border-blue-300 transition-all cursor-pointer border shadow-sm">
            <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-800">Ver Agenda</div>
              <div className="text-xs text-muted-foreground truncate">Horários do dia</div>
            </div>
          </Card>
        </Link>

        <Link to="/pacientes">
          <Card className="p-4 flex items-center gap-3 hover:bg-emerald-50/50 hover:border-emerald-300 transition-all cursor-pointer border shadow-sm">
            <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-800">Pacientes</div>
              <div className="text-xs text-muted-foreground truncate">Consultar fichas</div>
            </div>
          </Card>
        </Link>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* BLOCO 1: RESUMO DE ATENDIMENTOS DO DIA (SEPARADO POR PROFISSIONAL) */}
      {/* ---------------------------------------------------------------------- */}
      <Card className="p-4 shadow-sm border-t-4 border-t-blue-600">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" /> Atendimentos Programados para Hoje
        </h2>
        
        {atendimentosHoje.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg bg-slate-50/50">
            Nenhum atendimento registado para o dia de hoje.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(atendimentosAgrupadosPorProf).map(([profNome, lista]) => (
              <Card key={profNome} className="p-3 bg-slate-50/60 border shadow-sm">
                <div className="font-bold text-xs text-blue-900 border-b pb-2 mb-2 uppercase flex justify-between items-center">
                  <span className="truncate pr-2">{profNome}</span>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10px] px-1.5 h-5 shrink-0 font-bold">{lista.length}</Badge>
                </div>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                  {lista.map((at) => (
                    <div key={at.id} className="flex items-center justify-between text-xs p-2 bg-white rounded border shadow-sm hover:border-blue-200 transition-colors">
                      <div className="truncate font-semibold text-slate-700 max-w-[70%]">
                        {at.paciente?.nome || at.nome_paciente_livre || "Sem nome"}
                      </div>
                      <div className="flex items-center gap-1 font-bold shrink-0 text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
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

      {/* PAINEL CENTRAL INFERIOR DIVIDIDO EM DUAS COLUNAS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* ---------------------------------------------------------------------- */}
        {/* BLOCO 2: GATILHOS INTELIGENTES (SMART TASKS) */}
        {/* ---------------------------------------------------------------------- */}
        <Card className="p-4 shadow-sm lg:col-span-7 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 border-b pb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Ações e Alertas Pendentes
          </h2>

          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {/* Gatilho de Guias/Sessões terminando */}
            {guiasExpirando.map((g) => (
              <div key={g.id} className="p-3 border border-amber-200 bg-amber-50/30 rounded-xl flex items-center justify-between gap-3 text-xs hover:bg-amber-50/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-amber-700 uppercase block text-[9px] tracking-wide mb-0.5">Cobrar novo pacote / Renovação</span>
                  <p className="font-bold text-slate-800 truncate text-sm">{g.paciente?.nome}</p>
                  <p className="text-muted-foreground truncate">{g.autorizacao ? `Guia do Plano: ${g.autorizacao.plano}` : `Contrato: ${g.pacote?.nome || g.servico?.nome || "Particular"}`}</p>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <Badge className="bg-amber-600 text-white font-bold text-[10px] px-2 h-5">
                    {g.sessoes_restantes} {g.sessoes_restantes === 1 ? "restante" : "restantes"}
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-700 hover:bg-amber-100" onClick={() => navigate(`/pacientes/${g.paciente_id}`)}>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Gatilho de Vínculos pendentes na Agenda */}
            {totalOrfaos > 0 && (
              <div className="p-3 border border-blue-200 bg-blue-50/20 rounded-xl flex items-center justify-between gap-3 text-xs hover:bg-blue-50/40 transition-colors">
                <div className="flex-1">
                  <span className="font-bold text-blue-700 uppercase block text-[9px] tracking-wide mb-0.5">Auditoria de Vínculo</span>
                  <p className="font-bold text-slate-800 text-sm">Existem {totalOrfaos} agendamentos "órfãos"</p>
                  <p className="text-muted-foreground">Identifique os nomes importados do Google Calendar para liberar repasses.</p>
                </div>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shrink-0 shadow-sm" onClick={() => navigate("/crm/vinculos")}>
                  <Link2 className="w-3.5 h-3.5 mr-1" /> Resolver
                </Button>
              </div>
            )}

            {/* Gatilho de Fichas Incompletas (Falta telefone ou nascimento) */}
            {fichasIncompletas.map((f) => (
              <div key={f.id} className="p-3 border border-slate-200 bg-slate-50/50 rounded-xl flex items-center justify-between gap-3 text-xs hover:bg-slate-100/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-slate-500 uppercase block text-[9px] tracking-wide mb-0.5">Dados em Falta</span>
                  <p className="font-bold text-slate-800 truncate text-sm">{f.nome}</p>
                  <p className="text-red-500 font-semibold text-[11px] mt-0.5">{f.motivo}</p>
                </div>
                <Button size="icon" variant="outline" className="h-8 w-8 shrink-0 text-slate-600" onClick={() => navigate(`/pacientes/${f.id}/editar`)}>
                  <FileText className="w-4 h-4" />
                </Button>
              </div>
            ))}

            {/* Estado Vazio */}
            {guiasExpirando.length === 0 && totalOrfaos === 0 && fichasIncompletas.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground border-2 border-dashed rounded-xl bg-slate-50/30">
                🎉 Tudo em dia! Nenhuma pendência de guias ou cadastros pendentes hoje.
              </div>
            )}
          </div>
        </Card>

        {/* ---------------------------------------------------------------------- */}
        {/* BLOCO 3: CRM REDUZIDO & ANIVERSARIANTES */}
        {/* ---------------------------------------------------------------------- */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Banner Festivo de Aniversariantes */}
          {aniversariantesHoje.length > 0 && (
            <Card className="p-3.5 bg-gradient-to-br from-pink-50 to-rose-50 border-rose-200 border text-xs space-y-2.5 shadow-sm">
              <div className="flex items-center gap-1.5 font-bold text-rose-700 uppercase tracking-wider text-[10px]">
                <Cake className="w-4 h-4 text-rose-500 animate-bounce" />
                <span>Aniversariantes de Hoje! 🎂</span>
              </div>
              <div className="space-y-1.5">
                {aniversariantesHoje.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-rose-100 shadow-sm text-xs">
                    <span className="font-bold text-slate-700 truncate max-w-[60%]">{p.nome}</span>
                    <Button size="sm" variant="outline" className="h-7 text-[11px] text-rose-700 border-rose-200 hover:bg-rose-100/50 font-semibold" onClick={() => parabenizar(p)}>
                      <MessageCircle className="w-3 h-3 mr-1 text-rose-500" /> Mensagem
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Mini-CRM: Confirmações do Próximo Dia Útil */}
          <Card 
            className="p-4 shadow-sm border-l-4 border-l-indigo-500 bg-white hover:shadow-md transition-all cursor-pointer group"
            onClick={() => navigate("/crm")}
          >
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-500" /> CRM: Lembretes de Amanhã
              </h2>
              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 font-bold px-2 h-5 text-[10px] group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                {format(dataCrmAlvo, "dd/MM", { locale: ptBR })}
              </Badge>
            </div>

            <p className="text-[11px] text-muted-foreground mb-3 bg-indigo-50/40 p-2 rounded-lg text-center">
              Pacientes agendados para <span className="font-bold capitalize text-indigo-700">{format(dataCrmAlvo, "eeee", { locale: ptBR })}</span>. Clique para gerenciar os envios.
            </p>

            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
              {atendimentosAmanha.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum atendimento agendado para o próximo dia útil.</p>
              ) : (
                atendimentosAmanha.map((at) => (
                  <div key={at.id} className="p-2 border rounded-lg bg-slate-50/50 flex justify-between items-center text-xs">
                    <div className="truncate font-bold text-slate-700 max-w-[60%]">
                      {at.paciente?.nome || at.nome_paciente_livre || "Particular"}
                    </div>
                    <div className="text-[11px] text-muted-foreground shrink-0 text-right font-medium">
                      {at.profissional?.nome?.split(" ")[0]} · <span className="font-bold text-slate-600">{format(new Date(at.data_inicio), "HH:mm")}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="text-right text-[11px] font-bold text-indigo-600 mt-4 group-hover:underline flex items-center justify-end gap-1">
              Abrir Painel CRM Completo <ArrowRight className="w-3 h-3" />
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
