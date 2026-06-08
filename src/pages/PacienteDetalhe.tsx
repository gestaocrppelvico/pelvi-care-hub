import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Phone, Calendar, Pencil, ShoppingBag } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      const { data: pr } = await supabase.from("prontuarios").select("*, atendimento:atendimentos(data_inicio, profissional:profissionais(nome))").eq("paciente_id", id).order("created_at", { ascending: false });
      setPront(pr || []);
      
      const [{ data: s }, { data: pks }] = await Promise.all([
        supabase.from("servicos").select("id, nome, preco").eq("ativo", true),
        supabase.from("pacotes").select("id, nome, numero_sessoes, preco_total").eq("ativo", true)
      ]);
      setListaServicos(s || []);
      setListaPacotes(pks || []);
    } catch (e) { toast.error("Erro ao carregar"); } finally { setLoading(false); }
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

  if (loading) return <div className="p-8 text-center">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/pacientes")}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-xl font-bold">{pac?.nome}</h1>
            <div className="text-xs text-muted-foreground flex gap-3">{pac?.telefone}</div>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`/pacientes/${id}/editar`}><Pencil className="w-4 h-4 mr-2" /> Editar</Link>
        </Button>
      </div>

      <Tabs defaultValue="historico">
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="prontuario">Prontuário</TabsTrigger>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="autorizacoes">Autorizações</TabsTrigger>
        </TabsList>

        <TabsContent value="servicos">
           <Card className="p-4 space-y-4">
            <h3 className="font-semibold">Lançar Novo Item</h3>
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
                  {itemTipo === "servico" ? listaServicos.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>) : listaPacotes.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" value={precoFinal} onChange={(e) => setPrecoFinal(e.target.value)} placeholder="Valor R$" />
              <Button type="submit" className="w-full">Confirmar Lançamento</Button>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="financeiro"><PacienteFinanceiro /></TabsContent>
        <TabsContent value="autorizacoes"><PacienteAutorizacoes /></TabsContent>
      </Tabs>
    </div>
  );
}
