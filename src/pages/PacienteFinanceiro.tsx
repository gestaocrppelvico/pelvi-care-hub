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
  const [pacotesCat, setPacotesCat] = useState<any[]>([]);
  const [servicosCat, setServicosCat] = useState<any[]>([]);

  // forms
  const [novoPacote, setNovoPacote] = useState<any>({ pacote_id: "", preco_pago: 0 });
  const [novoServ, setNovoServ] = useState<any>({ servico_id: "", preco_pago: 0 });
  const [novoPag, setNovoPag] = useState<any>({ valor: 0, forma: "pix", paciente_pacote_id: "", paciente_servico_id: "" });

  async function carregar() {
    if (!pacienteId) return;
    const [pac, pp, ps, pg, pcat, scat] = await Promise.all([
      supabase.from("pacientes").select("id, nome").eq("id", pacienteId).single(),
      supabase.from("paciente_pacotes").select("*, pacote:pacotes(nome, numero_sessoes)").eq("paciente_id", pacienteId).order("created_at", { ascending: false }),
      supabase.from("paciente_servicos").select("*, servico:servicos(nome, preco)").eq("paciente_id", pacienteId).order("created_at", { ascending: false }),
      supabase.from("pagamentos").select("*").eq("paciente_id", pacienteId).order("data_pagamento", { ascending: false }),
      supabase.from("pacotes").select("*").eq("ativo", true).order("nome"),
      supabase.from("servicos").select("*").eq("ativo", true).order("nome"),
    ]);
    setPaciente(pac.data);
    setPacientePacotes(pp.data ?? []);
    setPacienteServicos(ps.data ?? []);
    setPagamentos(pg.data ?? []);
    setPacotesCat(pcat.data ?? []);
    setServicosCat(scat.data ?? []);
  }
  useEffect(() => { carregar(); }, [pacienteId]);

  async function comprarPacote() {
    if (!novoPacote.pacote_id) { toast.error("Selecione o pacote"); return; }
    const pac = pacotesCat.find((p) => p.id === novoPacote.pacote_id);
    if (!pac) return;
    const validade = pac.validade_dias
      ? new Date(Date.now() + pac.validade_dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : null;
    const { error } = await supabase.from("paciente_pacotes").insert({
      paciente_id: pacienteId,
      pacote_id: pac.id,
      sessoes_totais: pac.numero_sessoes,
      sessoes_restantes: pac.numero_sessoes,
      preco_pago: Number(novoPacote.preco_pago) || Number(pac.preco_total),
      data_validade: validade,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Pacote adicionado");
    setNovoPacote({ pacote_id: "", preco_pago: 0 });
    carregar();
  }

  async function comprarServico() {
    if (!novoServ.servico_id) { toast.error("Selecione o serviço"); return; }
    const s = servicosCat.find((x) => x.id === novoServ.servico_id);
    if (!s) return;
    const { error } = await supabase.from("paciente_servicos").insert({
      paciente_id: pacienteId,
      servico_id: s.id,
      preco_pago: Number(novoServ.preco_pago) || Number(s.preco),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Serviço adicionado");
    setNovoServ({ servico_id: "", preco_pago: 0 });
    carregar();
  }

  async function registrarPagamento() {
    if (!novoPag.valor || novoPag.valor <= 0) { toast.error("Informe o valor"); return; }
    const payload: any = {
      paciente_id: pacienteId,
      valor: Number(novoPag.valor),
      forma: novoPag.forma,
      paciente_pacote_id: novoPag.paciente_pacote_id || null,
      paciente_servico_id: novoPag.paciente_servico_id || null,
      observacoes: novoPag.observacoes || null,
    };
    const { error } = await supabase.from("pagamentos").insert(payload);
    if (error) { toast.error(error.message); return; }

    // Marcar como pago
    if (novoPag.paciente_pacote_id) {
      await supabase.from("paciente_pacotes").update({ status_pagamento: "pago" }).eq("id", novoPag.paciente_pacote_id);
    }
    if (novoPag.paciente_servico_id) {
      await supabase.from("paciente_servicos").update({ status_pagamento: "pago" }).eq("id", novoPag.paciente_servico_id);
    }

    toast.success("Pagamento registrado");
    setNovoPag({ valor: 0, forma: "pix", paciente_pacote_id: "", paciente_servico_id: "" });
    carregar();
  }

  const totalPago = pagamentos.reduce((s, p) => s + Number(p.valor), 0);
  const totalPendente =
    pacientePacotes.filter((p) => p.status_pagamento !== "pago").reduce((s, p) => s + Number(p.preco_pago), 0) +
    pacienteServicos.filter((p) => p.status_pagamento !== "pago").reduce((s, p) => s + Number(p.preco_pago), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => navigate(`/pacientes/${pacienteId}`)}><ArrowLeft className="w-5 h-5" /></Button>
        <Wallet className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold">Financeiro</h1>
      </div>

      {paciente && <p className="text-sm text-muted-foreground">{paciente.nome}</p>}

      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Pago</div><div className="text-lg font-bold text-emerald-600">{fmt(totalPago)}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Pendente</div><div className="text-lg font-bold text-amber-600">{fmt(totalPendente)}</div></Card>
      </div>

      <Tabs defaultValue="pacotes">
        <TabsList className="w-full">
          <TabsTrigger value="pacotes" className="flex-1">Pacotes</TabsTrigger>
          <TabsTrigger value="servicos" className="flex-1">Serviços</TabsTrigger>
          <TabsTrigger value="pagamentos" className="flex-1">Pagamentos</TabsTrigger>
        </TabsList>

        {/* PACOTES */}
        <TabsContent value="pacotes" className="space-y-2 mt-3">
          {podeGerenciar && (
            <Card className="p-3 space-y-2">
              <div className="font-semibold text-sm">Adicionar pacote</div>
              <Select value={novoPacote.pacote_id} onValueChange={(v) => {
                const p = pacotesCat.find((x) => x.id === v);
                setNovoPacote({ pacote_id: v, preco_pago: p?.preco_total ?? 0 });
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione o pacote" /></SelectTrigger>
                <SelectContent>{pacotesCat.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome} — {p.numero_sessoes}x · {fmt(p.preco_total)}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input type="number" step="0.01" value={novoPacote.preco_pago} onChange={(e) => setNovoPacote({ ...novoPacote, preco_pago: e.target.value })} placeholder="Preço" />
                <Button onClick={comprarPacote}><Plus className="w-4 h-4" /></Button>
              </div>
            </Card>
          )}

          {pacientePacotes.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum pacote.</Card>}
          {pacientePacotes.map((pp) => (
            <Card key={pp.id} className="p-3">
              <div className="flex items-start gap-2">
                <Package className="w-5 h-5 text-primary mt-1 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{pp.pacote?.nome}</div>
                  <div className="text-sm text-muted-foreground">
                    {pp.sessoes_restantes}/{pp.sessoes_totais} sessões · {fmt(Number(pp.preco_pago))}
                  </div>
                  {pp.data_validade && <div className="text-xs text-muted-foreground">Válido até {new Date(pp.data_validade).toLocaleDateString("pt-BR")}</div>}
                </div>
                <Badge variant={pp.status_pagamento === "pago" ? "default" : "secondary"} className="shrink-0">
                  {pp.status_pagamento}
                </Badge>
              </div>
            </Card>
          ))}
        </TabsContent>

        {/* SERVIÇOS */}
        <TabsContent value="servicos" className="space-y-2 mt-3">
          {podeGerenciar && (
            <Card className="p-3 space-y-2">
              <div className="font-semibold text-sm">Adicionar serviço avulso</div>
              <Select value={novoServ.servico_id} onValueChange={(v) => {
                const s = servicosCat.find((x) => x.id === v);
                setNovoServ({ servico_id: v, preco_pago: s?.preco ?? 0 });
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger>
                <SelectContent>{servicosCat.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome} — {fmt(s.preco)}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input type="number" step="0.01" value={novoServ.preco_pago} onChange={(e) => setNovoServ({ ...novoServ, preco_pago: e.target.value })} placeholder="Preço" />
                <Button onClick={comprarServico}><Plus className="w-4 h-4" /></Button>
              </div>
            </Card>
          )}

          {pacienteServicos.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum serviço.</Card>}
          {pacienteServicos.map((ps) => (
            <Card key={ps.id} className="p-3 flex items-center gap-2">
              <Box className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{ps.servico?.nome}</div>
                <div className="text-sm text-muted-foreground">{fmt(Number(ps.preco_pago))} · {ps.utilizado ? "utilizado" : "não utilizado"}</div>
              </div>
              <Badge variant={ps.status_pagamento === "pago" ? "default" : "secondary"} className="shrink-0">{ps.status_pagamento}</Badge>
            </Card>
          ))}
        </TabsContent>

        {/* PAGAMENTOS */}
        <TabsContent value="pagamentos" className="space-y-2 mt-3">
          {podeGerenciar && (
            <Card className="p-3 space-y-2">
              <div className="font-semibold text-sm">Registrar pagamento</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Valor</Label>
                  <Input type="number" step="0.01" value={novoPag.valor} onChange={(e) => setNovoPag({ ...novoPag, valor: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Forma</Label>
                  <Select value={novoPag.forma} onValueChange={(v) => setNovoPag({ ...novoPag, forma: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">Pix</SelectItem>
                      <SelectItem value="cartao_credito">Cartão crédito</SelectItem>
                      <SelectItem value="cartao_debito">Cartão débito</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="plano_saude">Plano de saúde</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Vincular a (opcional)</Label>
                <Select value={novoPag.paciente_pacote_id || novoPag.paciente_servico_id || "none"} onValueChange={(v) => {
                  if (v === "none") return setNovoPag({ ...novoPag, paciente_pacote_id: "", paciente_servico_id: "" });
                  const isPac = pacientePacotes.some((p) => p.id === v);
                  setNovoPag({
                    ...novoPag,
                    paciente_pacote_id: isPac ? v : "",
                    paciente_servico_id: isPac ? "" : v,
                  });
                }}>
                  <SelectTrigger><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— sem vínculo —</SelectItem>
                    {pacientePacotes.map((p) => <SelectItem key={p.id} value={p.id}>Pacote: {p.pacote?.nome}</SelectItem>)}
                    {pacienteServicos.map((p) => <SelectItem key={p.id} value={p.id}>Serviço: {p.servico?.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Textarea placeholder="Observações" value={novoPag.observacoes ?? ""} onChange={(e) => setNovoPag({ ...novoPag, observacoes: e.target.value })} />
              <Button onClick={registrarPagamento} className="w-full"><Plus className="w-4 h-4" /> Registrar</Button>
            </Card>
          )}

          {pagamentos.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum pagamento.</Card>}
          {pagamentos.map((p) => (
            <Card key={p.id} className="p-3 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{fmt(Number(p.valor))}</div>
                <div className="text-xs text-muted-foreground">{p.forma} · {new Date(p.data_pagamento).toLocaleDateString("pt-BR")}</div>
                {p.observacoes && <div className="text-xs text-muted-foreground mt-1">{p.observacoes}</div>}
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
