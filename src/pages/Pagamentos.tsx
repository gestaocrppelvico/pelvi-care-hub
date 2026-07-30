import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Wallet, Receipt, Pencil, Trash2, Filter, Calendar, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
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
  // Campos adicionais (relacionamentos)
  profissional?: { id: string; nome: string } | null;
  categoria?: string;
}

export default function Pagamentos() {
  const navigate = useNavigate();
  const { isAdmin, isSecretaria } = useAuth();
  const podeGerenciar = isAdmin || isSecretaria;

  // Estados principais
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroMes, setFiltroMes] = useState(format(new Date(), "yyyy-MM"));
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroBeneficiario, setFiltroBeneficiario] = useState<string>("todos");

  // Estado do modal de novo pagamento
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState({
    beneficiario: "",
    valor: "",
    forma: "pix",
    data_pagamento: format(new Date(), "yyyy-MM-dd"),
    categoria: "repasse",
    observacoes: ""
  });

  // Lista de profissionais para o select
  const [profissionais, setProfissionais] = useState<{ id: string; nome: string }[]>([]);

  // Carregar profissionais para o select
  useEffect(() => {
    supabase
      .from("profissionais")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => setProfissionais(data || []));
  }, []);

  // Carregar pagamentos
  async function carregarPagamentos() {
    setLoading(true);
    try {
      const start = startOfMonth(parseISO(filtroMes + "-01"));
      const end = endOfMonth(start);

      let query = supabase
        .from("pagamentos")
        .select("*")
        .gte("data_pagamento", start.toISOString())
        .lte("data_pagamento", end.toISOString())
        .order("data_pagamento", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      // Mapear para incluir categoria (repasse ou conta fixa)
      const pagamentosComCategoria = (data || []).map(p => ({
        ...p,
        categoria: p.observacoes?.includes("Repasse") ? "repasse" : "conta_fixa"
      }));

      setPagamentos(pagamentosComCategoria);
    } catch (err: any) {
      toast.error("Erro ao carregar pagamentos: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarPagamentos();
  }, [filtroMes]);

  // Filtrar pagamentos
  const pagamentosFiltrados = useMemo(() => {
    let filtrados = pagamentos;

    if (filtroTipo !== "todos") {
      filtrados = filtrados.filter(p => p.categoria === filtroTipo);
    }

    if (filtroBeneficiario !== "todos") {
      filtrados = filtrados.filter(p => 
        p.observacoes?.toLowerCase().includes(filtroBeneficiario.toLowerCase()) ||
        p.id === filtroBeneficiario
      );
    }

    return filtrados;
  }, [pagamentos, filtroTipo, filtroBeneficiario]);

  // Totalizadores
  const totalPago = pagamentosFiltrados.reduce((acc, p) => acc + Number(p.valor), 0);
  const totalRepasses = pagamentosFiltrados
    .filter(p => p.categoria === "repasse")
    .reduce((acc, p) => acc + Number(p.valor), 0);
  const totalContas = pagamentosFiltrados
    .filter(p => p.categoria === "conta_fixa")
    .reduce((acc, p) => acc + Number(p.valor), 0);

  // Salvar novo pagamento ou editar
  async function salvarPagamento() {
    if (!form.beneficiario.trim()) {
      toast.error("Informe o beneficiário/descrição.");
      return;
    }
    if (!form.valor || parseFloat(form.valor) <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }

    const payload = {
      paciente_id: null,
      paciente_pacote_id: null,
      valor: parseFloat(form.valor),
      forma: form.forma,
      data_pagamento: form.data_pagamento,
      observacoes: `${form.categoria === "repasse" ? "Repasse" : "Conta Fixa"} - ${form.beneficiario}${form.observacoes ? " | " + form.observacoes : ""}`
    };

    try {
      if (editandoId) {
        const { error } = await supabase
          .from("pagamentos")
          .update(payload)
          .eq("id", editandoId);
        if (error) throw error;
        toast.success("Pagamento atualizado!");
      } else {
        const { error } = await supabase
          .from("pagamentos")
          .insert(payload);
        if (error) throw error;
        toast.success("Pagamento registrado!");
      }
      setModalAberto(false);
      setEditandoId(null);
      setForm({
        beneficiario: "",
        valor: "",
        forma: "pix",
        data_pagamento: format(new Date(), "yyyy-MM-dd"),
        categoria: "repasse",
        observacoes: ""
      });
      carregarPagamentos();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  }

  // Excluir pagamento
  async function excluirPagamento(id: string) {
    if (!confirm("Tem certeza que deseja excluir este pagamento?")) return;
    try {
      const { error } = await supabase
        .from("pagamentos")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Pagamento excluído!");
      carregarPagamentos();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  }

  // Abrir modal para editar
  function abrirEdicao(pag: Pagamento) {
    setEditandoId(pag.id);
    // Extrair beneficiário e observação do campo observacoes
    const partes = pag.observacoes?.split(" - ") || [];
    const categoria = partes[0]?.includes("Repasse") ? "repasse" : "conta_fixa";
    const beneficiario = partes[1]?.split(" | ")[0] || "";
    const obs = partes[1]?.split(" | ")[1] || "";
    setForm({
      beneficiario,
      valor: String(pag.valor),
      forma: pag.forma,
      data_pagamento: pag.data_pagamento,
      categoria,
      observacoes: obs
    });
    setModalAberto(true);
  }

  const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/financeiro")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Wallet className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Pagamentos</h1>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 p-3 bg-muted/50 rounded-lg border flex-wrap items-center">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input
            type="month"
            value={filtroMes}
            onChange={(e) => setFiltroMes(e.target.value)}
            className="w-[160px] h-9 text-sm"
          />
        </div>

        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-full sm:w-[150px] h-9">
            <Filter className="w-4 h-4 mr-1" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="repasse">Repasses</SelectItem>
            <SelectItem value="conta_fixa">Contas Fixas</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filtroBeneficiario} onValueChange={setFiltroBeneficiario}>
          <SelectTrigger className="w-full sm:w-[180px] h-9">
            <SelectValue placeholder="Beneficiário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {profissionais.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
            ))}
            <SelectItem value="outros">Outros</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={carregarPagamentos} className="ml-auto">
          Atualizar
        </Button>

        {podeGerenciar && (
          <Button
            size="sm"
            onClick={() => {
              setEditandoId(null);
              setForm({
                beneficiario: "",
                valor: "",
                forma: "pix",
                data_pagamento: format(new Date(), "yyyy-MM-dd"),
                categoria: "repasse",
                observacoes: ""
              });
              setModalAberto(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4 mr-1" /> Novo Pagamento
          </Button>
        )}
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Total Pago</div>
          <div className="font-bold text-lg">{formatBRL(totalPago)}</div>
        </Card>
        <Card className="p-3 border-l-4 border-l-blue-500">
          <div className="text-xs text-muted-foreground">Repasses</div>
          <div className="font-bold text-blue-600">{formatBRL(totalRepasses)}</div>
        </Card>
        <Card className="p-3 border-l-4 border-l-amber-500">
          <div className="text-xs text-muted-foreground">Contas Fixas</div>
          <div className="font-bold text-amber-600">{formatBRL(totalContas)}</div>
        </Card>
      </div>

      {/* Lista de pagamentos */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Carregando...</div>
        ) : pagamentosFiltrados.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nenhum pagamento registrado neste período.
          </Card>
        ) : (
          pagamentosFiltrados.map((p) => (
            <Card key={p.id} className="p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
              <Receipt className={`w-5 h-5 ${p.categoria === 'repasse' ? 'text-blue-500' : 'text-amber-500'} shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800">
                    {p.observacoes?.split(" - ")[1]?.split(" | ")[0] || p.observacoes || "Pagamento"}
                  </span>
                  <Badge variant={p.categoria === 'repasse' ? 'default' : 'secondary'} className="text-[10px]">
                    {p.categoria === 'repasse' ? 'Repasse' : 'Conta Fixa'}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {format(parseISO(p.data_pagamento), "dd/MM/yyyy", { locale: ptBR })} · {p.forma}
                </div>
                {p.observacoes && (
                  <div className="text-[11px] text-slate-500 italic mt-1 truncate max-w-md">
                    {p.observacoes}
                  </div>
                )}
              </div>
              <div className="font-bold text-emerald-600 shrink-0">
                {formatBRL(Number(p.valor))}
              </div>
              {podeGerenciar && (
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEdicao(p)}>
                    <Pencil className="w-4 h-4 text-blue-600" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-50" onClick={() => excluirPagamento(p.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Modal Novo/Editar Pagamento */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar" : "Novo"} Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Beneficiário / Descrição *</Label>
              <Select 
                value={form.beneficiario} 
                onValueChange={(v) => setForm({ ...form, beneficiario: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {profissionais.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                  <SelectItem value="Aluguel">Aluguel</SelectItem>
                  <SelectItem value="Luz">Luz</SelectItem>
                  <SelectItem value="Internet">Internet</SelectItem>
                  <SelectItem value="Telefone">Telefone</SelectItem>
                  <SelectItem value="outro">Outro (digite abaixo)</SelectItem>
                </SelectContent>
              </Select>
              {form.beneficiario === "outro" && (
                <Input
                  placeholder="Digite o beneficiário..."
                  value={form.beneficiario === "outro" ? "" : form.beneficiario}
                  onChange={(e) => setForm({ ...form, beneficiario: e.target.value })}
                  className="mt-1"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Forma de Pagamento</Label>
                <Select value={form.forma} onValueChange={(v) => setForm({ ...form, forma: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                    <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data do Pagamento *</Label>
                <Input
                  type="date"
                  value={form.data_pagamento}
                  onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="repasse">Repasse</SelectItem>
                    <SelectItem value="conta_fixa">Conta Fixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                placeholder="Observações adicionais..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button onClick={salvarPagamento} className="bg-emerald-600 hover:bg-emerald-700">
              <DollarSign className="w-4 h-4 mr-1" /> {editandoId ? "Atualizar" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
