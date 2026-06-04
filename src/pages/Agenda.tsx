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

// (As interfaces e funções auxiliares permanecem as mesmas do seu original)
// ... (Preserve o restante das funções auxiliares que você já tem no arquivo)

export default function Agenda() {
  const { isSecretaria, isAdmin, isFisio, user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [modoCadastroRapido, setModoCadastroRapido] = useState(false);
  
  // Estados para Planos e Regras
  const [listaPlanos, setListaPlanos] = useState<{id: string, nome: string}[]>([]);
  const [listaPacotesRepasse, setListaPacotesRepasse] = useState<{id: string, nome: string, preco_total: number}[]>([]);
  const [tipoAtendimentoRascunho, setTipoAtendimentoRascunho] = useState<"Plano" | "Particular">("Particular");

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
      // (Mantenha sua lógica de busca/criação de paciente aqui)
      let finalPacienteId = "seu-paciente-id"; 

      if (fd.get("tipoAtendimento") === "Plano") {
        const nomePlano = fd.get("nomePlano") as string;
        const pacoteRepasseId = fd.get("pacoteRepasseId") as string;
        const numeroGuia = fd.get("numeroGuia") as string;

        const { data: novaAut } = await supabase.from("autorizacoes").insert({
          paciente_id: finalPacienteId, plano: nomePlano, numero_guia: numeroGuia, sessoes_autorizadas: 10
        }).select().single();

        await supabase.from("paciente_pacotes").insert({
          paciente_id: finalPacienteId,
          autorizacao_id: novaAut.id,
          regras_repasse_id: pacoteRepasseId, 
          sessoes_totais: 10,
          sessoes_restantes: 10
        });
      }
      toast.success("Check-in concluído!");
      setModoCadastroRapido(false);
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-3">
        {/* ... (Seu cabeçalho de Agenda e visualização de calendário) ... */}
        
        {/* FORMULÁRIO DE CHECK-IN ATUALIZADO */}
        {selected && modoCadastroRapido && (
          <form onSubmit={salvarCadastroRapido} className="space-y-4 mt-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => setTipoAtendimentoRascunho("Particular")}>Particular</button>
              <button type="button" onClick={() => setTipoAtendimentoRascunho("Plano")}>Plano de Saúde</button>
            </div>

            {tipoAtendimentoRascunho === "Plano" && (
              <div className="space-y-3 p-3 border rounded-lg bg-blue-50/30">
                <div className="space-y-1.5">
                  <Label>Plano de Saúde</Label>
                  <Select name="nomePlano" required>
                    <SelectTrigger><SelectValue placeholder="Selecione o plano..." /></SelectTrigger>
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
            )}
            <Button type="submit">Confirmar Check-in</Button>
          </form>
        )}
    </div>
  );
}
