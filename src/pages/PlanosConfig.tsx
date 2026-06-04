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

  async function carregarPlanos() {
    const { data } = await supabase.from("planos_saude").select("*").order("nome");
    if (data) setPlanos(data);
  }

  useEffect(() => { carregarPlanos(); }, []);

  async function salvarPlano() {
    if (editando) {
      await supabase.from("planos_saude").update({ nome: novoNome }).eq("id", editando.id);
      toast.success("Plano atualizado!");
    } else {
      await supabase.from("planos_saude").insert({ nome: novoNome });
      toast.success("Plano cadastrado!");
    }
    setNovoNome("");
    setEditando(null);
    carregarPlanos();
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Gestão de Planos de Saúde</h1>
        <Dialog>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Novo Plano</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editando ? "Editar Plano" : "Adicionar Plano"}</DialogTitle></DialogHeader>
            <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do plano" />
            <Button onClick={salvarPlano}>Salvar</Button>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="divide-y">
        {planos.map((p) => (
          <div key={p.id} className="p-4 flex justify-between items-center">
            <span>{p.nome}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setEditando(p); setNovoNome(p.nome); }}><Pencil className="w-4 h-4" /></Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
