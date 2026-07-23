import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Plano {
  id: string;
  nome: string;
  ativo: boolean;
}

export default function PlanosConfig() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [novoNome, setNovoNome] = useState("");
  const [editando, setEditando] = useState<Plano | null>(null);
  const [open, setOpen] = useState(false); // 🔥 Controle do Dialog

  async function carregarPlanos() {
    const { data, error } = await supabase
      .from("planos_saude")
      .select("*")
      .order("nome");
    
    if (error) {
      toast.error("Erro ao carregar planos: " + error.message);
    } else {
      setPlanos(data || []);
    }
  }

  useEffect(() => { carregarPlanos(); }, []);

  async function salvarPlano() {
    if (!novoNome.trim()) {
      toast.error("Informe o nome do plano");
      return;
    }

    try {
      if (editando) {
        const { error } = await supabase
          .from("planos_saude")
          .update({ nome: novoNome.trim() })
          .eq("id", editando.id);
        if (error) throw error;
        toast.success("Plano atualizado!");
      } else {
        const { error } = await supabase
          .from("planos_saude")
          .insert({ nome: novoNome.trim() });
        if (error) throw error;
        toast.success("Plano cadastrado!");
      }
      
      setNovoNome("");
      setEditando(null);
      setOpen(false); // 🔥 Fecha o Dialog
      await carregarPlanos(); // 🔥 Aguarda o recarregamento
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    }
  }

  async function excluirPlano(id: string) {
    if (!confirm("Deseja realmente excluir este plano?")) return;
    
    try {
      const { error } = await supabase
        .from("planos_saude")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Plano excluído!");
      await carregarPlanos();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Gestão de Planos de Saúde</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditando(null); setNovoNome(""); }}>
              <Plus className="w-4 h-4 mr-2" /> Novo Plano
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editando ? "Editar Plano" : "Adicionar Plano"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex: Unimed, Bradesco, etc."
              />
              <Button onClick={salvarPlano} className="w-full">
                {editando ? "Atualizar" : "Cadastrar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="divide-y">
        {planos.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            Nenhum plano cadastrado.
          </div>
        ) : (
          planos.map((p) => (
            <div key={p.id} className="p-4 flex justify-between items-center">
              <span className="font-medium">{p.nome}</span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditando(p);
                    setNovoNome(p.nome);
                    setOpen(true);
                  }}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => excluirPlano(p.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
