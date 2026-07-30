import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
}

export default function Pagamentos() {
  const navigate = useNavigate();
  const { isAdmin, isSecretaria } = useAuth();
  const podeGerenciar = isAdmin || isSecretaria;

  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroMes, setFiltroMes] = useState(format(new Date(), "yyyy-MM"));
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState({
    beneficiario: "",
    valor: "",
    forma: "pix",
    data_pagamento: format(new Date(), "yyyy-MM-dd"),
    observacoes: ""
  });

  const [profissionais, setProfissionais] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    supabase
      .from("profissionais")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => setProfissionais(data || []));
  }, []);

  async function carregarPagamentos() {
    setLoading(true);
    try {
      const start = startOfMonth(parseISO(filtroMes + "-01"));
      const end = endOfMonth(start);

      const { data, error } = await supabase
        .from("pagamentos")
        .select("*")
        .gte("data_pagamento", start.toISOString())
        .lte("data_pagamento", end.toISOString())
        .order("data_pagamento", { ascending: false });

      if (error) throw error;
      setPagamentos(data || []);
    } catch (err: any) {
      toast.error("Erro ao carregar pagamentos: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarPagamentos();
  }, [filtroMes]);

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
      observacoes: `${form.beneficiario}${form.observacoes ? " | " + form.observacoes : ""}`
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
        observacoes: ""
      });
      carregarPagamentos();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  }

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

  function abrirEdicao(pag: Pagamento) {
    setEditandoId(pag.id);
    setForm({
      beneficiario: pag.observacoes?.split(" | ")[0] || "",
      valor: String(pag.valor),
      forma: pag.forma,
      data_pagamento: pag.data_pagamento,
      observacoes: pag.observacoes?.split(" | ")[1] || ""
    });
    setModalAberto(true);
  }

  const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const totalPago = pagamentos.reduce((acc, p) => acc + Number(p.valor), 0);

  return (
    <div className="space-y-4 pb-20 p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/financeiro")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Wallet className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Pagamentos</h1>
      </div>

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

      <Card className="p-3">
        <div className="text-xs text-muted-foreground">Total Pago no Mês</div>
        <div className="font-bold text-lg">{formatBRL(totalPago)}</div>
      </Card>

      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Carregando...</div>
        ) : pagamentos.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nenhum pagamento registrado neste período.
          </Card>
        ) : (
          pagamentos.map((p) => (
            <Card key={p.id} className="p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
              <Receipt className="w-5 h-5 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800">
                  {p.observacoes?.split(" | ")[0] || "Pagamento"}
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

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar" : "Novo"} Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Beneficiário / Descrição *</Label>
              <Input
                placeholder="Ex: Bruna, Aluguel, Luz..."
                value={form.beneficiario}
                onChange={(e) => setForm({ ...form, beneficiario: e.target.value })}
              />
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

            <div className="space-y-1.5">
              <Label>Data do Pagamento *</Label>
              <Input
                type="date"
                value={form.data_pagamento}
                onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })}
              />
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
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button onClick={salvarPagamento} className="bg-emerald-600 hover:bg-emerald-700">
              <DollarSign className="w-4 h-4 mr-1" /> {editandoId ? "Atualizar" : "Registrar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
