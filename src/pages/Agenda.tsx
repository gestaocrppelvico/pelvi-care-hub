import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { format, addDays, addWeeks, addMonths, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameMonth, differenceInMinutes, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { abrirWhatsapp } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Clock, FileText, RefreshCw, CheckCircle, ChevronLeft, ChevronRight, MessageCircle, ClipboardList, Trash2, Search, Plus } from "lucide-react";

// Interfaces mantidas...
interface Atendimento { id: string; data_inicio: string; data_fim: string | null; status: string; tipo: string; nome_paciente_livre: string | null; telefone_contato: string | null; paciente_id: string | null; paciente: { nome: string; telefone: string | null } | null; profissional: { nome: string; cor_agenda: string } | null; profissional_id: string; google_event_id: string | null; }

export default function Agenda() {
  const { isSecretaria, isAdmin, isFisio, user } = useAuth();
  const podeGerenciar = isAdmin || isSecretaria;
  const [list, setList] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Atendimento | null>(null);
  
  // Novos estados para Planos e Regras
  const [listaPlanos, setListaPlanos] = useState<{id: string, nome: string}[]>([]);
  const [listaPacotesRepasse, setListaPacotesRepasse] = useState<{id: string, nome: string, preco_total: number}[]>([]);
  const [modoCadastroRapido, setModoCadastroRapido] = useState(false);
  const [termoBusca, setTermoBusca] = useState("");
  const [pacienteSelecionado, setPacienteSelecionado] = useState<any | null>(null);

  // Carrega Planos e Regras de Repasse
  useEffect(() => {
    async function carregarConfiguracoes() {
      const [ { data: planos }, { data: pacotes } ] = await Promise.all([
        supabase.from("planos_saude").select("id, nome").eq("ativo", true),
        supabase.from("regras_repasse").select("id, nome, preco_total")
      ]);
      if (planos) setListaPlanos(planos);
      if (pacotes) setListaPacotesRepasse(pacotes);
    }
    carregarConfiguracoes();
  }, []);

  async function salvarCadastroRapido(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const fd = new FormData(e.currentTarget);

    try {
      let finalPacienteId = pacienteSelecionado?.id;
      // ... (Lógica de criação de paciente permanece igual)

      if (fd.get("tipoAtendimento") === "Plano") {
        const nomePlano = fd.get("nomePlano") as string;
        const pacoteRepasseId = fd.get("pacoteRepasseId") as string;
        const numeroGuia = fd.get("numeroGuia") as string;

        // Cria Autorização
        const { data: novaAut } = await supabase.from("autorizacoes").insert({
          paciente_id: finalPacienteId, plano: nomePlano, numero_guia: numeroGuia, sessoes_autorizadas: 10
        }).select().single();

        // Cria Pacote Financeiro usando a Regra selecionada (pacoteRepasseId)
        await supabase.from("paciente_pacotes").insert({
          paciente_id: finalPacienteId,
          autorizacao_id: novaAut.id,
          regras_repasse_id: pacoteRepasseId, // <--- O VÍNCULO DO VALOR CORRETO
          sessoes_totais: 10,
          sessoes_restantes: 10
        });
      }
      
      // ... finalização do check-in
      toast.success("Check-in realizado com sucesso!");
      setModoCadastroRapido(false);
      reload();
    } catch (err: any) { toast.error(err.message); }
  }

  // --- O FORMULÁRIO DO CHECK-IN ATUALIZADO ---
  // Dentro do seu SheetContent de cadastro rápido, substitua o bloco do "Plano" por:
  /*
    <div className="space-y-3 p-3 border rounded-lg bg-blue-50/30">
      <div className="space-y-1.5">
        <Label>Plano de Saúde</Label>
        <Select name="nomePlano" required>
          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent>
            {listaPlanos.map(p => <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Regra de Repasse (Pacote)</Label>
        <Select name="pacoteRepasseId" required>
          <SelectTrigger><SelectValue placeholder="Escolha a regra de valor..." /></SelectTrigger>
          <SelectContent>
            {listaPacotesRepasse.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} - R$ {p.preco_total}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Número da Guia</Label>
        <Input name="numeroGuia" required />
      </div>
    </div>
  */

  // ... (Restante do arquivo permanece como você enviou)
}
