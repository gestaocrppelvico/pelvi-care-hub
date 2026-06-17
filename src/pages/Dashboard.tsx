import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar, Users, Clock, AlertTriangle, MessageCircle, Cake, ArrowRight, Link2, FileText, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { abrirWhatsapp } from "@/lib/crm";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

// Importação dos painéis secundários
import DashboardFisio from "./DashboardFisio";
import DashboardSecretaria from "./DashboardSecretaria";

export default function Dashboard() {
  const { user, isFisio, isSecretaria, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(true);

  // Estados dos blocos de dados (Painel de Gestão)
  const [atendimentosHoje, setAtendimentosHoje] = useState<any[]>([]);
  const [atendimentosAmanha, setAtendimentosAmanha] = useState<any[]>([]);
  const [aniversariantesHoje, setAniversariantesHoje] = useState<any[]>([]);
  const [dataCrmAlvo, setDataCrmAlvo] = useState<Date>(new Date());

  // Estados dos Gatilhos Inteligentes (Smart Tasks)
  const [faltasPendentes, setFaltasPendentes] = useState<any[]>([]);
  const [guiasExpirando, setGuiasExpirando] = useState<any[]>([]);
  const [totalOrfaos, setTotalOrfaos] = useState(0);
  const [fichasIncompletas, setFichasIncompletas] = useState<any[]>([]);

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

        const hoje = new Date();
        const startHoje = startOfDay(hoje).toISOString();
        const endHoje = endOfDay(hoje).toISOString();

        const diaSemana = hoje.getDay();
        let dataProxima = addDays(hoje, 1);
        if (diaSemana === 5) dataProxima = addDays(hoje, 3);
        if (diaSemana === 6) dataProxima = addDays(hoje, 2);
        if (diaSemana === 0) dataProxima = addDays(hoje, 1);
        setDataCrmAlvo(dataProxima);

        const startProximo = startOfDay(dataProxima).toISOString();
        const endProximo = endOfDay(dataProxima).toISOString();

        const [
          resHoje,
          resProximo,
          resPacientes,
          resGuias,
          resOrfaos,
          resFaltas
        ] = await Promise.all([
          supabase.from("atendimentos").select("id, data_inicio, status, nome_paciente_livre, paciente:pacientes(nome), profissional:profissionais(nome)").gte("data_inicio", startHoje).lte("data_inicio", endHoje).not("status", "eq", "cancelado"),
          supabase.from("atendimentos").select("id, data_inicio, nome_paciente_livre, paciente:pacientes(nome), profissional:profissionais(nome)").gte("data_inicio", startProximo).lte("data_inicio", endProximo).eq("status", "agendado"),
          supabase.from("pacientes").select("id, nome, telefone, data_nascimento").eq("ativo", true),
          supabase.from("paciente_pacotes").select("id, sessoes_restantes, sessoes_totais, paciente_id, paciente:pacientes(nome), pacote:pacotes(nome), servico:servicos(nome), autorizacao:autorizacoes(plano)").gt("sessoes_restantes", 0).lte("sessoes_restantes", 2),
          supabase.from("atendimentos").select("id", { count: "exact", head: true }).is("paciente_id", null),
          supabase.from("atendimentos").select("id, data_inicio, paciente:pacientes(nome), profissional:profissionais(nome)").eq("status", "faltou")
        ]);

        setAtendimentosHoje(resHoje.data || []);
        setAtendimentosAmanha(resProximo.data || []);
        setTotalOrfaos(resOrfaos.count || 0);
        setGuiasExpirando(resGuias.data || []);
        setFaltasPendentes(resFaltas.data || []);

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
        console.error("Erro ao carregar os blocos do dashboard admin:", err);
      } finally {
        setLoading(false);
      }
    };

    carregarDashboard();
  }, [user, isSecretaria, isAdmin, isFisio]);

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

  // DESVIOS DE ROTA
  if (isSecretaria && !isAdmin) return <DashboardSecretaria nomeUsuario={nome} />;
  if (isFisio && !isAdmin && !isSecretaria) return <DashboardFisio />;

  // PAINEL GERENCIAL (FELIPE / JULIANA)
  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">A carregar o Centro de Comando...</div>;

  return (
    <div className="space-y-5 p-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Olá, {nome || "Administrador"} 👋</h1>
        <p className="text-xs text-muted-foreground">Bem-vindo ao seu painel de monitorização diária e auditoria.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link to="/agenda">
          <Card className="p-4 flex items-center gap-3 hover:bg-blue-50/50 hover:border-blue-300 transition-all cursor-pointer border shadow-sm">
            <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl shrink-0"><Calendar className="w-5 h-5" /></div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-800">Ver Agenda</div>
              <div className="text-xs text-muted-foreground truncate">Horários do dia</div>
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

      <Card className="p-4 shadow-sm border-t-4 border-t-blue-600">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" /> Atendimentos Programados para Hoje
        </h2>
        {atendimentosHoje.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg bg-slate-50/50">Nenhum atendimento registado para o dia de hoje.</p>
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
                    <div key={at.id} className="flex items-center justify-between text-xs p-2 bg-white rounded border shadow-sm">
                      <div className="truncate font-semibold text-slate-700 max-w-[70%]">{at.paciente?.nome || at.nome_paciente_livre || "Sem nome"}</div>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* BLOCO: AÇÕES E AUDITORIAS */}
        <Card className="p-4 shadow-sm lg:col-span-7 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 border-b pb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Ações e Auditorias (Admin)
          </h2>
          <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
            
            {/* AUDITORIA DE FALTAS */}
            {faltasPendentes.map((f) => (
              <div key={f.id} className="p-3 border border-rose-200 bg-rose-50/50 rounded-xl flex items-center justify-between gap-3 text-xs hover:bg-rose-100/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-rose-700 uppercase block text-[9px] tracking-wide mb-0.5">Auditoria de Falta</span>
                  <p className="font-bold text-slate-800 truncate text-sm">{f.paciente?.nome}</p>
                  <p className="text-muted-foreground truncate">{format(new Date(f.data_inicio), "dd/MM 'às' HH:mm")} · Prof: {f.profissional?.nome?.split(" ")[0]}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" className="h-8 text-[11px] border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => processarFalta(f.id, "abonada")}><CheckCircle className="w-3 h-3 mr-1"/> Abonar</Button>
                  <Button size="sm" variant="outline" className="h-8 text-[11px] border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => processarFalta(f.id, "cobrada")}><XCircle className="w-3 h-3 mr-1"/> Cobrar</Button>
                </div>
              </div>
            ))}

            {/* GUIAS EXPIRANDO */}
            {guiasExpirando.map((g) => (
              <div key={g.id} className="p-3 border border-amber-200 bg-amber-50/30 rounded-xl flex items-center justify-between gap-3 text-xs hover:bg-amber-50/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-amber-700 uppercase block text-[9px] tracking-wide mb-0.5">Cobrar novo pacote / Renovação</span>
                  <p className="font-bold text-slate-800 truncate text-sm">{g.paciente?.nome}</p>
                  <p className="text-muted-foreground truncate">{g.autorizacao ? `Guia do Plano: ${g.autorizacao.plano}` : `Contrato: ${g.pacote?.nome || g.servico?.nome || "Particular"}`}</p>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <Badge className="bg-amber-600 text-white font-bold text-[10px] px-2 h-5">{g.sessoes_restantes} {g.sessoes_restantes === 1 ? "restante" : "restantes"}</Badge>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-700 hover:bg-amber-100" onClick={() => navigate(`/pacientes/${g.paciente_id}`)}><ArrowRight className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}

            {/* VÍNCULOS ÓRFÃOS */}
            {totalOrfaos > 0 && (
              <div className="p-3 border border-blue-200 bg-blue-50/20 rounded-xl flex items-center justify-between gap-3 text-xs hover:bg-blue-50/40 transition-colors">
                <div className="flex-1">
                  <span className="font-bold text-blue-700 uppercase block text-[9px] tracking-wide mb-0.5">Auditoria de Vínculo</span>
                  <p className="font-bold text-slate-800 text-sm">Existem {totalOrfaos} agendamentos "órfãos"</p>
                </div>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shrink-0" onClick={() => navigate("/crm/vinculos")}><Link2 className="w-3.5 h-3.5 mr-1" /> Resolver</Button>
              </div>
            )}

            {/* FICHAS INCOMPLETAS */}
            {fichasIncompletas.map((f) => (
              <div key={f.id} className="p-3 border border-slate-200 bg-slate-50/50 rounded-xl flex items-center justify-between gap-3 text-xs hover:bg-slate-100/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-slate-500 uppercase block text-[9px] tracking-wide mb-0.5">Dados em Falta</span>
                  <p className="font-bold text-slate-800 truncate text-sm">{f.nome}</p>
                  <p className="text-red-500 font-semibold text-[11px] mt-0.5">{f.motivo}</p>
                </div>
                <Button size="icon" variant="outline" className="h-8 w-8 shrink-0 text-slate-600" onClick={() => navigate(`/pacientes/${f.id}/editar`)}><FileText className="w-4 h-4" /></Button>
              </div>
            ))}

            {faltasPendentes.length === 0 && guiasExpirando.length === 0 && totalOrfaos === 0 && fichasIncompletas.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground border-2 border-dashed rounded-xl bg-slate-50/30">🎉 Tudo em dia! Nenhuma pendência no radar.</div>
            )}
          </div>
        </Card>

        {/* BLOCO: CRM E ANIVERSÁRIOS */}
        <div className="lg:col-span-5 space-y-4">
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

          <Card className="p-4 shadow-sm border-l-4 border-l-indigo-500 bg-white hover:shadow-md transition-all cursor-pointer group" onClick={() => navigate("/crm")}>
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-500" /> CRM: Lembretes de Amanhã
              </h2>
              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 font-bold px-2 h-5 text-[10px]">{format(dataCrmAlvo, "dd/MM", { locale: ptBR })}</Badge>
            </div>
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
              {atendimentosAmanha.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum atendimento agendado para o próximo dia útil.</p>
              ) : (
                atendimentosAmanha.map((at) => (
                  <div key={at.id} className="p-2 border rounded-lg bg-slate-50/50 flex justify-between items-center text-xs">
                    <div className="truncate font-bold text-slate-700 max-w-[60%]">{at.paciente?.nome || at.nome_paciente_livre || "Particular"}</div>
                    <div className="text-[11px] text-muted-foreground shrink-0 text-right font-medium">
                      {at.profissional?.nome?.split(" ")[0]} · <span className="font-bold text-slate-600">{format(new Date(at.data_inicio), "HH:mm")}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
