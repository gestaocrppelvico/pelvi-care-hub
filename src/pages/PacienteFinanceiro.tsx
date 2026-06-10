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
import { ArrowLeft, Plus, Wallet, Package, Box, Receipt, CalendarCheck } from "lucide-react";
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

      const { data: pacs } = await supabase
        .from("paciente_pacotes")
        .select("*, pacote:pacotes(nome), autorizacao:autorizacoes(plano, numero_guia)")
        .eq("paciente_id", pacienteId)
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

      // Carregar os profissionais para o Modal de Lançamento
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

      toast.success("Pagamento registado com sucesso!");
      setModoNovoPag(false);
      setNovoPag({ valor: "", forma: "dinheiro", data_pagamento: new Date().toISOString().split("T")[0], paciente_pacote_id: "none", observacoes: "" });
      carregarDados();
    } catch (err: any) { toast.error("Erro: " + err.message); }
  };

  // FUNÇÃO MÁGICA DE LANÇAMENTO AVULSO / RETROATIVO
  const realizarLancamentoRetroativo = async () => {
    if (!lancamentoProfissionalId) { toast.error("Selecione a profissional!"); return; }
    if (!lancamentoData || !lancamentoHora) { toast.error("Data e hora são obrigatórios!"); return; }

    const dataCompleta = new Date(`${lancamentoData}T${lancamentoHora}:00`);

    // Descobrir se o paciente tem convênio ou é particular (para a coluna tipo do atendimento)
    const ehConvenio = pacientePacotes.find(p => p.id === lancamentoPacoteId)?.autorizacao !== null;
    const tipoAtend = (ehConvenio && lancamentoPacoteId !== "avulso") ? "Plano" : "Particular";

    const payloadAtendimento: any = {
      paciente_id: pacienteId,
      profissional_id: lancamentoProfissionalId,
      data_inicio: dataCompleta.toISOString(),
      data_fim: new Date(dataCompleta.getTime() + 60 * 60000).toISOString(), // +1 hora
      status: "realizado", // Já nasce realizado para forçar o gatilho financeiro!
      tipo: tipoAtend
    };

    if (lancamentoPacoteId !== "avulso") {
      payloadAtendimento.paciente_pacote_id = lancamentoPacoteId;
    }

    try {
      // O milagre acontece aqui: ao inserir com status realizado e pacote_id, o Supabase dispara o Gatilho!
      const { error } = await supabase.from("atendimentos").insert(payloadAtendimento);
      if (error) throw error;

      toast.success("Lançamento registado! Repasse gerado com sucesso.");
      setModalLancamentoAberto(false);
      carregarDados(); // Recarrega para mostrar a sessão descontada
    } catch (err: any) {
      toast.error("Erro ao lançar: " + err.message);
    }
  };

  if (loading) return <div className="p-6 text-center text-sm text-muted-foreground">A carregar dados financeiros...</div>;

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
        
        {/* NOVO BOTÃO DE LANÇAMENTO AVULSO */}
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

          {pacientePacotes.map((p) => (
            <Card key={p.id} className="p-3 border-l-4 border-l-primary space-y-1">
              <div className="flex items-start justify-between gap-2">
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
                <span>Criado em: {new Date(p.created_at).toLocaleDateString
