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
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Wallet, Package, Box, Receipt } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [modoNovoPag, setModoNovoPag] = useState(false);
  
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
      // 1. Carrega dados do paciente
      const { data: pac } = await supabase.from("pacientes").select("*").eq("id", pacienteId).maybeSingle();
      setPaciente(pac);

      // 2. Carrega pacotes financeiros (Trazendo o join com autorizações para dar nome à guia)
      const { data: pacs } = await supabase
        .from("paciente_pacotes")
        .select("*, pacote:pacotes(nome), autorizacao:autorizacoes(plano, numero_guia)")
        .eq("paciente_id", pacienteId)
        .order("created_at", { ascending: false });
      setPacientePacotes(pacs || []);

      // 3. Carrega serviços avulsos
      const { data: servs } = await supabase
        .from("paciente_servicos")
        .select("*, servico:servicos(nome)")
        .eq("paciente_id", pacienteId)
        .order("created_at", { ascending: false });
      setPacienteServicos(servs || []);

      // 4. Carrega histórico de pagamentos
      const { data: pags } = await supabase
        .from("pagamentos")
        .select("*")
        .eq("paciente_id", pacienteId)
        .order("data_pagamento", { ascending: false });
      setPagamentos(pags || []);

    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao carregar dados financeiros.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [pacienteId]);

  const registrarPagamento = async () => {
    if (!pacienteId || !novoPag.valor) {
      toast.error("Informe o valor do pagamento.");
      return;
    }
    try {
      const payload: any = {
        paciente_id: pacienteId,
        valor: parseFloat(novoPag.valor),
        forma: novoPag.forma,
        data_pagamento: novoPag.data_pagamento,
        observacoes: novoPag.observacoes || null
      };

      if (novoPag.paciente_pacote_id !== "none") {
        payload.paciente_pacote_id = novoPag.paciente_pacote_id;
      }

      const { error } = await supabase.from("pagamentos").insert(payload);
      if (error) throw error;

      toast.success("Pagamento registado com sucesso!");
      setModoNovoPag(false);
      setNovoPag({
        valor: "",
        forma: "dinheiro",
        data_pagamento: new Date().toISOString().split("T")[0],
        paciente_pacote_id: "none",
        observacoes: ""
      });
      carregarDados();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  if (loading) return <div className="p-6 text-center text-sm text-muted-foreground">A carregar dados financeiros...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-xl font-bold">Financeiro do Paciente</h1>
          <p className="text-sm text-muted-foreground">{paciente?.nome || "—"}</p>
        </div>
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

          {/* LISTAGEM DE PACOTES E GUIAS DE PLANO DE SAÚDE */}
          {pacientePacotes.map((p) => (
            <Card key={p.id} className="p-3 border-l-4 border-l-primary space-y-1">
              <div className="flex items-start justify-between gap-2">
                {/* INTERFACE INTELIGENTE: Identifica se é guia de plano ou pacote particular */}
                <div className="font-semibold text-sm text-slate-800">
                  {p.autorizacao 
                    ? `Guia Autorizada: ${p.autorizacao.plano} ${p.autorizacao.numero_guia ? `(Nº ${p.autorizacao.numero_guia})` : ''}`
                    : `Pacote: ${p.pacote?.nome || "Particular Customizado"}`
                  }
                </div>
                <Badge variant={p.sessoes_restantes > 0 ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                  {p.sessoes_restantes} / {p.sessoes_totais} rest.
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground flex justify-between pt-1">
                <span>Criado em: {new Date(p.created_at).toLocaleDateString("pt-BR")}</span>
                <span className="font-medium text-slate-700">
                  {p.autorizacao ? "Faturamento por Plano de Saúde" : `Preço Total: ${fmt(Number(p.preco_pago))}`}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                <div 
                  className="bg-primary h-1.5 rounded-full transition-all" 
                  style={{ width: `${(p.sessoes_restantes / p.sessoes_totais) * 100}%` }}
                />
              </div>
            </Card>
          ))}

          {/* LISTAGEM DE SERVIÇOS AVULSOS */}
          {pacienteServicos.map((s) => (
            <Card key={s.id} className="p-3 border-l-4 border-l-emerald-500 flex justify-between items-center">
              <div>
                <div className="font-semibold text-sm flex items-center gap-1"><Box className="w-3.5 h-3.5 text-emerald-500" /> {s.servico?.nome || "Serviço Avulso"}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Lançado em {new Date(s.created_at).toLocaleDateString("pt-BR")}</div>
              </div>
              <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200">Sessão Única</Badge>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="historico" className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5"><Wallet className="w-4 h-4" /> Recibos de Pagamento</h2>
            {podeGerenciar && (
              <Button size="sm" onClick={() => setModoNovoPag(!modoNovoPag)}>
                <Plus className="w-4 h-4 mr-1" /> Registar
              </Button>
            )}
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
                      {/* Filtra para não permitir vincular pagamentos manuais a guias de convénio */}
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
            <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum histórico de pagamento registado para este paciente.</Card>
          )}

          {pagamentos.map((p) => (
            <Card key={p.id} className="p-3 flex items-center gap-2.5">
              <Receipt className="w-5 h-5 text-emerald-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-800 text-sm">{fmt(Number(p.valor))}</div>
                <div className="text-xs text-muted-foreground capitalize">{p.forma.replace("_", " ")} · {new Date(p.data_pagamento).toLocaleDateString("pt-BR")}</div>
                {p.observacoes && <p className="text-[11px] text-slate-500 bg-slate-50 border rounded p-1 mt-1.5 italic">{p.observacoes}</p>}
              </div>
              <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 text-[10px] py-0">Recebido</Badge>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
