import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Wallet, Receipt, Filter, Calendar, DollarSign, User, CheckCircle2, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, parseISO, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Pagamento {
  id: string;
  paciente_id: string | null;
  paciente_pacote_id: string | null;
  valor: number;
  forma: string;
  data_pagamento: string;
  observacoes: string | null;
  created_at: string;
  categoria?: string;
  paciente?: { nome: string } | null;
}

interface RepasseConferido {
  id: string;
  valor_repasse: number;
  status: string;
  created_at: string;
  data_atendimento: string | null;
  atendimento?: { data_inicio: string } | null;
  profissional: { id: string; nome: string; cor_agenda: string } | null;
}

interface AgrupamentoRepasse {
  profissional_id: string;
  nome: string;
  cor: string;
  total: number;
  repasses_ids: string[];
}

export default function Pagamentos() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [repassesConferidos, setRepassesConferidos] = useState<RepasseConferido[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [filtroMes, setFiltroMes] = useState(format(new Date(), "yyyy-MM"));
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  
  const [modalDespesaAberto, setModalDespesaAberto] = useState(false);
  const [modalPagamentoRepasseAberto, setModalPagamentoRepasseAberto] = useState(false);
  const [repasseSelecionado, setRepasseSelecionado] = useState<AgrupamentoRepasse | null>(null);

  const [formDespesa, setFormDespesa] = useState({
    beneficiario: "", valor: "", forma: "pix", data_pagamento: format(new Date(), "yyyy-MM-dd"), observacoes: ""
  });

  const [formPagamento, setFormPagamento] = useState({
    forma: "pix", data_pagamento: format(new Date(), "yyyy-MM-dd"),
  });

  async function carregarDados() {
    setLoading(true);
    try {
      const inicioMes = startOfDay(parseISO(filtroMes + "-01"));
      const fimMes = endOfDay(endOfMonth(inicioMes));

      const { data: pagData, error: pagError } = await supabase
        .from("pagamentos")
        .select(`*, paciente:pacientes(nome)`)
        .gte("data_pagamento", format(inicioMes, "yyyy-MM-dd"))
        .lte("data_pagamento", format(fimMes, "yyyy-MM-dd"))
        .order("data_pagamento", { ascending: false });

      if (pagError) throw pagError;

      const extratoFormatado = (pagData || []).map(p => {
        let categoria = "receita";
        if (!p.paciente_id) {
          categoria = p.observacoes?.toLowerCase().includes("repasse") ? "repasse" : "conta_fixa";
        }
        return { ...p, categoria };
      });
      setPagamentos(extratoFormatado);

      const { data: repData, error: repError } = await supabase
        .from("repasses_atendimento")
        .select(`
          id, valor_repasse, status, created_at, data_atendimento,
          profissional:profissionais(id, nome, cor_agenda),
          atendimento:atendimentos(data_inicio)
        `)
        .eq("status", "conferido"); 

      if (repError) throw repError;

      const repassesFiltrados = (repData || []).filter((r: any) => {
        const dataReferencia = r.atendimento?.data_inicio 
          ? parseISO(r.atendimento.data_inicio) 
          : (r.data_atendimento ? parseISO(r.data_atendimento) : parseISO(r.created_at));
        
        return dataReferencia >= inicioMes && dataReferencia <= fimMes;
      });

      setRepassesConferidos(repassesFiltrados as any);

    } catch (err: any) {
      toast.error("Erro ao carregar dados: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, [filtroMes]);

  const repassesAgrupados = useMemo(() => {
    const agrupamento: Record<string, AgrupamentoRepasse> = {};

    repassesConferidos.forEach(rep => {
      if (!rep.profissional) return;
      const profId = rep.profissional.id;

      if (!agrupamento[profId]) {
        agrupamento[profId] = {
          profissional_id: profId, nome: rep.profissional.nome,
          cor: rep.profissional.cor_agenda || "#3b82f6", total: 0, repasses_ids: []
        };
      }

      agrupamento[profId].total += Number(rep.valor_repasse);
      agrupamento[profId].repasses_ids.push(rep.id);
    });

    return Object.values(agrupamento).sort((a, b) => b.total - a.total);
  }, [repassesConferidos]);

  const pagamentosFiltrados = useMemo(() => {
    if (filtroTipo === "todos") return pagamentos;
    return pagamentos.filter(p => p.categoria === filtroTipo);
  }, [pagamentos, filtroTipo]);

  const totalRecebido = pagamentos.filter(p => p.categoria === "receita").reduce((acc, p) => acc + Number(p.valor), 0);
  const totalRepassesPagos = pagamentos.filter(p => p.categoria === "repasse").reduce((acc, p) => acc + Number(p.valor), 0);
  const totalContas = pagamentos.filter(p => p.categoria === "conta_fixa").reduce((acc, p) => acc + Number(p.valor), 0);

  async function registrarDespesa() {
    if (!formDespesa.beneficiario.trim() || !formDespesa.valor || parseFloat(formDespesa.valor) <= 0) {
      toast.error("Preencha os campos obrigatórios."); return;
    }
    const payload = {
      paciente_id: null, paciente_pacote_id: null,
      valor: parseFloat(formDespesa.valor), forma: formDespesa.forma,
      data_pagamento: formDespesa.data_pagamento,
      observacoes: `Conta Fixa - ${formDespesa.beneficiario}${formDespesa.observacoes ? " | " + formDespesa.observacoes : ""}`
    };
    try {
      const { error } = await supabase.from("pagamentos").insert(payload);
      if (error) throw error;
      toast.success("Despesa registrada!");
      setModalDespesaAberto(false);
      setFormDespesa({ ...formDespesa, beneficiario: "", valor: "", observacoes: "" });
      carregarDados();
    } catch (err: any) { toast.error("Erro: " + err.message); }
  }

  async function pagarRepasses() {
    if (!repasseSelecionado) return;
    try {
      const { error: errPag } = await supabase.from("pagamentos").insert({
        paciente_id: null, valor: repasseSelecionado.total, forma: formPagamento.forma,
        data_pagamento: formPagamento.data_pagamento,
        observacoes: `Repasse - ${repasseSelecionado.nome} | Referente a ${format(parseISO(filtroMes + "-01"), "MMMM/yyyy", { locale: ptBR })}`
      });
      if (errPag) throw errPag;

      const { error: errRep } = await supabase
        .from("repasses_atendimento").update({ status: "pago" }).in("id", repasseSelecionado.repasses_ids);
      if (errRep) throw errRep;

      toast.success(`Pagamento de ${repasseSelecionado.nome} registrado!`);
      setModalPagamentoRepasseAberto(false);
      setRepasseSelecionado(null);
      carregarDados();
    } catch (err: any) { toast.error("Erro: " + err.message); }
  }

  async function excluirPagamento(id: string) {
    if (!confirm("Excluir registro do extrato?")) return;
    try {
      const { error } = await supabase.from("pagamentos").delete().eq("id", id);
      if (error) throw error;
      toast.success("Registro excluído!"); carregarDados();
    } catch (err: any) { toast.error("Erro: " + err.message); }
  }

  if (!isAdmin) return <div className="p-8 text-center mt-10">Acesso Restrito</div>;
  const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-4 pb-20 max-w-6xl mx-auto p-2">
      {/* 🔥 CABEÇALHO RESPONSIVO: Empilha no celular, alinha na tela grande */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/financeiro")}><ArrowLeft className="w-5 h-5" /></Button>
          <Wallet className="w-6 h-6 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold">Gestão Financeira</h1>
        </div>
        <Button variant="outline" onClick={() => setModalDespesaAberto(true)} className="w-full sm:w-auto">
          <Receipt className="w-4 h-4 mr-2" /> Nova Despesa
        </Button>
      </div>

      {/* 🔥 FILTROS RESPONSIVOS */}
      <Card className="p-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="w-full sm:w-[160px] h-9 text-sm" />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-full sm:w-[180px] h-9">
            <Filter className="w-4 h-4 mr-1" />
            <SelectValue placeholder="Filtrar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Ver Tudo</SelectItem>
            <SelectItem value="receita">Apenas Receitas</SelectItem>
            <SelectItem value="repasse">Apenas Repasses</SelectItem>
            <SelectItem value="conta_fixa">Apenas Contas Fixas</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={carregarDados} className="w-full sm:w-auto sm:ml-auto">
          Atualizar
        </Button>
      </Card>

      {/* 🔥 CARDS DE RESUMO: 1 coluna no celular, 3 na tela grande */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-3 sm:p-4 border-l-4 border-l-emerald-500">
          <div className="text-xs text-muted-foreground">Receitas (Pacientes)</div>
          <div className="font-bold text-xl sm:text-2xl text-emerald-600">{formatBRL(totalRecebido)}</div>
        </Card>
        <Card className="p-3 sm:p-4 border-l-4 border-l-blue-500">
          <div className="text-xs text-muted-foreground">Repasses Pagos</div>
          <div className="font-bold text-xl sm:text-2xl text-blue-600">{formatBRL(totalRepassesPagos)}</div>
        </Card>
        <Card className="p-3 sm:p-4 border-l-4 border-l-amber-500">
          <div className="text-xs text-muted-foreground">Contas Fixas Pagas</div>
          <div className="font-bold text-xl sm:text-2xl text-amber-600">{formatBRL(totalContas)}</div>
        </Card>
      </div>

      <div className="mt-6">
        <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2 mb-3">
          <Clock className="w-5 h-5 text-blue-600" /> Repasses Conferidos (Prontos para Pagamento)
        </h2>
        {repassesAgrupados.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground bg-slate-50 border-dashed">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" /> Nenhum repasse aguardando pagamento.
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {repassesAgrupados.map(rep => (
              <Card key={rep.profissional_id} className="p-4 border-l-4" style={{ borderLeftColor: rep.cor }}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-bold text-slate-800">{rep.nome}</div>
                    <div className="text-xs text-muted-foreground">{rep.repasses_ids.length} sessões conferidas</div>
                  </div>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">A Pagar</Badge>
                </div>
                <div className="text-2xl font-bold text-slate-800 mb-3">{formatBRL(rep.total)}</div>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => { setRepasseSelecionado(rep); setModalPagamentoRepasseAberto(true); }}>
                  <DollarSign className="w-4 h-4 mr-1" /> Registrar Pagamento
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2 mb-3">
          <Receipt className="w-5 h-5 text-slate-600" /> Extrato de Movimentações
        </h2>
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Carregando...</div>
          ) : pagamentosFiltrados.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma movimentação neste mês.</Card>
          ) : (
            pagamentosFiltrados.map((p) => {
              const isReceita = p.categoria === "receita";
              return (
                <Card key={p.id} className="p-3 sm:p-4 flex items-center gap-2 sm:gap-4 hover:shadow-md transition-shadow">
                  <div className={`p-2 rounded-full shrink-0 ${isReceita ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                    {isReceita ? <User className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" /> : <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-sm truncate">
                        {isReceita ? p.paciente?.nome : p.observacoes?.split(" - ")[1]?.split(" | ")[0]}
                      </span>
                      <Badge variant="outline" className={`text-[9px] sm:text-[10px] w-fit ${isReceita ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-slate-600 bg-slate-50'}`}>
                        {isReceita ? 'Receita' : p.observacoes?.toLowerCase().includes("repasse") ? 'Repasse' : 'Conta Fixa'}
                      </Badge>
                    </div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                      {format(parseISO(p.data_pagamento), "dd/MM/yyyy")} · {p.forma}
                    </div>
                    {!isReceita && p.observacoes && <div className="text-[10px] sm:text-[11px] text-slate-500 italic mt-1 truncate max-w-[200px] sm:max-w-xs">{p.observacoes}</div>}
                  </div>
                  <div className={`font-bold text-sm sm:text-base shrink-0 ${isReceita ? 'text-emerald-600' : 'text-slate-600'}`}>
                    {isReceita ? "+" : "-"} {formatBRL(Number(p.valor))}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50 shrink-0" onClick={() => excluirPagamento(p.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* MODAIS AJUSTADOS COM SCROLL PARA NÃO VAZAR A TELA NO CELULAR */}
      <Dialog open={modalDespesaAberto} onOpenChange={setModalDespesaAberto}>
        <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Registrar Nova Despesa</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Descrição / Beneficiário *</Label><Input placeholder="Ex: Aluguel..." value={formDespesa.beneficiario} onChange={(e) => setFormDespesa({ ...formDespesa, beneficiario: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={formDespesa.valor} onChange={(e) => setFormDespesa({ ...formDespesa, valor: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Data do Pagamento</Label><Input type="date" value={formDespesa.data_pagamento} onChange={(e) => setFormDespesa({ ...formDespesa, data_pagamento: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Forma de Pagamento</Label><Select value={formDespesa.forma} onValueChange={(v) => setFormDespesa({ ...formDespesa, forma: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pix">PIX</SelectItem><SelectItem value="transferencia">Transferência</SelectItem><SelectItem value="dinheiro">Dinheiro</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setModalDespesaAberto(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={registrarDespesa} className="bg-slate-800 text-white w-full sm:w-auto">Registrar Despesa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalPagamentoRepasseAberto} onOpenChange={setModalPagamentoRepasseAberto}>
        <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Pagar Repasse</DialogTitle></DialogHeader>
          {repasseSelecionado && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 border rounded-lg p-3 text-center">
                <div className="text-sm text-muted-foreground">Profissional</div>
                <div className="font-bold text-lg">{repasseSelecionado.nome}</div>
                <div className="text-sm text-muted-foreground mt-2">Total a Pagar (Conferido)</div>
                <div className="text-3xl font-black text-emerald-600">{formatBRL(repasseSelecionado.total)}</div>
                <div className="text-xs text-muted-foreground mt-1">({repasseSelecionado.repasses_ids.length} sessões)</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Forma</Label><Select value={formPagamento.forma} onValueChange={(v) => setFormPagamento({ ...formPagamento, forma: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pix">PIX</SelectItem><SelectItem value="transferencia">Transferência</SelectItem><SelectItem value="dinheiro">Dinheiro</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={formPagamento.data_pagamento} onChange={(e) => setFormPagamento({ ...formPagamento, data_pagamento: e.target.value })} /></div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setModalPagamentoRepasseAberto(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={pagarRepasses} className="bg-emerald-600 text-white w-full sm:w-auto">Confirmar Pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
