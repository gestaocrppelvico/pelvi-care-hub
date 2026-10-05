import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ExternalLink, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

interface Plano {
  id: string;
  nome: string;
  ativo: boolean;
  link_portal: string | null;
}

export default function PlanosConfig() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [novoNome, setNovoNome] = useState("");
  const [novoLink, setNovoLink] = useState("");
  const [editando, setEditando] = useState<Plano | null>(null);
  const [open, setOpen] = useState(false);

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

    // Validação simples de URL (se preenchido)
    const linkTrimmed = novoLink.trim();
    if (linkTrimmed && !/^https?:\/\//i.test(linkTrimmed)) {
      toast.error("O link deve começar com http:// ou https://");
      return;
    }

    try {
      if (editando) {
        const { error } = await supabase
          .from("planos_saude")
          .update({ 
            nome: novoNome.trim(),
            link_portal: linkTrimmed || null,
          })
          .eq("id", editando.id);
        if (error) throw error;
        toast.success("Plano atualizado!");
      } else {
        const { error } = await supabase
          .from("planos_saude")
          .insert({ 
            nome: novoNome.trim(),
            link_portal: linkTrimmed || null,
          });
        if (error) throw error;
        toast.success("Plano cadastrado!");
      }
      
      setNovoNome("");
      setNovoLink("");
      setEditando(null);
      setOpen(false);
      await carregarPlanos();
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
        <div>
          <h1 className="text-2xl font-bold">Gestão de Planos de Saúde</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Cadastre o link do portal de autorizações de cada convênio.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditando(null); setNovoNome(""); setNovoLink(""); }}>
              <Plus className="w-4 h-4 mr-2" /> Novo Plano
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editando ? "Editar Plano" : "Adicionar Plano"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome do Plano</Label>
                <Input
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Ex: Unimed, Bradesco, SulAmérica..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5" />
                  Link do Portal de Autorizações
                </Label>
                <Input
                  value={novoLink}
                  onChange={(e) => setNovoLink(e.target.value)}
                  placeholder="https://portal.unimed.com.br/..."
                  type="url"
                />
                <p className="text-[11px] text-muted-foreground">
                  Este link será aberto quando a secretária clicar em <strong>"Pedir Guia"</strong> na página de Autorizações.
                </p>
              </div>

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
            <div key={p.id} className="p-4 flex justify-between items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{p.nome}</div>
                {p.link_portal ? (
                  <a 
                    href={p.link_portal} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 mt-0.5 truncate"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span className="truncate">{p.link_portal}</span>
                  </a>
                ) : (
                  <div className="text-[11px] text-muted-foreground mt-0.5 italic">
                    Sem link de portal cadastrado
                  </div>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditando(p);
                    setNovoNome(p.nome);
                    setNovoLink(p.link_portal || "");
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
