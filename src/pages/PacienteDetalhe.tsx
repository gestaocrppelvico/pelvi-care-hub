import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { 
  ArrowLeft, Phone, Calendar, Pencil, ShoppingBag, CheckCircle2, 
  XCircle, AlertCircle, Clock, UserCircle, FileText, Plus, 
  ClipboardEdit, Eye, CircleAlert, BadgeCheck 
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import PacienteFinanceiro from "./PacienteFinanceiro";
import PacienteAutorizacoes from "./PacienteAutorizacoes";

export default function PacienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isSecretaria } = useAuth();

  const [pac, setPac] = useState<any>(null);
  const [pront, setPront] = useState<any[]>([]);
  const [atendimentos, setAtendimentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [anamnese, setAnamnese] = useState<any>(null);
  const [evolucoes, setEvolucoes] = useState<any[]>([]);

  const [itemTipo, setItemTipo] = useState<"servico" | "pacote">("servico");
  const [listaServicos, setListaServicos] = useState<any[]>([]);
  const [listaPacotes, setListaPacotes] = useState<any[]>([]);
  const [idItemSelecionado, setIdItemSelecionado] = useState<string>("");
  const [qtdSessoes, setQtdSessoes] = useState<number>(1);
  const [precoFinal, setPrecoFinal] = useState<string>("");

  const carregarDados = async () => {
    if (!id) return;
    setLoading(true);
    try {
      // 1. Buscar paciente
      const { data: p } = await supabase.from("pacientes").select("*").eq("id", id).maybeSingle();
      setPac(p);

      // 2. Buscar todos os prontuários do paciente
      const { data: pr } = await supabase
        .from("prontuarios")
        .select("*, atendimento:atendimentos(data_inicio, profissional:profissionais(nome))")
        .eq("paciente_id", id)
        .order("created_at", { ascending: false });
      
      const prontuarios = pr || [];
      setPront(prontuarios);

      // Separar anamnese e evoluções
      const anam = prontuarios.find((r: any) => r.tipo === 'avaliacao') || null;
      setAnamnese(anam);
      const evos = prontuarios.filter((r: any) => r.tipo === 'evolucao') || [];
      setEvolucoes(evos);

      // 3. Buscar atendimentos do paciente (sem prontuários aninhados)
      const { data: atendimentosRaw, error } = await supabase
        .from("atendimentos")
        .select(`
          *,
          profissional:profissionais(nome)
        `)
        .eq("paciente_id", id)
        .order("data_inicio", { ascending: false });

      if (error) {
        console.error("Erro ao buscar atendimentos:", error);
        toast.error("Erro ao carregar sessões");
        setAtendimentos([]);
      } else {
        // 🔥 COMBINAR MANUALMENTE: associar cada atendimento com suas evoluções
        const atendimentosComEvolucao = (atendimentosRaw || []).map((atendimento: any) => {
          // Filtra as evoluções que têm o atendimento_id igual ao id do atendimento
          const evolucoesDoAtendimento = evos.filter((e: any) => e.atendimento_id === atendimento.id);
          return {
            ...atendimento,
            prontuarios: evolucoesDoAtendimento
          };
        });
        setAtendimentos(atendimentosComEvolucao);
      }

      // 4. Listas de serviços e pacotes
      const [{ data: s }, { data: pks }] = await Promise.all([
        supabase.from("servicos").select("id, nome, preco").eq("ativo", true),
        supabase.from("pacotes").select("id, nome, numero_sessoes, preco_total").eq("ativo", true)
      ]);
      setListaServicos(s || []);
      setListaPacotes(pks || []);
    } catch (e) { 
      console.error(e);
      toast.error("Erro ao carregar dados"); 
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { carregarDados(); }, [id]);

  const handleItemChange = (val: string) => {
    setIdItemSelecionado(val);
    if (itemTipo === "servico") {
      const it = listaServicos.find(s => s.id === val);
      if (it) { setQtdSessoes(1); setPrecoFinal(it.preco.toString()); }
    } else {
      const it = listaPacotes.find(p => p.id === val);
      if (it) { setQtdSessoes(it.numero_sessoes); setPrecoFinal(it.preco_total.toString()); }
    }
  };

  const lancar = async (e: any) => {
    e.preventDefault();
    try {
      if (itemTipo === "pacote") {
        await supabase.from("paciente_pacotes").insert({ 
          paciente_id: id, 
          pacote_id: idItemSelecionado, 
          sessoes_totais: qtdSessoes, 
          sessoes_restantes: qtdSessoes, 
          preco_pago: precoFinal 
        });
      } else {
        await supabase.from("paciente_servicos").insert({ paciente_id: id, servico_id: idItemSelecionado });
        await supabase.from("paciente_pacotes").insert({ 
          paciente_id: id, 
          servico_id: idItemSelecionado, 
          sessoes_totais: 1, 
          sessoes_restantes: 1, 
          preco_pago: precoFinal 
        });
      }
      toast.success("Lançado com sucesso!");
      setIdItemSelecionado("");
      carregarDados();
    } catch (err: any) { toast.error(err.message); }
  };

  const statsHistorico = useMemo(() => {
    const lista = Array.isArray(atendimentos) ? atendimentos : [];
    const realizados = lista.filter(a => a.status === "realizado");
    const faltas = lista.filter(a => a.status === "falta" || a.status === "ausente");
    const cancelados = lista.filter(a => a.status === "cancelado" || a.status === "remarcado");
    const profs = Array.from(new Set(realizados.map(a => a.profissional?.nome).filter(Boolean)));
    const primeiraSessao = realizados.length > 0 ? realizados[realizados.length - 1].data_inicio : null;
    return { total: realizados.length, faltas: faltas.length, cancelados: cancelados.length, profissionais: profs, primeiraSessao };
  }, [atendimentos]);

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Carregando dados do paciente...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/pacientes")}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-xl font-bold">{pac?.nome}</h1>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" /> {pac?.telefone || "Sem telefone"}
            </div>
          </div>
        </div>
        
        <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
          <Link to={`/pacientes/${id}/editar`}><FileText className="w-4 h-4 mr-1.5" /> Ver ficha</Link>
        </Button>
      </div>

      <Tabs defaultValue="historico">
        <TabsList className="w-full grid grid-cols-5 h-auto py-1">
          <TabsTrigger value="historico" className="text-xs sm:text-sm">Histórico</TabsTrigger>
          <TabsTrigger value="prontuario" className="text-xs sm:text-sm">Prontuário</TabsTrigger>
          <TabsTrigger value="servicos" className="text-xs sm:text-sm">Serviços</TabsTrigger>
          <TabsTrigger value="financeiro" className="text-xs sm:text-sm">Financeiro</TabsTrigger>
          <TabsTrigger value="autorizacoes" className="text-xs sm:text-sm">Guias</TabsTrigger>
        </TabsList>

        {/* ============ ABA HISTÓRICO ============ */}
        <TabsContent value="historico" className="space-y-4 mt-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <Card className="p-3 border-l-4 border-l-emerald-500 shadow-sm bg-emerald-50/30">
              <div className="flex items-center gap-1.5 mb-1 text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase">Realizadas</span>
              </div>
              <div className="text-2xl font-bold text-emerald-700">{statsHistorico.total}</div>
            </Card>
            
            <Card className="p-3 border-l-4 border-l-amber-500 shadow-sm bg-amber-50/30">
              <div className="flex items-center gap-1.5 mb-1 text-amber-700">
                <AlertCircle className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase">Faltas</span>
              </div>
              <div className="text-2xl font-bold text-amber-700">{statsHistorico.faltas}</div>
            </Card>

            <Card className="p-3 border-l-4 border-l-slate-400 shadow-sm bg-slate-50/50">
              <div className="flex items-center gap-1.5 mb-1 text-slate-600">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase">Remarcou</span>
              </div>
              <div className="text-2xl font-bold text-slate-700">{statsHistorico.cancelados}</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4 space-y-4 shadow-sm">
              <h3 className="font-semibold text-sm flex items-center gap-2 border-b pb-2">
                <UserCircle className="w-4 h-4 text-primary" /> Informações de Tratamento
              </h3>
              
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground">Paciente desde</div>
                  <div className="font-medium text-sm">
                    {statsHistorico.primeiraSessao 
                      ? format(parseISO(statsHistorico.primeiraSessao), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) 
                      : "Ainda não realizou a primeira sessão"}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Profissionais que já atenderam</div>
                  <div className="flex flex-wrap gap-1.5">
                    {statsHistorico.profissionais.length > 0 ? (
                      statsHistorico.profissionais.map((nome, i) => (
                        <Badge key={i} variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100">{nome}</Badge>
                      ))
                    ) : (
                      <span className="text-sm font-medium">Nenhum profissional registado</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Card de Sessões */}
            <Card className="p-4 shadow-sm h-[350px] flex flex-col">
              <h3 className="font-semibold text-sm flex items-center gap-2 border-b pb-2 mb-3">
                <Calendar className="w-4 h-4 text-primary" /> Sessões
              </h3>
              <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                {!Array.isArray(atendimentos) || atendimentos.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground mt-10">Nenhuma sessão encontrada.</div>
                ) : (
                  atendimentos.map((a: any) => {
                    // 🔥 Verifica se há evoluções associadas a este atendimento
                    const evolucoesDaSessao = Array.isArray(a.prontuarios) 
                      ? a.prontuarios.filter((p: any) => p.tipo === 'evolucao')
                      : [];
                    const temEvolucao = evolucoesDaSessao.length > 0;
                    const prontuarioId = temEvolucao ? evolucoesDaSessao[0].id : null;

                    return (
                      <div key={a.id} className="flex items-start gap-3 border-l-2 border-slate-100 pl-3 py-1">
                        <div className="w-2 h-2 rounded-full mt-1.5 -ml-[17px] border-2 border-white ring-2 ring-slate-100" 
                             style={{ backgroundColor: a.status === 'realizado' ? '#10b981' : a.status === 'falta' ? '#f59e0b' : '#94a3b8' }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium flex items-center justify-between">
                            {format(parseISO(a.data_inicio), "dd/MM/yyyy HH:mm")}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize font-semibold
                              ${a.status === 'realizado' ? 'bg-emerald-100 text-emerald-700' : 
                                a.status === 'falta' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                              {a.status}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{a.profissional?.nome || "Profissional não atribuído"}</div>
                          {a.status === 'realizado' && (
                            <div className="mt-1 flex items-center gap-2">
                              {temEvolucao ? (
                                <>
                                  <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 text-[10px]">
                                    <BadgeCheck className="w-3 h-3 mr-1" /> Evoluído
                                  </Badge>
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className="h-6 px-2 text-xs"
                                    onClick={() => navigate(`/paciente/${id}/prontuario/${prontuarioId}`)}
                                  >
                                    <Eye className="w-3 h-3 mr-1" /> Ver
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Badge variant="destructive" className="text-[10px]">
                                    <CircleAlert className="w-3 h-3 mr-1" /> Pendente
                                  </Badge>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-6 px-2 text-xs bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-700"
                                    onClick={() => navigate(`/paciente/${id}/evolucao/nova?atendimento=${a.id}`)}
                                  >
                                    <ClipboardEdit className="w-3 h-3 mr-1" /> Evoluir
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ============ ABA PRONTUÁRIO ============ */}
        <TabsContent value="prontuario" className="mt-4">
          {pront.length === 0 ? (
            <Card className="p-10 flex flex-col items-center justify-center text-center space-y-4 shadow-sm border-dashed">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-800">Nenhum prontuário encontrado</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">Este paciente ainda não possui evoluções registradas.</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button asChild className="bg-blue-600 hover:bg-blue-700">
                  <Link to={`/paciente/${id}/anamnese/nova`}><Plus className="w-4 h-4 mr-2" /> Nova Anamnese</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to={`/paciente/${id}/evolucao/nova`}><ClipboardEdit className="w-4 h-4 mr-2" /> Primeira Evolução</Link>
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <h3 className="font-semibold text-sm text-slate-700">
                  {anamnese ? 'Anamnese registrada' : 'Nenhuma anamnese'} · {evolucoes.length} evolução(ões)
                </h3>
                <div className="flex flex-wrap gap-2">
                  {!anamnese && (
                    <Button asChild size="sm" variant="outline" className="border-blue-300 text-blue-700">
                      <Link to={`/paciente/${id}/anamnese/nova`}><Plus className="w-4 h-4 mr-1" /> Nova Anamnese</Link>
                    </Button>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/paciente/${id}/evolucao/nova`}><Plus className="w-4 h-4 mr-1" /> Nova Evolução</Link>
                  </Button>
                </div>
              </div>

              {anamnese && (
                <Card className="p-4 shadow-sm border-l-4 border-l-purple-500 bg-purple-50/20">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-purple-600" /> Anamnese
                        <Badge variant="outline" className="text-[10px] border-purple-300">Avaliação inicial</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <UserCircle className="w-3 h-3" /> Registrado em {format(parseISO(anamnese.created_at), "dd/MM/yyyy")}
                        {anamnese.atendimento?.profissional?.nome && ` por ${anamnese.atendimento.profissional.nome}`}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-7 px-2 text-xs"
                        onClick={() => navigate(`/paciente/${id}/prontuario/${anamnese.id}`)}
                      >
                        <Eye className="w-3 h-3 mr-1" /> Ver
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-7 px-2 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={() => navigate(`/paciente/${id}/anamnese/editar/${anamnese.id}`)}
                      >
                        <Pencil className="w-3 h-3 mr-1" /> Editar
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-slate-700 bg-white/50 p-3 rounded border whitespace-pre-wrap">
                    <strong>Queixa:</strong> {anamnese.queixa_principal || '—'}<br />
                    <strong>Diagnóstico:</strong> {anamnese.diagnostico || '—'}<br />
                    <strong>Dor:</strong> {anamnese.escala_dor ?? '—'} / 10<br />
                    {anamnese.evolucao_livre && <><strong>Observações:</strong> {anamnese.evolucao_livre}</>}
                  </div>
                </Card>
              )}

              {evolucoes.length === 0 && !anamnese && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma evolução registrada.</p>
              )}
              {evolucoes.length > 0 && evolucoes.map((p: any) => {
                const dataExibicao = p.data_sessao || p.created_at;
                return (
                  <Card key={p.id} className="p-4 shadow-sm border-l-4 border-l-blue-500">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                          Evolução · {format(parseISO(dataExibicao), "dd/MM/yyyy")}
                          {p.alta_medica && <Badge variant="destructive" className="text-[10px]">🏁 Alta</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <UserCircle className="w-3 h-3" /> Registrado por {p.atendimento?.profissional?.nome || "Profissional"}
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-7 px-2 text-xs"
                        onClick={() => navigate(`/paciente/${id}/prontuario/${p.id}`)}
                      >
                        <Eye className="w-3 h-3 mr-1" /> Ver
                      </Button>
                    </div>
                    <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded border whitespace-pre-wrap">
                      {p.conduta || p.evolucao_livre || p.descricao || p.observacoes || "Nenhum detalhe escrito."}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="servicos" className="mt-4">
          <Card className="p-4 space-y-4 shadow-sm">
            <h3 className="font-semibold flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-primary" /> Lançar Novo Item (Venda)</h3>
            <form onSubmit={lancar} className="space-y-3">
              <Select onValueChange={(v) => setItemTipo(v as any)}>
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="servico">Serviço Avulso</SelectItem>
                  <SelectItem value="pacote">Pacote</SelectItem>
                </SelectContent>
              </Select>
              <Select value={idItemSelecionado} onValueChange={handleItemChange}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {itemTipo === "servico" 
                    ? listaServicos.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>) 
                    : listaPacotes.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)
                  }
                </SelectContent>
              </Select>
              <Input type="number" value={precoFinal} onChange={(e) => setPrecoFinal(e.target.value)} placeholder="Valor R$" />
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">Confirmar Lançamento</Button>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="financeiro" className="mt-4"><PacienteFinanceiro /></TabsContent>
        <TabsContent value="autorizacoes" className="mt-4"><PacienteAutorizacoes /></TabsContent>
      </Tabs>
    </div>
  );
}
