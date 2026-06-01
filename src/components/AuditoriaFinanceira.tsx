import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Settings, Save, X, Edit2 } from "lucide-react";

// Tipagem para entendermos o que vem do banco de dados
interface PacoteFinanceiro {
  id: string;
  sessoes_totais: number;
  sessoes_restantes: number;
  preco_pago: number;
  status_pagamento: string;
  created_at: string;
  pacotes?: { nome: string };
  servicos?: { nome: string };
}

interface AuditoriaProps {
  pacienteId: string;
  nomePaciente: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AuditoriaFinanceira({ pacienteId, nomePaciente, isOpen, onClose }: AuditoriaProps) {
  const [historico, setHistorico] = useState<PacoteFinanceiro[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Estado para controlar qual item estamos editando no momento
  const [editandoId, setEditandoId] = useState<string | null>(null);
  
  // Valores temporários do formulário de edição
  const [formEdit, setFormEdit] = useState({
    sessoes_totais: 0,
    sessoes_restantes: 0,
    preco_pago: 0,
    status_pagamento: "pendente"
  });

  // Função para buscar os dados sempre que a aba lateral abrir
  const carregarHistorico = async () => {
    if (!pacienteId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("paciente_pacotes")
      .select("id, sessoes_totais, sessoes_restantes, preco_pago, status_pagamento, created_at, pacotes(nome), servicos(nome)")
      .eq("paciente_id", pacienteId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao buscar histórico: " + error.message);
    } else {
      setHistorico(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      carregarHistorico();
      setEditandoId(null);
    }
  }, [isOpen, pacienteId]);

  // Prepara os campos para edição
  const iniciarEdicao = (item: PacoteFinanceiro) => {
    setFormEdit({
      sessoes_totais: item.sessoes_totais || 0,
      sessoes_restantes: item.sessoes_restantes || 0,
      preco_pago: item.preco_pago || 0,
      status_pagamento: item.status_pagamento || "pendente"
    });
    setEditandoId(item.id);
  };

  // Envia a modificação (UPDATE) para o Supabase
  const salvarEdicao = async () => {
    if (!editandoId) return;
    
    const { error } = await supabase
      .from("paciente_pacotes")
      .update({
        sessoes_totais: formEdit.sessoes_totais,
        sessoes_restantes: formEdit.sessoes_restantes,
        preco_pago: formEdit.preco_pago,
        status_pagamento: formEdit.status_pagamento
      })
      .eq("id", editandoId);

    if (error) {
      toast.error("Erro ao atualizar: " + error.message);
    } else {
      toast.success("Ajuste financeiro salvo com sucesso!");
      setEditandoId(null);
      carregarHistorico(); // Recarrega a lista para mostrar os valores novos
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2 text-primary">
            <Settings className="w-5 h-5" />
            Auditoria Financeira
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            Ajustes manuais para migração e encontro de contas de: <strong>{nomePaciente}</strong>
          </p>
        </SheetHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando histórico...</p>
        ) : historico.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-muted p-4 rounded-md">Nenhum pacote ou serviço faturado para este paciente.</p>
        ) : (
          <div className="space-y-4">
            {historico.map((item) => {
              const nomeItem = item.pacotes?.nome || item.servicos?.nome || "Plano de Saúde / Outro";
              const isEditing = editandoId === item.id;

              return (
                <div key={item.id} className="border rounded-lg p-4 bg-card shadow-sm">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-semibold text-sm">{nomeItem}</h4>
                      <span className="text-[10px] text-muted-foreground">
                        Adquirido em: {new Date(item.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    {!isEditing && (
                      <Button variant="outline" size="sm" onClick={() => iniciarEdicao(item)} className="h-7 text-xs">
                        <Edit2 className="w-3 h-3 mr-1" /> Editar
                      </Button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-3 bg-muted/50 p-3 rounded-md border border-primary/20">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Sessões Totais</Label>
                          <Input 
                            type="number" 
                            className="h-8 text-sm"
                            value={formEdit.sessoes_totais} 
                            onChange={(e) => setFormEdit({ ...formEdit, sessoes_totais: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-primary font-semibold">Sessões Restantes</Label>
                          <Input 
                            type="number" 
                            className="h-8 text-sm border-primary"
                            value={formEdit.sessoes_restantes} 
                            onChange={(e) => setFormEdit({ ...formEdit, sessoes_restantes: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Valor Cobrado (R$)</Label>
                          <Input 
                            type="number" 
                            step="0.01"
                            className="h-8 text-sm"
                            value={formEdit.preco_pago} 
                            onChange={(e) => setFormEdit({ ...formEdit, preco_pago: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Status do Pgto</Label>
                          <select 
                            className="w-full h-8 text-sm bg-background border rounded-md px-2 focus:ring-primary"
                            value={formEdit.status_pagamento}
                            onChange={(e) => setFormEdit({ ...formEdit, status_pagamento: e.target.value })}
                          >
                            <option value="pendente">Pendente</option>
                            <option value="pago">Pago</option>
                            <option value="cancelado">Cancelado</option>
                          </select>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 justify-end pt-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditandoId(null)}>
                          <X className="w-4 h-4 mr-1" /> Cancelar
                        </Button>
                        <Button size="sm" onClick={salvarEdicao}>
                          <Save className="w-4 h-4 mr-1" /> Salvar Ajustes
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mt-2">
                      <div className="bg-muted p-2 rounded-md">
                        <p className="text-[10px] text-muted-foreground uppercase">Totais</p>
                        <p className="font-semibold">{item.sessoes_totais}</p>
                      </div>
                      <div className="bg-primary/10 text-primary p-2 rounded-md">
                        <p className="text-[10px] uppercase">Restantes</p>
                        <p className="font-bold">{item.sessoes_restantes}</p>
                      </div>
                      <div className="bg-muted p-2 rounded-md">
                        <p className="text-[10px] text-muted-foreground uppercase">Valor</p>
                        <p className="font-semibold">R$ {item.preco_pago?.toFixed(2) || "0.00"}</p>
                      </div>
                      <div className="bg-muted p-2 rounded-md">
                        <p className="text-[10px] text-muted-foreground uppercase">Status</p>
                        <p className={`font-semibold capitalize ${item.status_pagamento === 'pago' ? 'text-green-600' : 'text-orange-600'}`}>
                          {item.status_pagamento}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
