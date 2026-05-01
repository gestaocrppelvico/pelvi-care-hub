import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, FileText, Pencil, Trash2, Info } from "lucide-react";

interface Modelo {
  id: string;
  nome: string;
  tipo: string;
  conteudo: string;
  ativo: boolean;
  created_at: string;
}

const TIPOS = [
  { value: "recibo", label: "Recibo" },
  { value: "atestado", label: "Atestado" },
  { value: "declaracao", label: "Declaração" },
  { value: "encaminhamento", label: "Encaminhamento" },
  { value: "outro", label: "Outro" },
];

const VARIAVEIS = [
  "{{paciente_nome}}", "{{paciente_cpf}}", "{{paciente_telefone}}",
  "{{paciente_plano}}", "{{paciente_carteirinha}}",
  "{{profissional_nome}}", "{{profissional_especialidade}}",
  "{{data_atual}}", "{{data_extenso}}",
  "{{valor}}", "{{valor_extenso}}",
];

export default function Documentos() {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Modelo | null>(null);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("recibo");
  const [conteudo, setConteudo] = useState("");

  async function carregar() {
    const { data } = await supabase
      .from("modelos_documentos")
      .select("*")
      .order("tipo")
      .order("nome");
    setModelos((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  function abrirNovo() {
    setEditando(null);
    setNome("");
    setTipo("recibo");
    setConteudo("");
    setOpen(true);
  }

  function abrirEditar(m: Modelo) {
    setEditando(m);
    setNome(m.nome);
    setTipo(m.tipo);
    setConteudo(m.conteudo);
    setOpen(true);
  }

  async function salvar() {
    if (!nome.trim() || !conteudo.trim()) {
      toast.error("Preencha nome e conteúdo");
      return;
    }
    if (editando) {
      const { error } = await supabase
        .from("modelos_documentos")
        .update({ nome, tipo, conteudo })
        .eq("id", editando.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Modelo atualizado");
    } else {
      const { error } = await supabase
        .from("modelos_documentos")
        .insert({ nome, tipo, conteudo });
      if (error) { toast.error(error.message); return; }
      toast.success("Modelo criado");
    }
    setOpen(false);
    carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este modelo?")) return;
    const { error } = await supabase.from("modelos_documentos").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Modelo excluído");
    carregar();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Modelos de Documentos</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={abrirNovo}><Plus className="w-4 h-4 mr-1" /> Novo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editando ? "Editar modelo" : "Novo modelo"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-sm font-medium">Nome</label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Recibo padrão" />
              </div>
              <div>
                <label className="text-sm font-medium">Tipo</label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Conteúdo</label>
                <Textarea
                  value={conteudo}
                  onChange={(e) => setConteudo(e.target.value)}
                  rows={12}
                  placeholder="Use variáveis como {{paciente_nome}}, {{data_atual}}, etc."
                  className="font-mono text-xs"
                />
              </div>
              <div className="bg-muted rounded-lg p-3">
                <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
                  <Info className="w-3 h-3" /> Variáveis disponíveis
                </div>
                <div className="flex flex-wrap gap-1">
                  {VARIAVEIS.map((v) => (
                    <Badge
                      key={v}
                      variant="outline"
                      className="text-[10px] cursor-pointer hover:bg-accent"
                      onClick={() => setConteudo((c) => c + " " + v)}
                    >
                      {v}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button className="w-full" onClick={salvar}>Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-8">Carregando...</p>
      ) : modelos.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum modelo cadastrado.</p>
          <Button variant="outline" className="mt-3" onClick={abrirNovo}>Criar primeiro modelo</Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {modelos.map((m) => (
            <Card key={m.id} className="p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{m.nome}</span>
                  <Badge variant="secondary" className="capitalize text-[10px]">{m.tipo}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.conteudo}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => abrirEditar(m)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => excluir(m.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
