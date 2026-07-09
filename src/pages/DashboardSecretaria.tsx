import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Calendar, Users, AlertTriangle, MessageCircle, Cake, ArrowRight, Link2, FileText, CheckCircle, CreditCard, User, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { abrirWhatsapp } from "@/lib/crm";
import { format, addDays, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export default function DashboardSecretaria({ nomeUsuario }: { nomeUsuario: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);

  // Estados
  const [atendimentosHoje, setAtendimentosHoje] = useState<any[]>([]);
  const [totalConfirmacoesAmanha, setTotalConfirmacoesAmanha] = useState(0);
  const [aniversariantesHoje, setAniversariantesHoje] = useState<any[]>([]);
  const [dataCrmAlvo, setDataCrmAlvo] = useState<Date>(new Date());
  const [totalOrfaosMes, setTotalOrfaosMes] = useState(0);
  const [fichasIncompletas, setFichasIncompletas] = useState<any[]>([]);
  const [renovacoesParticulares, setRenovacoesParticulares] = useState<any[]>([]);
  
  // 🔥 NOVOS ESTADOS
  const [pacotesTerminando, setPacotesTerminando] = useState<any[]>([]);
  const [guiasVencendo, setGuiasVencendo] = useState<any[]>([]);
  const [pacientesAltaRecente, setPacientesAltaRecente] = useState<any[]>([]);

  const carregarDashboard = async () => {
    setLoading(true);
    try {
      const hoje = new Date();
      const startHoje = startOfDay(hoje).toISOString();
      const endHoje = endOfDay(hoje).toISOString();
      const startMes = startOfMonth(hoje).toISOString();
      const endMes = endOfMonth(hoje).toISOString();

      const diaSemana = hoje.getDay();
      let dataProxima = addDays(hoje, 1);
      if (diaSemana === 5) dataProxima = addDays(hoje, 3);
      if (diaSemana === 6) dataProxima = addDays(hoje, 2);
      if (diaSemana === 0) dataProxima = addDays(hoje, 1);
      setDataCrmAlvo(dataProxima);

      const startProximo = startOfDay(dataProxima).toISOString();
      const endProximo = endOfDay(dataProxima).toISOString();

      // 🔥 1. Pacotes terminando (≤ 2 sessões restantes)
      const { data: pacotesTerminandoData } = await supabase
        .from("paciente_pacotes")
        .select(`
          id,
          sessoes_restantes,
          sessoes_totais,
          paciente_id,
          paciente:pacientes(nome, telefone)
        `)
        .gt("sessoes_restantes", 0)
        .lte("sessoes_restantes", 2)
        .order("sessoes_restantes", { ascending: true })
        .limit(10);

      // 🔥 2. Guias prestes a vencer (validade < 60 dias e com saldo > 0)
      const dataLimite = addDays(hoje, 60).toISOString();
      const { data: guiasVencendoData } = await supabase
        .from("paciente_pacotes")
        .select(`
          id,
          sessoes_restantes,
          sessoes_totais,
          autorizacao:autorizacoes(plano, data_validade, numero_guia),
          paciente_id,
          paciente:pacientes(nome, telefone)
        `)
        .not("autorizacao_id", "is", null)
        .gt("sessoes_restantes", 0)
        .lte("autorizacao.data_validade", dataLimite)
        .order("autorizacao.data_validade", { ascending: true })
        .limit(10);

      // 🔥 3. Pacientes com alta médica nos últimos 7 dias (para enviar link de avaliação)
      const dataAltaLimite = subDays(hoje, 7).toISOString();
      const { data: altaRecenteData } = await supabase
        .from("prontuarios")
        .select(`
          id,
          paciente_id,
          paciente:pacientes(nome, telefone),
          atendimento:atendimentos(profissional:profissionais(nome))
        `)
        .eq("alta_medica", true)
        .gte("created_at", dataAltaLimite)
        .order("created_at", { ascending: false })
        .limit(10);

      // 4. Demais consultas (existentes)
      const [resHoje, resProximo, resPacientes, resOrfaosMes, resRenovacoes] = await Promise.all([
        supabase.from("atendimentos").select("id, profissional:profissionais(id, nome)").gte("data_inicio", startHoje).lte("data_inicio", endHoje).not("status", "eq", "cancelado"),
        supabase.from("atendimentos").select("id", { count: "exact", head: true }).gte("data_inicio", startProximo).lte("data_inicio", endProximo).eq("status", "agendado"),
        supabase.from("pacientes").select("id, nome, telefone, data_nascimento").eq("ativo", true),
        supabase.from("atendimentos").select("id", { count: "exact", head: true }).is("paciente_id", null).gte("data_inicio", startMes).lte("data_inicio", endMes),
        supabase.from("paciente_pacotes").select("id, paciente_id, sessoes_restantes, sessoes_totais, paciente:pacientes(nome)").eq("status_renovacao", "vai_renovar").is("autorizacao_id", null)
      ]);

      setAtendimentosHoje(resHoje.data || []);
      setTotalConfirmacoesAmanha(resProximo.count || 0);
      setTotalOrfaosMes(resOrfaosMes.count || 0);
      setRenovacoesParticulares(resRenovacoes.data || []);
      
      setPacotesTerminando(pacotesTerminandoData || []);
      setGuiasVencendo(guiasVencendoData || []);
      setPacientesAltaRecente(altaRecenteData || []);

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
      toast.error("Erro ao carregar dados do dashboard");
    } finally {
      setLoading(false);
    }
  };

  // Carrega ao montar e recarrega quando a rota mudar
  useEffect(() => {
    carregarDashboard();
  }, []);

  // Recarrega quando a rota mudar para o dashboard (ex: voltar de outra página)
  useEffect(() => {
    if (location.pathname === '/') {
      carregarDashboard();
    }
  }, [location.pathname]);

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
            <div>
              <div className="font-bold text-sm text-slate-800">Ver Agenda</div>
              <div className="text-xs text-muted-foreground">Horários de hoje</div>
            </div>
          </Card>
        </Link>
        <Link to="/pacientes">
          <Card className="p-4 flex items-center gap-3 hover:bg-emerald-50/50 hover:border-emerald-300 transition-all cursor-pointer border shadow-sm">
            <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl shrink-0"><Users className="w-5 h-5" /></div>
            <div>
              <div className="font-bold text-sm text-slate-800">Pacientes</div>
              <div className="text-xs text-muted-foreground">Consultar fichas</div>
            </div>
          </Card>
        </Link>
      </div>

      {/* RESUMO DE ATENDIMENTOS HOJE */}
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

      {/* LINHA 2: PACOTES TERMINANDO E GUIAS VENCENDO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* PACOTES TERMINANDO */}
        <Card className="p-4 shadow-sm border-l-4 border-l-amber-500">
          <h2 className="text-sm font-bold uppercase tracking-wider text-amber-700 flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4" /> Pacotes terminando
          </h2>
          {pacotesTerminando.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum pacote com saldo baixo.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {pacotesTerminando.map((p) => (
                <Link
                  key={p.id}
                  to={`/pacientes/${p.paciente_id}`}
                  className="block p-2 rounded-lg border hover:bg-amber-50/50 hover:border-amber-300 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-800 truncate hover:text-amber-700">
                      {p.paciente?.nome || "Paciente"}
                    </span>
                    <Badge variant="outline" className="text-amber-700 border-amber-200">
                      {p.sessoes_restantes} restantes
                    </Badge>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                    <div 
                      className="bg-amber-500 h-1.5 rounded-full" 
                      style={{ width: `${(p.sessoes_restantes / p.sessoes_totais) * 100}%` }} 
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* GUIAS VENCENDO */}
        <Card className="p-4 shadow-sm border-l-4 border-l-purple-500">
          <h2 className="text-sm font-bold uppercase tracking-wider text-purple-700 flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4" /> Guias prestes a vencer
          </h2>
          {guiasVencendo.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma guia próxima do vencimento.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {guiasVencendo.map((g) => (
                <Link
                  key={g.id}
                  to={`/pacientes/${g.paciente_id}`}
                  className="block p-2 rounded-lg border hover:bg-purple-50/50 hover:border-purple-300 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-800 truncate hover:text-purple-700">
                      {g.paciente?.nome || "Paciente"}
                    </span>
                    <Badge variant="outline" className="text-purple-700 border-purple-200">
                      {g.autorizacao?.plano || "Plano"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {g.sessoes_restantes} sessões restantes · 
                    Vence em {format(new Date(g.autorizacao?.data_validade), "dd/MM/yyyy")}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* LINHA 3: AÇÕES PENDENTES */}
      <Card className="p-4 shadow-sm border-t-4 border-t-amber-500">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 border-b pb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" /> Ações Pendentes
        </h2>
        <div className="space-y-2 mt-3 max-h-[350px] overflow-y-auto pr-1">
          
          {/* RENOVAÇÕES PARTICULARES */}
          {renovacoesParticulares.map((r) => (
            <Link
              key={r.id}
              to={`/pacientes/${r.paciente_id}/financeiro`}
              className="block p-3 border border-emerald-200 bg-emerald-50/40 rounded-xl hover:bg-emerald-50 transition-all"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="font-bold text-emerald-700 uppercase block text-[9px] tracking-wide mb-0.5">Cobrar Renovação (Particular)</span>
                  <p className="font-bold text-slate-800 text-sm truncate">{r.paciente?.nome}</p>
                  <p className="text-muted-foreground text-xs">{r.sessoes_restantes} restantes de {r.sessoes_totais}</p>
                </div>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shrink-0">
                  <CreditCard className="w-3.5 h-3.5 mr-1" /> Cobrar
                </Button>
              </div>
            </Link>
          ))}

          {/* ÓRFÃOS */}
          {totalOrfaosMes > 0 && (
            <div className="p-3 border border-blue-200 bg-blue-50/20 rounded-xl flex items-center justify-between gap-3">
              <div className="flex-1">
                <span className="font-bold text-blue-700 uppercase block text-[9px] tracking-wide mb-0.5">Auditoria de Vínculo</span>
                <p className="font-bold text-slate-800 text-sm">{totalOrfaosMes} agendamentos órfãos neste mês</p>
              </div>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shrink-0" onClick={() => navigate("/financeiro/vincular")}>
                <Link2 className="w-3.5 h-3.5 mr-1" /> Resolver
              </Button>
            </div>
          )}

          {/* FICHAS INCOMPLETAS */}
          {fichasIncompletas.map((f) => (
            <Link
              key={f.id}
              to={`/pacientes/${f.id}/editar`}
              className="block p-3 border border-slate-200 bg-slate-50/50 rounded-xl hover:bg-slate-100 transition-all"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-slate-500 uppercase block text-[9px] tracking-wide mb-0.5">Dados em Falta</span>
                  <p className="font-bold text-slate-800 truncate">{f.nome}</p>
                  <p className="text-red-500 font-semibold text-xs">{f.motivo}</p>
                </div>
                <Button size="icon" variant="outline" className="h-8 w-8 shrink-0">
                  <FileText className="w-4 h-4" />
                </Button>
              </div>
            </Link>
          ))}

          {/* ESTADO VAZIO */}
          {renovacoesParticulares.length === 0 && totalOrfaosMes === 0 && fichasIncompletas.length === 0 && (
            <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-xl bg-slate-50/30">
              <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-2" /> Tudo em dia!
            </div>
          )}
        </div>
      </Card>

      {/* LINHA 4: CRM E ANIVERSARIANTES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 shadow-sm border-l-4 border-l-indigo-500 bg-white hover:shadow-md transition-all cursor-pointer group" onClick={() => navigate("/crm")}>
          <div className="flex justify-between items-center border-b pb-2 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4 text-indigo-500" /> CRM de Confirmação
            </h2>
            <Badge className="bg-indigo-50 text-indigo-700">{format(dataCrmAlvo, "dd/MM", { locale: ptBR })}</Badge>
          </div>
          <div className="text-center py-4">
            <span className="text-4xl font-black text-indigo-600">{totalConfirmacoesAmanha}</span>
            <p className="text-xs text-muted-foreground mt-2 font-medium">
              Pacientes para confirmar ({format(dataCrmAlvo, "eeee", { locale: ptBR })})
            </p>
          </div>
          <div className="text-center text-[11px] font-bold text-indigo-600 mt-2 group-hover:underline">
            Ir para o CRM <ArrowRight className="w-3 h-3 inline" />
          </div>
        </Card>

        {/* ANIVERSARIANTES + ALTA RECENTE */}
        <div className="space-y-4">
          {aniversariantesHoje.length > 0 && (
            <Card className="p-3.5 bg-gradient-to-br from-pink-50 to-rose-50 border-rose-200 border">
              <div className="flex items-center gap-1.5 font-bold text-rose-700 uppercase tracking-wider text-[10px] mb-2">
                <Cake className="w-4 h-4 text-rose-500" /> Aniversariantes! 🎂
              </div>
              <div className="space-y-1.5">
                {aniversariantesHoje.map(p => (
                  <Link
                    key={p.id}
                    to={`/pacientes/${p.id}`}
                    className="flex items-center justify-between p-2 bg-white rounded-lg border border-rose-100 hover:bg-rose-50 transition-all"
                  >
                    <span className="font-bold text-slate-700 truncate hover:text-rose-700">{p.nome}</span>
                    <Button size="sm" variant="outline" className="h-7 text-[11px] text-rose-700" onClick={(e) => { e.preventDefault(); parabenizar(p); }}>
                      Mensagem
                    </Button>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* ALTA RECENTE - LINK DE AVALIAÇÃO */}
          {pacientesAltaRecente.length > 0 && (
            <Card className="p-3.5 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 border">
              <div className="flex items-center gap-1.5 font-bold text-blue-700 uppercase tracking-wider text-[10px] mb-2">
                <MessageCircle className="w-4 h-4 text-blue-500" /> Avaliação Google Meu Negócio
              </div>
              <div className="space-y-1.5">
                {pacientesAltaRecente.map(p => (
                  <Link
                    key={p.id}
                    to={`/pacientes/${p.paciente_id}`}
                    className="flex items-center justify-between p-2 bg-white rounded-lg border border-blue-100 hover:bg-blue-50 transition-all"
                  >
                    <div>
                      <span className="font-bold text-slate-700 truncate hover:text-blue-700">{p.paciente?.nome}</span>
                      <div className="text-[10px] text-muted-foreground">
                        Alta por {p.atendimento?.profissional?.nome || "profissional"}
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={(e) => {
                        e.preventDefault();
                        const msg = `Olá ${p.paciente?.nome?.split(" ")[0] || "paciente"}! 😊 Sua opinião é muito importante para nós. Por favor, avalie nossa clínica no Google Meu Negócio: https://g.page/r/...`;
                        abrirWhatsapp(p.paciente?.telefone, msg, true);
                      }}
                    >
                      Enviar link
                    </Button>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
