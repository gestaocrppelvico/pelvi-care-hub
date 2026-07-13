import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Wallet, Package, Box, Receipt, CalendarCheck, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const fmt = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PacienteFinanceiro() {
  const { id: pacienteId } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isSecretaria } = useAuth();
  const podeGerenciar = isAdmin || isSecretaria;

  const [paciente, setPaciente] = useState<any>(null);
  const [pacientePacotes, setPacientePacotes] = useState<any[]>([]);
  const [pacienteServicos, setPacienteServicos] = useState<any[]>([]);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modoNovoPag, setModoNovoPag] = useState(false);
  
  // Estados do Modal de Lançamento Avulso (Retroativo)
  const [modalLancamentoAberto, setModalLancamentoAberto] = useState(false);
  const [lancamentoData, setLancamentoData] = useState(new Date().toISOString().split("T")[0]);
  const [lancamentoHora, setLancamentoHora] = useState("08:00");
  const [lancamentoProfissionalId, setLancamentoProfissionalId] = useState("");
  const [lancamentoPacoteId, setLancamentoPacoteId] = useState("avulso");
  
  // Estados para o Modal de Edição Direta (contratos)
  const [modalEdicaoPacote, setModalEdicaoPacote] = useState(false);
  const [pacoteEditando, setPacoteEditando] = useState<any>(null);
  const [editForm, setEditForm] = useState({ sessoes_totais: 0, sessoes_restantes: 0, preco_pago: 0, status_pagamento: "pendente" });

  // Estados para Edição/Exclusão de Pagamentos
  const [pagamentoEditando, setPagamentoEditando] = useState<any>(null);
  const [formPag, setFormPag] = useState({ valor: "", forma: "dinheiro", data_pagamento: "", observacoes: "" });
  const [modalPagAberto, setModalPagAberto] = useState(false);

  const [novoPag, setNovoPag] = useState<any>({
    valor: "",
    forma: "dinheiro",
    data_pagamento: new Date().toISOString().split("T")[0],
    paciente_pacote_id: "none",
    observacoes: ""
  });

  const carregarDados = async () => {
    if (!pacienteId) return;
    setLoading(true);
    try {
      const { data: pac } = await supabase.from("pacientes").select("*").eq("id", pacienteId).maybeSingle();
      setPaciente(pac);

      // 🔥 INCLUI sessoes_realizadas NO SELECT
      const { data: pacs } = await supabase
        .from("paciente_pacotes")
        .select("*, sessoes_realizadas, pacote:pacotes(nome), autorizacao:autorizacoes(plano, numero_guia), servico:servicos(nome)")
        .eq("paciente_id", pacienteId)
        .neq("status_pagamento", "cancelado") 
        .order("created_at", { ascending: false });
      setPacientePacotes(pacs || []);

      const { data: servs } = await supabase
        .from("paciente_servicos")
        .select("*, servico:servicos(nome)")
        .eq("paciente_id", pacienteId)
        .order("created_at", { ascending: false });
      setPacienteServicos(servs || []);

      const { data: pags } = await supabase
        .from("pagamentos")
        .select("*")
        .eq("paciente_id", pacienteId)
        .order("data_pagamento", { ascending: false });
      setPagamentos(pags || []);

      const { data: profs } = await supabase.from("profissionais").select("id, nome").eq("ativo", true).order("nome");
      setProfissionais(profs || []);

    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao carregar dados financeiros.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregarDados(); }, [pacienteId]);

  const registrarPagamento = async () => {
    if (!pacienteId || !novoPag.valor) { toast.error("Informe o valor do pagamento."); return; }
    try {
      const payload: any = {
        paciente_id: pacienteId,
        valor: parseFloat(novoPag.valor),
        forma: novoPag.forma,
        data_pagamento: novoPag.data_pagamento,
        observacoes: novoPag.observacoes || null
      };

      if (novoPag.paciente_pacote_id !== "none") payload.paciente_pacote_id = novoPag.paciente_pacote_id;

      const { error } = await supabase.from("pagamentos").insert(payload);
      if (error) throw error;

      toast.success("Pagamento registrado com sucesso!");
      setModoNovoPag(false);
      setNovoPag({ valor: "", forma: "dinheiro", data_pagamento: new Date().toISOString().split("T")[0], paciente_pacote_id: "none", observacoes: "" });
      carregarDados();
    } catch (err: any) { toast.error("Erro: " + err.message); }
  };

  // ========== FUNÇÕES PARA PAGAMENTOS ==========

  const abrirEdicaoPagamento = (pag: any) => {
    setPagamentoEditando(pag);
    setFormPag({
      valor: String(pag.valor),
      forma: pag.forma || "dinheiro",
      data_pagamento: pag.data_pagamento || new Date().toISOString().split("T")[0],
      observacoes: pag.observacoes || ""
    });
    setModalPagAberto(true);
  };

  const salvarEdicaoPagamento = async () => {
    if (!pagamentoEditando || !formPag.valor) {
      toast.error("Preencha o valor.");
      return;
    }
    try {
      const { error } = await supabase
        .from("pagamentos")
        .update({
          valor: parseFloat(formPag.valor),
          forma: formPag.forma,
          data_pagamento: formPag.data_pagamento,
          observacoes: formPag.observacoes || null
        })
        .eq("id", pagamentoEditando.id);
      if (error) throw error;
      toast.success("Pagamento atualizado!");
      setModalPagAberto(false);
      carregarDados();
    } catch (err: any) { toast.error("Erro: " + err.message); }
  };

  const excluirPagamento = async (id: string) => {
    if (!confirm("Tem certeza que deseja apagar este pagamento permanentemente?")) return;
    try {
      const { error } = await supabase.from("pagamentos").delete().eq("id", id);
      if (error) throw error;
      toast.success("Pagamento removido.");
      carregarDados();
    } catch (err: any) { toast.error("Erro: " + err.message); }
  };

  // ========== FUNÇÕES PARA CONTRATOS ==========

  const abrirEdicaoPacote = (p: any) => {
    setPacoteEditando(p);
    setEditForm({
      sessoes_totais: p.sessoes_totais,
      sessoes_restantes: p.sessoes_restantes,
      preco_pago: p.preco_pago,
      status_pagamento: p.status_pagamento || "pendente"
    });
    setModalEdicaoPacote(true);
  };

  const salvarEdicaoPacote = async () => {
    try {
      const { error } = await supabase.from("paciente_pacotes").update({
        sessoes_totais: editForm.sessoes_totais,
        sessoes_restantes: editForm.sessoes_restantes,
        preco_pago: editForm.preco_pago,
        status_pagamento: editForm.status_pagamento
      }).eq("id", pacoteEditando.id);
      if (error) throw error;
      toast.success("Contrato atualizado com sucesso!");
      setModalEdicaoPacote(false);
      carregarDados();
    } catch (err: any) { toast.error("Erro: " + err.message); }
  };

  const apagarPacote = async (id: string) => {
    if (!confirm("Tem certeza que deseja apagar este lançamento permanentemente?")) return;
    try {
      const { error } = await supabase.from("paciente_pacotes").delete().eq("id", id);
      if (error) throw error;
      toast.success("Lançamento apagado com sucesso!");
      carregarDados();
    } catch (err: any) { toast.error("Erro ao apagar: " + err.message); }
  };

  const apagarServicoAvulso = async (id: string) => {
    if (!confirm("Apagar este serviço avulso?")) return;
    try {
      await supabase.from("paciente_servicos").delete().eq("id", id);
      toast.success("Serviço apagado com sucesso!");
      carregarDados();
    } catch (err: any) { toast.error("Erro ao apagar: " + err.message); }
  };

  const realizarLancamentoRetroativo = async () => {
    if (!lancamentoProfissionalId) { toast.error("Selecione a profissional!"); return; }
    if (!lancamentoData || !lancamentoHora) { toast.error("Data e hora são obrigatórios!"); return; }

    const dataCompleta = new Date(`${lancamentoData}T${lancamentoHora}:00`);
    const ehConvenio = pacientePacotes.find(p => p.id === lancamentoPacoteId)?.autorizacao !== null;
    const tipoAtend = (ehConvenio && lancamentoPacoteId !== "avulso") ? "Plano" : "Particular";

    const payloadAtendimento: any = {
      paciente_id: pacienteId,
      profissional_id: lancamentoProfissionalId,
      data_inicio: dataCompleta.toISOString(),
      data_fim: new Date(dataCompleta.getTime() + 60 * 60000).toISOString(),
      status: "realizado", 
      tipo: tipoAtend
    };

    if (lancamentoPacoteId !== "avulso") payloadAtendimento.paciente_pacote_id = lancamentoPacoteId;

    try {
      const { error } = await supabase.from("atendimentos").insert(payloadAtendimento);
      if (error) throw error;
      toast.success("Lançamento registrado! Repasse gerado com sucesso.");
      setModalLancamentoAberto(false);
      carregarDados();
    } catch (err: any) {
      toast.error("Erro ao lançar: " + err.message);
    }
  };

  if (loading) return <div className="p-6 text-center text-sm text-muted-foreground">Carregando dados financeiros...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-xl font-bold">Financeiro do Paciente</h1>
            <p className="text-sm text-muted-foreground">{paciente?.nome || "—"}</p>
          </div>
        </div>
        <Button variant="default" size="sm" onClick={() => setModalLancamentoAberto(true)} className="bg-blue-600 hover:bg-blue-700">
          <CalendarCheck className="w-4 h-4 mr-2" /> Lançar Sessão
        </Button>
      </div>

      <Tabs defaultValue="saldos">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="saldos">Saldos e Sessões</TabsTrigger>
          <TabsTrigger value="historico">Histórico de Pagos</TabsTrigger>
        </TabsList>

        <TabsContent value="saldos" className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5"><Package className="w-4 h-4" /> Contratos e Saldos</h2>
          </div>

          {pacientePacotes.length === 0 && pacienteServicos.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum contrato ativo ou pendente encontrado.</Card>
          )}

          {pacientePacotes.map((p) => {
            // 🔥 CÁLCULO COM SESSÕES REALIZADAS
            const realizadas = p.sessoes_realizadas ?? 0;
            const total = p.sessoes_totais;
            const restantes = total - realizadas;
            const pct = total > 0 ? Math.round((realizadas / total) * 100) : 0;
            const corBarra = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-yellow-500" : "bg-primary";

            return (
              <Card key={p.id} className="p-3 border-l-4 border-l-primary space-y-1 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm text-slate-800 pr-2">
                    {p.autorizacao 
                      ? `Guia Autorizada: ${p.autorizacao.plano} ${p.autorizacao.numero_guia ? `(Nº ${p.autorizacao.numero_guia})` : ''}`
                      : `Pacote/Serviço: ${p.pacote?.nome || p.servico?.nome || "Particular Customizado"}`
                    }
                  </div>
                  
                  {podeGerenciar && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEdicaoPacote(p)}>
                        <Pencil className="w-3.5 h-3.5 text-blue-600" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-50" onClick={() => apagarPacote(p.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  )}
                </div>
                
                {/* 🔥 SESSÕES: REALIZADAS / TOTAL */}
                <div className="flex items-center justify-between pt-1">
                  <Badge variant={restantes > 0 ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                    {restantes > 0 ? `${restantes} restantes` : "Completo"}
                  </Badge>
                  <span className="font-bold text-slate-700 text-sm">
                    {p.autorizacao ? "Plano de Saúde" : `R$ ${Number(p.preco_pago).toFixed(2)}`}
                  </span>
                </div>

                {/* 🔥 BARRA DE PROGRESSO */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Sessões: {realizadas}/{total}</span>
                    <span className={restantes <= 2 && restantes > 0 ? "text-yellow-600 font-medium" : restantes <= 0 ? "text-destructive font-medium" : ""}>
                      {restantes > 0 ? `${restantes} restantes` : "Completo"}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-1.5 rounded-full transition-all ${corBarra}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>

                <div className="text-xs text-muted-foreground mt-1">
                  Criado em: {new Date(p.created_at).toLocaleDateString("pt-BR")}
                  {/* 🔥 SÓ MOSTRA BADGE DE STATUS PARA PARTICULARES (SEM AUTORIZAÇÃO) */}
                  {!p.autorizacao && (
                    <span className="ml-2 capitalize text-amber-600 font-medium">· {p.status_pagamento}</span>
                  )}
                </div>
              </Card>
            );
          })}

          {pacienteServicos.map((s) => (
            <Card key={s.id} className="p-3 border-l-4 border-l-emerald-500 flex justify-between items-center">
              <div>
                <div className="font-semibold text-sm flex items-center gap-1"><Box className="w-3.5 h-3.5 text-emerald-500" /> {s.servico?.nome || "Serviço Avulso"}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Lançado em {new Date(s.created_at).toLocaleDateString("pt-BR")}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200">Sessão Única</Badge>
                {podeGerenciar && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-50" onClick={() => apagarServicoAvulso(s.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="historico" className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5"><Wallet className="w-4 h-4" /> Recibos de Pagamento</h2>
            {podeGerenciar && <Button size="sm" onClick={() => setModoNovoPag(!modoNovoPag)}><Plus className="w-4 h-4 mr-1" /> Registrar</Button>}
          </div>

          {modoNovoPag && (
            <Card className="p-4 border border-primary/20 bg-slate-50/50 space-y-3">
              <h3 className="font-medium text-xs text-primary uppercase tracking-wider">Novo Recebimento</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Valor (R$)</Label>
                  <Input type="number" step="0.01" value={novoPag.valor} onChange={(e) => setNovoPag({ ...novoPag, valor: e.target.value })} placeholder="0,00" />
                </div>
                <div className="space-y-1">
                  <Label>Forma</Label>
                  <Select value={novoPag.forma} onValueChange={(v) => setNovoPag({ ...novoPag, forma: v })}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                      <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Data</Label>
                  <Input type="date" value={novoPag.data_pagamento} onChange={(e) => setNovoPag({ ...novoPag, data_pagamento: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Vincular a Contrato</Label>
                  <Select value={novoPag.paciente_pacote_id} onValueChange={(v) => setNovoPag({ ...novoPag, paciente_pacote_id: v })}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sem Vínculo —</SelectItem>
                      {pacientePacotes.filter(p => !p.autorizacao).map((p) => (
                        <SelectItem key={p.id} value={p.id}>Pacote: {p.pacote?.nome || "Particular"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Observações</Label>
                <Textarea placeholder="Ex: Referente à primeira parcela..." value={novoPag.observacoes} onChange={(e) => setNovoPag({ ...novoPag, observacoes: e.target.value })} rows={2} />
              </div>
              <div className="flex gap-2 pt-1">
                <Button className="flex-1" onClick={registrarPagamento}>Confirmar Recebimento</Button>
                <Button variant="outline" onClick={() => setModoNovoPag(false)}>Cancelar</Button>
              </div>
            </Card>
          )}

          {pagamentos.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum histórico de pagamento registrado para este paciente.</Card>
          )}

          {pagamentos.map((p) => (
            <Card key={p.id} className="p-3 flex items-center gap-2.5">
              <Receipt className="w-5 h-5 text-emerald-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-800 text-sm">{fmt(Number(p.valor))}</div>
                <div className="text-xs text-muted-foreground capitalize">{p.forma.replace("_", " ")} · {new Date(p.data_pagamento).toLocaleDateString("pt-BR")}</div>
                {p.observacoes && <p className="text-[11px] text-slate-500 bg-slate-50 border rounded p-1 mt-1.5 italic">{p.observacoes}</p>}
              </div>
              {podeGerenciar && (
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEdicaoPagamento(p)}>
                    <Pencil className="w-3.5 h-3.5 text-blue-600" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-50" onClick={() => excluirPagamento(p.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* MODAL DE EDIÇÃO DE CONTRATO/PACOTE */}
      <Dialog open={modalEdicaoPacote} onOpenChange={setModalEdicaoPacote}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Contrato/Pacote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sessões Totais</Label>
                <Input type="number" value={editForm.sessoes_totais} onChange={(e) => setEditForm({...editForm, sessoes_totais: Number(e.target.value)})} />
              </div>
              <div className="space-y-1.5">
                <Label>Sessões Restantes</Label>
                <Input type="number" value={editForm.sessoes_restantes} onChange={(e) => setEditForm({...editForm, sessoes_restantes: Number(e.target.value)})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor Total (R$)</Label>
                <Input type="number" value={editForm.preco_pago} onChange={(e) => setEditForm({...editForm, preco_pago: Number(e.target.value)})} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={editForm.status_pagamento} onValueChange={(v) => setEditForm({...editForm, status_pagamento: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEdicaoPacote(false)}>Cancelar</Button>
            <Button onClick={salvarEdicaoPacote} className="bg-blue-600 hover:bg-blue-700">Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE EDIÇÃO DE PAGAMENTO */}
      <Dialog open={modalPagAberto} onOpenChange={setModalPagAberto}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={formPag.valor} onChange={(e) => setFormPag({...formPag, valor: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <Label>Forma</Label>
              <Select value={formPag.forma} onValueChange={(v) => setFormPag({...formPag, forma: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                  <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={formPag.data_pagamento} onChange={(e) => setFormPag({...formPag, data_pagamento: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={formPag.observacoes} onChange={(e) => setFormPag({...formPag, observacoes: e.target.value})} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalPagAberto(false)}>Cancelar</Button>
            <Button onClick={salvarEdicaoPagamento} className="bg-blue-600 hover:bg-blue-700">Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE LANÇAMENTO AVULSO */}
      <Dialog open={modalLancamentoAberto} onOpenChange={setModalLancamentoAberto}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Lançar Sessão (Manual/Retroativo)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground bg-blue-50 p-2 rounded border border-blue-100">
              Este lançamento irá registrar uma sessão como <strong>REALIZADA</strong>, descontar automaticamente do saldo e gerar o repasse para a profissional (inclusive para Planos de Saúde).
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={lancamentoData} onChange={(e) => setLancamentoData(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Hora (Aprox.)</Label>
                <Input type="time" value={lancamentoHora} onChange={(e) => setLancamentoHora(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Profissional</Label>
              <Select value={lancamentoProfissionalId} onValueChange={setLancamentoProfissionalId}>
                <SelectTrigger><SelectValue placeholder="Quem atendeu?" /></SelectTrigger>
                <SelectContent>
                  {profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Pacote / Guia a Descontar</Label>
              <Select value={lancamentoPacoteId} onValueChange={setLancamentoPacoteId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="avulso">— Sessão Avulsa (Sem vínculo) —</SelectItem>
                  {pacientePacotes.filter(p => p.sessoes_restantes > 0).map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.autorizacao ? `[PLANO] ${p.autorizacao.plano}` : `[PARTICULAR] ${p.pacote?.nome}`} 
                      {` (${p.sessoes_restantes} rest.)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalLancamentoAberto(false)}>Cancelar</Button>
            <Button onClick={realizarLancamentoRetroativo}>Gravar Sessão</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
