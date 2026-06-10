import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Phone, Calendar, Pencil, ShoppingBag, CheckCircle2, XCircle, AlertCircle, Clock, UserCircle, FileText, Plus } from "lucide-react";
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

// Importações dos sub-componentes
import PacienteFinanceiro from "./PacienteFinanceiro";
import PacienteAutorizacoes from "./PacienteAutorizacoes";

export default function PacienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isSecretaria } = useAuth();
  const podeGerenciar = isAdmin || isSecretaria;

  const [pac, setPac] = useState<any>(null);
  const [pront, setPront] = useState<any[]>([]);
  const [atendimentos, setAtendimentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados Novo Lançamento
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
      const { data: p } = await supabase.from("pacientes").select("*").eq("id", id).maybeSingle();
      setPac(p);
      
      const { data: pr } = await supabase
        .from("prontuarios")
        .select("*, atendimento:atendimentos(data_inicio, profissional:profissionais(nome))")
        .eq("paciente_id", id)
        .order("created_at", { ascending: false });
      setPront(pr || []);
      
      // NOVO: Busca o histórico completo de atendimentos do paciente
      const { data: at } = await supabase
        .from("atendimentos")
        .select("id, status, data_inicio, profissional:profissionais(nome)")
        .eq("paciente_id", id)
        .order("data_inicio", { ascending: false });
      setAtendimentos(at || []);
      
      const [{ data: s }, { data: pks }] = await Promise.all([
        supabase.from("servicos").select("id, nome, preco").eq("ativo", true),
        supabase.from("pacotes").select("id, nome, numero_sessoes, preco_total").eq("ativo", true)
      ]);
      setListaServicos(s || []);
      setListaPacotes(pks || []);
    } catch (e) { 
      toast.error("Erro ao carregar"); 
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
        await supabase.from("paciente_pacotes").insert({ paciente_id: id, pacote_id: idItemSelecionado, sessoes_totais: qtdSessoes, sessoes_restantes: qtdSessoes, preco_pago: precoFinal });
      } else {
        await supabase.from("paciente_servicos").insert({ paciente_id: id, servico_id: idItemSelecionado });
        await supabase.from("paciente_pacotes").insert({ paciente_id: id, servico_id: idItemSelecionado, sessoes_totais: 1, sessoes_restantes: 1, preco_pago: precoFinal });
      }
      toast.success("Lançado com sucesso!");
      setIdItemSelecionado("");
    } catch (err: any) { toast.error(err.message); }
  };

  // CÁLCULO DAS ESTATÍSTICAS DO HISTÓRICO
  const statsHistorico = useMemo(() => {
    const realizados = atendimentos.filter(a => a.status === "realizado");
    const faltas = atendimentos.filter(a => a.status === "falta" || a.status === "ausente");
    const cancelados = atendimentos.filter(a => a.status === "cancelado" || a.status === "remarcado");
    
    // Pega nomes únicos dos profissionais que já atenderam (que tiveram sessão realizada)
    const profs = Array.from(new Set(realizados.map(a => a.profissional?.nome).filter(Boolean)));
    
    // Descobre qual foi o primeiro registro (como a lista está decrescente, o último item é o mais antigo)
    const primeiraSessao = realizados.length > 0 ? realizados[realizados.length - 1].data_inicio : null;
    
    return { 
      total: realizados.length, 
      faltas: faltas.length, 
      cancelados: cancelados.length, 
      profissionais: profs, 
      primeiraSessao 
    };
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
        <Button asChild variant="outline" size="sm">
          <Link to={`/pacientes/${id}/editar`}><Pencil className="w-4 h-4 mr-2" /> Editar</Link>
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

        {/* ---------------------------------------------------------------------------------- */}
        {/* ABA 1: HISTÓRICO CLINICO E ASSIDUIDADE */}
        <TabsContent value="historico" className="space-y-4 mt-4">
          
          {/* Mini-Dashboard do Paciente */}
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
            {/* Informações Gerais */}
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

            {/* Linha do Tempo */}
            <Card className="p-4 shadow-sm h-[300px] flex flex-col">
              <h3 className="font-semibold text-sm flex items-center gap-2 border-b pb-2 mb-3">
                <Calendar className="w-4 h-4 text-primary" /> Últimas Consultas
              </h3>
              <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                {atendimentos.length === 0 && <div className="text-center text-sm text-muted-foreground mt-10">Nenhum agendamento encontrado.</div>}
                
                {atendimentos.map(a => (
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
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------------------------------- */}
        {/* ABA 2: PRONTUÁRIOS */}
        <TabsContent value="prontuario" className="mt-4">
          {pront.length === 0 ? (
            <Card className="p-10 flex flex-col items-center justify-center text-center space-y-4 shadow-sm border-dashed">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-800">Nenhum prontuário encontrado</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                  Este paciente ainda não possui evoluções ou notas clínicas registradas no sistema.
                </p>
              </div>
              <Button asChild className="mt-2 bg-blue-600 hover:bg-blue-700">
                <Link to={`/pacientes/${id}/prontuario/novo`}><Plus className="w-4 h-4 mr-2" /> Criar Primeiro Prontuário</Link>
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-sm text-slate-700">Evoluções Clínicas ({pront.length})</h3>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/pacientes/${id}/prontuario/novo`}><Plus className="w-4 h-4 mr-1" /> Novo Prontuário</Link>
                </Button>
              </div>
              
              {pront.map(p => (
                <Card key={p.id} className="p-4 shadow-sm border-l-4 border-l-blue-500">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-sm text-slate-800">
                        Evolução · {format(parseISO(p.created_at), "dd/MM/yyyy")}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <UserCircle className="w-3 h-3" /> Registrado por {p.atendimento?.profissional?.nome || "Profissional"}
                      </div>
                    </div>
                  </div>
                  {/* Presumindo que o texto do prontuário fica na coluna 'evolucao', 'descricao' ou 'observacoes' */}
                  <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded border whitespace-pre-wrap">
                    {p.evolucao || p.descricao || p.observacoes || "Nenhum detalhe escrito nesta evolução."}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------------------------------------------------------------------------- */}
        {/* ABA 3: SERVIÇOS (Lançamento) */}
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

        {/* ---------------------------------------------------------------------------------- */}
        {/* ABAS 4 e 5: COMPONENTES EXTERNOS */}
        <TabsContent value="financeiro" className="mt-4"><PacienteFinanceiro /></TabsContent>
        <TabsContent value="autorizacoes" className="mt-4"><PacienteAutorizacoes /></TabsContent>
      </Tabs>
    </div>
  );
}
