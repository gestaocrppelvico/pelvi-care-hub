import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Phone, Calendar, Activity, Wallet, FileOutput, ShieldCheck, Pencil, Plus, ShoppingBag } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Importações dos sub-componentes das abas existentes
import PacienteFinanceiro from "./PacienteFinanceiro";
import PacienteAutorizacoes from "./PacienteAutorizacoes";

interface Paciente {
  id: string;
  nome: string;
  telefone: string | null;
  data_nascimento: string | null;
  plano_saude: string | null;
  numero_carteirinha: string | null;
  observacoes: string | null;
}

interface ProntuarioItem {
  id: string;
  atendimento_id: string;
  escala_dor: number | null;
  queixa_principal: string | null;
  conduta: string | null;
  evolucao_livre: string | null;
  created_at: string;
  atendimento: { data_inicio: string; profissional: { nome: string } | null } | null;
}

export default function PacienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isSecretaria } = useAuth();
  const podeGerenciar = isAdmin || isSecretaria;

  const [pac, setPac] = useState<Paciente | null>(null);
  const [pront, setPront] = useState<ProntuarioItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados do Novo Lançamento de Serviços/Pacotes
  const [itemTipo, setItemTipo] = useState<"servico" | "pacote">("servico");
  const [listaServicos, setListaServicos] = useState<any[]>([]);
  const [listaPacotes, setListaPacotes] = useState<any[]>([]);
  const [idItemSelecionado, setIdItemSelecionado] = useState<string>("");
  const [qtdSessoes, setQtdSessoes] = useState<number>(1);
  const [precoFinal, setPrecoFinal] = useState<string>("");

  const carregarPacienteEProntuario = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: pacienteData } = await supabase.from("pacientes").select("*").eq("id", id).maybeSingle();
      setPac(pacienteData);

      const { data: prontData } = await supabase
        .from("prontuarios")
        .select("*, atendimento:atendimentos(data_inicio, profissional:profissionais(nome))")
        .eq("paciente_id", id)
        .order("created_at", { descending: false });
      setPront(prontData || []);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar dados do paciente.");
    } finally {
      setLoading(false);
    }
  };

  const carregarCatalogos = async () => {
    const [{ data: sData }, { data: pData }] = await Promise.all([
      supabase.from("servicos").select("id, nome, preco").eq("ativo", true),
      supabase.from("pacotes").select("id, nome, numero_sessoes, preco_total").eq("ativo", true)
    ]);
    setListaServicos(sData || []);
    setListaPacotes(pData || []);
  };

  useEffect(() => {
    carregarPacienteEProntuario();
    carregarCatalogos();
  }, [id]);

  const handleItemChange = (idSelecionado: string) => {
    setIdItemSelecionado(idSelecionado);
    if (itemTipo === "servico") {
      const item = listaServicos.find(s => s.id === idSelecionado);
      if (item) {
        setQtdSessoes(1);
        setPrecoFinal(item.preco.toString());
      }
    } else {
      const item = listaPacotes.find(p => p.id === idSelecionado);
      if (item) {
        setQtdSessoes(item.numero_sessoes);
        setPrecoFinal(item.preco_total.toString());
      }
    }
  };

  const lancarItemNoFinanceiro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !idItemSelecionado) {
      toast.error("Selecione um item do catálogo.");
      return;
    }

    try {
      const valor = parseFloat(precoFinal) || 0;

      if (itemTipo === "pacote") {
        // Lança como contrato de pacote
        const { error } = await supabase.from("paciente_pacotes").insert({
          paciente_id: id,
          pacote_id: idItemSelecionado,
          sessoes_totais: qtdSessoes,
          sessoes_restantes: qtdSessoes,
          preco_pago: valor,
          status_pagamento: "pendente"
        });
        if (error) throw error;
      } else {
        // Lança como serviço avulso histórico
        const { error: errServ } = await supabase.from("paciente_servicos").insert({
          paciente_id: id,
          servico_id: idItemSelecionado
        });
        if (errServ) throw errServ;

        // Cria também uma linha de saldo de 1 sessão em paciente_pacotes para ela poder dar check-in
        const { error: errSaldo } = await supabase.from("paciente_pacotes").insert({
          paciente_id: id,
          servico_id: idItemSelecionado,
          sessoes_totais: 1,
          sessoes_restantes: 1,
          preco_pago: valor,
          status_pagamento: "pendente"
        });
        if (errSaldo) throw errSaldo;
      }

      toast.success("Item lançado na ficha financeira do paciente com sucesso!");
      setIdItemSelecionado("");
      setPrecoFinal("");
      setQtdSessoes(1);
    } catch (err: any) {
      toast.error("Erro ao lançar: " + err.message);
    }
  };

  if (loading) return <div className="p-6 text-center text-sm text-muted-foreground">Carregando dados do paciente...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pacientes")}><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-xl font-bold">{pac?.nome || "Paciente"}</h1>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            {pac?.telefone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {pac.telefone}</span>}
            {pac?.data_nascimento && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(pac.data_nascimento).toLocaleDateString("pt-BR")}</span>}
          </div>
        </div>
      </div>

      <Tabs defaultValue="historico" className="w-full">
        {/* TAB LIST ATUALIZADA COM A NOVA ABA 'SERVIÇOS' */}
        <TabsList className="w-full grid grid-cols-5 bg-muted rounded-lg p-1">
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="prontuario">Prontuário</TabsTrigger>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="autorizacoes">Autorizações</TabsTrigger>
        </TabsList>

        {/* CONTEÚDO DA ABA HISTÓRICO */}
        <TabsContent value="historico" className="space-y-3 mt-3">
          <Card className="p-4 space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground">Informações Cadastrais</h3>
            <div className="text-sm grid grid-cols-2 gap-2 pt-1">
              <div><span className="text-muted-foreground text-xs block">Convênio / Plano</span><strong>{pac?.plano_saude || "Particular"}</strong></div>
              <div><span className="text-muted-foreground text-xs block">Nº Carteirinha</span><strong>{pac?.numero_carteirinha || "—"}</strong></div>
              <div className="col-span-2 pt-1"><span className="text-muted-foreground text-xs block">Observações</span><p className="text-xs bg-slate-50 border rounded p-2 mt-1 text-slate-600">{pac?.observacoes || "Nenhuma observação informada."}</p></div>
            </div>
          </Card>
        </TabsContent>

        {/* CONTEÚDO DA ABA PRONTUÁRIO */}
        <TabsContent value="prontuario" className="space-y-2 mt-3">
          {pront.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma evolução de prontuário registrada.</Card>}
          {pront.map((p) => (
            <Link key={p.id} to={`/atendimentos/${p.atendimento_id}/prontuario`}>
              <Card className="p-4 hover:bg-slate-50/50 transition-colors space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{format(new Date(p.atendimento?.data_inicio || p.created_at), "dd 'de' MMM yyyy", { locale: ptBR })}</span>
                  {p.escala_dor !== null && <Badge variant={p.escala_dor >= 7 ? "destructive" : "secondary"}>Dor {p.escala_dor}/10</Badge>}
                </div>
                {p.queixa_principal && <div className="text-sm font-medium truncate">{p.queixa_principal}</div>}
                <p className="text-xs text-muted-foreground line-clamp-2">{p.conduta || p.evolucao_livre}</p>
                {p.atendimento?.profissional?.nome && <p className="text-[10px] text-muted-foreground">por {p.atendimento.profissional.nome}</p>}
              </Card>
            </Link>
          ))}
        </TabsContent>

        {/* NOVA ABA: SERVIÇOS (Lançador dedicado de contratos particulares) */}
        <TabsContent value="servicos" className="space-y-3 mt-3">
          <Card className="p-4 space-y-4">
            <div className="border-b pb-2 flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-primary" />
              <div>
                <h3 className="font-semibold text-sm">Lançar Novo Serviço ou Pacote</h3>
                <p className="text-xs text-muted-foreground">Venda contratos particulares que alimentarão os saldos de sessões e o caixa.</p>
              </div>
            </div>

            <form onSubmit={lancarItemNoFinanceiro} className="space-y-4">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-md">
                <button type="button" onClick={() => { setItemTipo("servico"); setIdItemSelecionado(""); setPrecoFinal(""); }} className={`flex-1 text-xs py-1.5 rounded-sm font-medium transition-all ${itemTipo === "servico" ? "bg-white shadow-sm text-primary" : "text-muted-foreground"}`}>Serviço Avulso</button>
                <button type="button" onClick={() => { setItemTipo("pacote"); setIdItemSelecionado(""); setPrecoFinal(""); }} className={`flex-1 text-xs py-1.5 rounded-sm font-medium transition-all ${itemTipo === "pacote" ? "bg-white shadow-sm text-primary" : "text-muted-foreground"}`}>Pacote Comercial</button>
              </div>

              <div className="space-y-1.5">
                <Label>Selecionar do Catálogo</Label>
                <Select value={idItemSelecionado} onValueChange={handleItemChange} required>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={`Escolha o ${itemTipo === "servico" ? "serviço" : "pacote"}...`} />
                  </SelectTrigger>
                  <SelectContent>
                    {itemTipo === "servico" 
                      ? listaServicos.map(s => <SelectItem key={s.id} value={s.id}>{s.nome} (R$ {s.preco})</SelectItem>)
                      : listaPacotes.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} ({p.numero_sessoes} sessões)</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sessões Contratadas</Label>
                  <Input type="number" value={qtdSessoes} disabled className="bg-slate-50" />
                </div>
                <div className="space-y-1.5">
                  <Label>Preço do Contrato (R$)</Label>
                  <Input type="number" step="0.01" value={precoFinal} onChange={(e) => setPrecoFinal(e.target.value)} placeholder="0,00" required />
                </div>
              </div>

              {podeGerenciar && (
                <Button type="submit" className="w-full bg-primary text-white mt-2">
                  <Plus className="w-4 h-4 mr-1" /> Lançar na Ficha Financeira
                </Button>
              )}
            </form>
          </Card>
        </TabsContent>

        {/* CONTEÚDO DA ABA FINANCEIRO (REDIRECIONA PARA O SUB-COMPONENTE CORRIGIDO NA FASE 3) */}
        <TabsContent value="financeiro" className="mt-3">
          <PacienteFinanceiro />
        </TabsContent>

        {/* CONTEÚDO DA ABA AUTORIZAÇÕES */}
        <TabsContent value="autorizacoes" className="mt-3">
          <PacienteAutorizacoes />
        </TabsContent>
      </Tabs>
    </div>
  );
}
