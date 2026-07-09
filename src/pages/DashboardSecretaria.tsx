import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar, Users, AlertTriangle, MessageCircle, Cake, ArrowRight, Link2, FileText, CheckCircle, CreditCard, Gift, Clock, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { abrirWhatsapp } from "@/lib/crm";
import { format, addDays, startOfDay, endOfDay, startOfMonth, endOfMonth, addMonths, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function DashboardSecretaria({ nomeUsuario }: { nomeUsuario: string }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // Dados existentes
  const [atendimentosHoje, setAtendimentosHoje] = useState<any[]>([]);
  const [totalConfirmacoesAmanha, setTotalConfirmacoesAmanha] = useState(0);
  const [aniversariantesHoje, setAniversariantesHoje] = useState<any[]>([]);
  const [dataCrmAlvo, setDataCrmAlvo] = useState<Date>(new Date());
  const [totalOrfaosMes, setTotalOrfaosMes] = useState(0);
  const [fichasIncompletas, setFichasIncompletas] = useState<any[]>([]);
  const [renovacoesParticulares, setRenovacoesParticulares] = useState<any[]>([]);

  // 🔥 NOVOS ESTADOS
  const [pacotesTerminando, setPacotesTerminando] = useState<any[]>([]); // Pacotes com <= 2 sessões restantes
  const [guiasTerminando, setGuiasTerminando] = useState<any[]>([]); // Guias com validade próxima (60 dias) ou sessões esgotando
  const [pacientesAlta, setPacientesAlta] = useState<any[]>([]); // Pacientes com alta médica recente

  useEffect(() => {
    async function carregarDashboard() {
      setLoading(true);
      try {
        const hoje = new Date();
        const startHoje = startOfDay(hoje).toISOString();
        const endHoje = endOfDay(hoje).toISOString();
        const startMes = startOfMonth(hoje).toISOString();
        const endMes = endOfMonth(hoje).toISOString();

        // Lógica de próximo dia útil para CRM
        const diaSemana = hoje.getDay();
        let dataProxima = addDays(hoje, 1);
        if (diaSemana === 5) dataProxima = addDays(hoje, 3);
        if (diaSemana === 6) dataProxima = addDays(hoje, 2);
        if (diaSemana === 0) dataProxima = addDays(hoje, 1);
        setDataCrmAlvo(dataProxima);
        const startProximo = startOfDay(dataProxima).toISOString();
        const endProximo = endOfDay(dataProxima).toISOString();

        // Buscas existentes
        const [resHoje, resProximo, resPacientes, resOrfaosMes, resRenovacoes, resPacotes, resGuias, resProntuariosAlta] = await Promise.all([
          supabase.from("atendimentos").select("id, profissional:profissionais(id, nome)").gte("data_inicio", startHoje).lte("data_inicio", endHoje).not("status", "eq", "cancelado"),
          supabase.from("atendimentos").select("id", { count: "exact", head: true }).gte("data_inicio", startProximo).lte("data_inicio", endProximo).eq("status", "agendado"),
          supabase.from("pacientes").select("id, nome, telefone, data_nascimento").eq("ativo", true),
          supabase.from("atendimentos").select("id", { count: "exact", head: true }).is("paciente_id", null).gte("data_inicio", startMes).lte("data_inicio", endMes),
          supabase.from("paciente_pacotes").select("id, paciente_id, sessoes_restantes, sessoes_totais, paciente:pacientes(nome)").eq("status_renovacao", "vai_renovar").is("autorizacao_id", null),

          // 🔥 1. Pacotes com <= 2 sessões restantes (e > 0)
          supabase.from("paciente_pacotes")
            .select("id, paciente_id, sessoes_restantes, sessoes_totais, paciente:pacientes(nome)")
            .gt("sessoes_restantes", 0)
            .lte("sessoes_restantes", 2)
            .order("sessoes_restantes", { ascending: true }),

          // 🔥 2. Guias com validade vencendo em até 60 dias OU com sessões restantes <= 2
          supabase.from("paciente_pacotes")
            .select(`
              id, 
              paciente_id, 
              sessoes_restantes, 
              sessoes_totais,
              autorizacao:autorizacoes(data_validade, plano, numero_guia),
              paciente:pacientes(nome)
            `)
            .not("autorizacao_id", "is", null)
            .or(`sessoes_restantes.lte.2, autorizacao.data_validade.lte.${addMonths(hoje, 2).toISOString().split('T')[0]}`)
            .order("sessoes_restantes", { ascending: true }),

          // 🔥 3. Prontuários com alta médica nos últimos 30 dias
          supabase.from("prontuarios")
            .select(`
              id,
              paciente_id,
              alta_medica,
              created_at,
              paciente:pacientes(nome, telefone)
            `)
            .eq("alta_medica", true)
            .gte("created_at", startOfDay(addMonths(hoje, -1)).toISOString())
            .order("created_at", { ascending: false })
            .limit(20)
        ]);

        setAtendimentosHoje(resHoje.data || []);
        setTotalConfirmacoesAmanha(resProximo.count || 0);
        setTotalOrfaosMes(resOrfaosMes.count || 0);
        setRenovacoesParticulares(resRenovacoes.data || []);
        setPacotesTerminando(resPacotes.data || []);
        setGuiasTerminando(resGuias.data || []);
        setPacientesAlta(resProntuariosAlta.data || []);

        // Processamento de aniversariantes e fichas incompletas (já existente)
        const mmDdHoje = format(hoje, "MM-dd");
        const nivers: any[] = [];
        const incompletas: any[] = [];
        (resPacientes.data || []).forEach((p) => {
          if (p.data_nascimento && p.data_nascimento.slice(5) === mmDdHoje) {
            nivers.push(p);
          }
          if (!p.telefone || !p.data_nascimento) {
            incompletas.push({
              id: p.id,
              nome: p.nome,
              motivo: !p.telefone && !p.data_nascimento ? "Falta Telefone e Nascimento" : !p.telefone ? "Falta Telefone" : "Falta Data de Nascimento"
            });
          }
        });
        setAniversariantesHoje(nivers);
        setFichasIncompletas(incompletas.slice(0, 5));

      } catch (err) {
        console.error("Erro ao carregar dashboard da secretária:", err);
      } finally {
        setLoading(false);
      }
    }
    carregarDashboard();
  }, []);

  // Resumo de profissionais (existente)
  const resumoProfissionais = useMemo(() => {
    const contagem: Record<string, { id: string, total: number }> = {};
    atendimentosHoje.forEach((at) => {
      const profNome = at.profissional?.nome?.split(" ")[0] || "Clínica";
      const profId = at.profissional?.id || "sem-id";
      if (!contagem[profNome]) contagem[profNome] = { id: profId, total: 0 };
      contagem[profNome].total += 1;
    });
    return contagem;
  }, [atendimentosHoje]);

  const parabenizar = (p: any) => {
    const msg = `Olá ${p.nome.split(" ")[0]}! 🎉 Nós da clínica CRPPélvico passamos para lhe desejar um feliz aniversário!`;
    abrirWhatsapp(p.telefone, msg, true);
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">A carregar painel da recepção...</div>;

  return (
    <div className="space-y-5 p-2 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Olá, {nomeUsuario || "Íris"} 👋</h1>
        <p className="text-xs text-muted-foreground">Resumo operacional do dia.</p>
      </div>

      {/* ATALHOS RÁPIDOS */}
      <div className="grid grid-cols-2 gap-4">
        <Link to="/agenda">
          <Card className="p-4 flex items-center gap-3 hover:bg-blue-50/50 hover:border-blue-300 transition-all cursor-pointer border shadow-sm">
            <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl shrink-0"><Calendar className="w-5 h-5" /></div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-800">Ver Agenda</div>
              <div className="text-xs text-muted-foreground truncate">Horários de hoje</div>
            </div>
          </Card>
        </Link>
        <Link to="/pacientes">
          <Card className="p-4 flex items-center gap-3 hover:bg-emerald-50/50 hover:border-emerald-300 transition-all cursor-pointer border shadow-sm">
            <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl shrink-0"><Users className="w-5 h-5" /></div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-800">Pacientes</div>
              <div className="text-xs text-muted-foreground truncate">Consultar fichas</div>
            </div>
          </Card>
        </Link>
      </div>

      {/* RESUMO DE AGENDA (existente) */}
      <Card className="p-4 shadow-sm border-t-4 border-t-blue-600">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" /> Pacientes Hoje por Profissional
        </h2>
        {Object.keys(resumoProfissionais).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg bg-slate-50/50">Agenda livre hoje.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(resumoProfissionais).map(([nome, dados]) => (
              <Card key={nome} className="p-4 flex flex-col items-center justify-center bg-slate-50 border shadow-sm">
                <span className="text-3xl font-black text-slate-700">{dados.total}</span>
                <span className="text-xs font-bold text-slate-500 uppercase mt-1 text-center">{nome}</span>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* NOVOS CARDS DE AÇÕES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Card 1: Pacotes Terminando */}
        {pacotesTerminando.length > 0 && (
          <Card className="p-4 shadow-sm border-l-4 border-l-amber-500">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-sm text-amber-700">Pacotes terminando</h3>
              <Badge className="bg-amber-100 text-amber-700 ml-auto">{pacotesTerminando.length}</Badge>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pacotesTerminando.slice(0, 5).map(p => (
                <div key={p.id} className="flex justify-between items-center text-xs border-b pb-1">
                  <span className="font-medium truncate">{p.paciente?.nome}</span>
                  <span className="text-amber-600 font-semibold">{p.sessoes_restantes} restantes</span>
                </div>
              ))}
              {pacotesTerminando.length > 5 && (
                <p className="text-[10px] text-muted-foreground text-center">+ {pacotesTerminando.length - 5} outros</p>
              )}
            </div>
            <Button variant="link" size="sm" className="mt-2 p-0 h-auto text-blue-600" onClick={() => navigate("/pacientes")}>
              Ver todos →
            </Button>
          </Card>
        )}

        {/* Card 2: Guias Terminando */}
        {guiasTerminando.length > 0 && (
          <Card className="p-4 shadow-sm border-l-4 border-l-red-500">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-5 h-5 text-red-500" />
              <h3 className="font-bold text-sm text-red-700">Guias vencendo</h3>
              <Badge className="bg-red-100 text-red-700 ml-auto">{guiasTerminando.length}</Badge>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {guiasTerminando.slice(0, 5).map(g => {
                const diasRestantes = g.autorizacao?.data_validade
                  ? differenceInDays(parseISO(g.autorizacao.data_validade), new Date())
                  : null;
                return (
                  <div key={g.id} className="flex justify-between items-center text-xs border-b pb-1">
                    <span className="font-medium truncate">{g.paciente?.nome}</span>
                    <span className="text-red-600 font-semibold">
                      {g.sessoes_restantes <= 2 ? `${g.sessoes_restantes} sessões` : ''}
                      {diasRestantes !== null && diasRestantes <= 60 ? ` (${diasRestantes}d)` : ''}
                    </span>
                  </div>
                );
              })}
              {guiasTerminando.length > 5 && (
                <p className="text-[10px] text-muted-foreground text-center">+ {guiasTerminando.length - 5} outros</p>
              )}
            </div>
            <Button variant="link" size="sm" className="mt-2 p-0 h-auto text-blue-600" onClick={() => navigate("/pacientes")}>
              Ver todos →
            </Button>
          </Card>
        )}

        {/* Card 3: Alta Médica - Enviar avaliação */}
        {pacientesAlta.length > 0 && (
          <Card className="p-4 shadow-sm border-l-4 border-l-emerald-500">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="w-5 h-5 text-emerald-500" />
              <h3 className="font-bold text-sm text-emerald-700">Avaliação pós-tratamento</h3>
              <Badge className="bg-emerald-100 text-emerald-700 ml-auto">{pacientesAlta.length}</Badge>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pacientesAlta.slice(0, 5).map(p => (
                <div key={p.id} className="flex justify-between items-center text-xs border-b pb-1">
                  <span className="font-medium truncate">{p.paciente?.nome}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => {
                      // 🔥 Link de avaliação do Google Meu Negócio - substitua pelo seu
                      const linkAvaliacao = "https://g.page/r/SEU_ID_DO_GOOGLE/review";
                      const msg = `Olá ${p.paciente?.nome?.split(" ")[0]}! Sua avaliação é muito importante para nós. Por favor, deixe sua opinião sobre o tratamento: ${linkAvaliacao}`;
                      abrirWhatsapp(p.paciente?.telefone, msg, true);
                    }}
                  >
                    Enviar link
                  </Button>
                </div>
              ))}
              {pacientesAlta.length > 5 && (
                <p className="text-[10px] text-muted-foreground text-center">+ {pacientesAlta.length - 5} outros</p>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* BLOCO DE AÇÕES PENDENTES (existente, mas mantido) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 border-b pb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Ações Pendentes
          </h2>
          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
            {/* Renovação Particular */}
            {renovacoesParticulares.map((r) => (
              <div key={r.id} className="p-3 border border-emerald-200 bg-emerald-50/40 rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="flex-1">
                  <span className="font-bold text-emerald-700 uppercase block text-[9px] tracking-wide mb-0.5">Cobrar Renovação (Particular)</span>
                  <p className="font-bold text-slate-800 text-sm truncate">{r.paciente?.nome}</p>
                  <p className="text-muted-foreground mt-0.5">{r.sessoes_restantes} restantes de {r.sessoes_totais}</p>
                </div>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shrink-0" onClick={() => navigate(`/pacientes/${r.paciente_id}/financeiro`)}>
                  <CreditCard className="w-3.5 h-3.5 mr-1" /> Cobrar
                </Button>
              </div>
            ))}

            {/* Órfãos */}
            {totalOrfaosMes > 0 && (
              <div className="p-3 border border-blue-200 bg-blue-50/20 rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="flex-1">
                  <span className="font-bold text-blue-700 uppercase block text-[9px] tracking-wide mb-0.5">Auditoria de Vínculo</span>
                  <p className="font-bold text-slate-800 text-sm">Existem {totalOrfaosMes} agendamentos órfãos neste mês</p>
                </div>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shrink-0" onClick={() => navigate("/financeiro/vincular")}>
                  <Link2 className="w-3.5 h-3.5 mr-1" /> Resolver
                </Button>
              </div>
            )}

            {/* Fichas incompletas */}
            {fichasIncompletas.map((f) => (
              <div key={f.id} className="p-3 border border-slate-200 bg-slate-50/50 rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-slate-500 uppercase block text-[9px] tracking-wide mb-0.5">Dados em Falta</span>
                  <p className="font-bold text-slate-800 truncate text-sm">{f.nome}</p>
                  <p className="text-red-500 font-semibold text-[11px] mt-0.5">{f.motivo}</p>
                </div>
                <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => navigate(`/pacientes/${f.id}/editar`)}>
                  <FileText className="w-4 h-4" />
                </Button>
              </div>
            ))}

            {/* Estado vazio */}
            {totalOrfaosMes === 0 && fichasIncompletas.length === 0 && renovacoesParticulares.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-xl bg-slate-50/30">
                <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-2" /> Tudo em dia!
              </div>
            )}
          </div>
        </Card>

        {/* CRM (existente) */}
        <div className="space-y-4">
          <Card className="p-4 shadow-sm border-l-4 border-l-indigo-500 bg-white hover:shadow-md transition-all cursor-pointer group" onClick={() => navigate("/crm")}>
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4 text-indigo-500" /> CRM de Confirmação
              </h2>
              <Badge className="bg-indigo-50 text-indigo-700">{format(dataCrmAlvo, "dd/MM", { locale: ptBR })}</Badge>
            </div>
            <div className="text-center py-4">
              <span className="text-4xl font-black text-indigo-600">{totalConfirmacoesAmanha}</span>
              <p className="text-xs text-muted-foreground mt-2 font-medium">Pacientes para confirmar ({format(dataCrmAlvo, "eeee", { locale: ptBR })})</p>
            </div>
            <div className="text-center text-[11px] font-bold text-indigo-600 mt-2 group-hover:underline">
              Ir para o CRM <ArrowRight className="w-3 h-3 inline" />
            </div>
          </Card>

          {/* Aniversariantes (existente) */}
          {aniversariantesHoje.length > 0 && (
            <Card className="p-3.5 bg-gradient-to-br from-pink-50 to-rose-50 border-rose-200 border text-xs shadow-sm">
              <div className="flex items-center gap-1.5 font-bold text-rose-700 uppercase tracking-wider text-[10px] mb-2">
                <Cake className="w-4 h-4 text-rose-500" /> Aniversariantes! 🎂
              </div>
              <div className="space-y-1.5">
                {aniversariantesHoje.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-rose-100">
                    <span className="font-bold text-slate-700 truncate">{p.nome}</span>
                    <Button size="sm" variant="outline" className="h-7 text-[11px] text-rose-700" onClick={() => parabenizar(p)}>
                      Mensagem
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
