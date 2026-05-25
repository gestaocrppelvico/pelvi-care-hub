import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Trash2, Pencil, Package, Box } from "lucide-react";
import { toast } from "sonner";

interface Servico {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  duracao_minutos: number;
  plano: string | null;
  ativo: boolean;
}

interface Pacote {
  id: string;
  nome: string;
  descricao: string | null;
  servico_id: string | null;
  numero_sessoes: number;
  preco_total: number;
  validade_dias: number | null;
  ativo: boolean;
}

const emptyServ: Partial<Servico> = { nome: "", descricao: "", preco: 0, duracao_minutos: 40, plano: "", ativo: true };
const emptyPac: Partial<Pacote> = { nome: "", descricao: "", servico_id: null, numero_sessoes: 5, preco_total: 0, validade_dias: 90, ativo: true };

export default function FinanceiroServicos() {
  const navigate = useNavigate();
  const { isAdmin, isSecretaria } = useAuth();
  const podeGerenciar = isAdmin || isSecretaria;

  const [servicos, setServicos] = useState<Servico[]>([]);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [editServ, setEditServ] = useState<Partial<Servico> | null>(null);
  const [editPac, setEditPac] = useState<Partial<Pacote> | null>(null);

  async function carregar() {
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from("servicos").select("*").order("nome"),
      supabase.from("pacotes").select("*").order("nome"),
    ]);
    setServicos((s as any) ?? []);
    setPacotes((p as any) ?? []);
  }
  useEffect(() => { carregar(); }, []);

  async function salvarServico() {
    if (!editServ?.nome?.trim()) { toast.error("Nome obrigatório"); return; }
    const payload: any = {
      nome: editServ.nome,
      descricao: editServ.descricao || null,
      preco: Number(editServ.preco) || 0,
      duracao_minutos: Number(editServ.duracao_minutos) || 40,
      plano: editServ.plano || null,
      ativo: editServ.ativo ?? true,
    };
    const { error } = editServ.id
      ? await supabase.from("servicos").update(payload).eq("id", editServ.id)
      : await supabase.from("servicos").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Serviço salvo");
    setEditServ(null);
    carregar();
  }

  async function salvarPacote() {
    if (!editPac?.nome?.trim()) { toast.error("Nome obrigatório"); return; }
    if (!editPac.numero_sessoes || editPac.numero_sessoes < 2) { toast.error("Pacote precisa ter ao menos 2 sessões"); return; }
    const payload: any = {
      nome: editPac.nome,
      descricao: editPac.descricao || null,
      servico_id: editPac.servico_id || null,
      numero_sessoes: Number(editPac.numero_sessoes),
      preco_total: Number(editPac.preco_total) || 0,
      validade_dias: editPac.validade_dias ? Number(editPac.validade_dias) : null,
      ativo: editPac.ativo ?? true,
    };
    const { error } = editPac.id
      ? await supabase.from("pacotes").update(payload).eq("id", editPac.id)
      : await supabase.from("pacotes").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Pacote salvo");
    setEditPac(null);
    carregar();
  }

  async function excluirServico(id: string) {
    if (!confirm("Excluir este serviço?")) return;
    const { error } = await supabase.from("servicos").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído"); carregar();
  }
  async function excluirPacote(id: string) {
    if (!confirm("Excluir este pacote?")) return;
    const { error } = await supabase.from("pacotes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído"); carregar();
  }

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => navigate("/financeiro")}><ArrowLeft className="w-5 h-5" /></Button>
        <Package className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold">Serviços e Pacotes</h1>
      </div>

      <Tabs defaultValue="servicos">
        <TabsList className="w-full">
          <TabsTrigger value="servicos" className="flex-1">Serviços ({servicos.length})</TabsTrigger>
          <TabsTrigger value="pacotes" className="flex-1">Pacotes ({pacotes.length})</TabsTrigger>
        </TabsList>

        {/* SERVIÇOS */}
        <TabsContent value="servicos" className="space-y-2 mt-3">
          {podeGerenciar && !editServ && (
            <Button onClick={() => setEditServ({ ...emptyServ })} className="w-full">
              <Plus className="w-4 h-4" /> Novo serviço
            </Button>
          )}

          {editServ && (
            <Card className="p-4 space-y-3">
              <h3 className="font-semibold">{editServ.id ? "Editar" : "Novo"} serviço</h3>
              <div><Label>Nome</Label><Input value={editServ.nome ?? ""} onChange={(e) => setEditServ({ ...editServ, nome: e.target.value })} /></div>
              <div><Label>Descrição</Label><Textarea value={editServ.descricao ?? ""} onChange={(e) => setEditServ({ ...editServ, descricao: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Preço (R$)</Label><Input type="number" step="0.01" min="0" value={editServ.preco ?? 0} onFocus={(e) => e.target.select()} onChange={(e) => setEditServ({ ...editServ, preco: Number(e.target.value) || 0 })} /></div>
                <div><Label>Duração (min)</Label><Input type="number" min="1" value={editServ.duracao_minutos ?? 40} onFocus={(e) => e.target.select()} onChange={(e) => setEditServ({ ...editServ, duracao_minutos: Number(e.target.value) || 40 })} /></div>
              </div>
              <div><Label>Plano (opcional)</Label><Input value={editServ.plano ?? ""} onChange={(e) => setEditServ({ ...editServ, plano: e.target.value })} placeholder="Particular, Unimed, Bradesco..." /></div>
              <div className="flex items-center gap-2"><Switch checked={editServ.ativo ?? true} onCheckedChange={(v) => setEditServ({ ...editServ, ativo: v })} /><Label>Ativo</Label></div>
              <div className="flex gap-2">
                <Button onClick={salvarServico} className="flex-1">Salvar</Button>
                <Button variant="outline" onClick={() => setEditServ(null)}>Cancelar</Button>
              </div>
            </Card>
          )}

          {servicos.map((s) => (
            <Card key={s.id} className="p-3">
              <div className="flex items-start gap-2">
                <Box className="w-5 h-5 text-primary mt-1 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{s.nome} {!s.ativo && <span className="text-xs text-muted-foreground">(inativo)</span>}</div>
                  <div className="text-sm text-muted-foreground">{fmt(Number(s.preco))} · {s.duracao_minutos}min{s.plano ? ` · ${s.plano}` : ""}</div>
                  {s.descricao && <div className="text-xs text-muted-foreground mt-1">{s.descricao}</div>}
                </div>
                {podeGerenciar && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => setEditServ(s)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => excluirServico(s.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </TabsContent>

        {/* PACOTES */}
        <TabsContent value="pacotes" className="space-y-2 mt-3">
          {podeGerenciar && !editPac && (
            <Button onClick={() => setEditPac({ ...emptyPac })} className="w-full">
              <Plus className="w-4 h-4" /> Novo pacote
            </Button>
          )}

          {editPac && (
            <Card className="p-4 space-y-3">
              <h3 className="font-semibold">{editPac.id ? "Editar" : "Novo"} pacote</h3>
              <div><Label>Nome</Label><Input value={editPac.nome ?? ""} onChange={(e) => setEditPac({ ...editPac, nome: e.target.value })} /></div>
              <div><Label>Descrição</Label><Textarea value={editPac.descricao ?? ""} onChange={(e) => setEditPac({ ...editPac, descricao: e.target.value })} /></div>
              <div>
                <Label>Serviço base (opcional)</Label>
                <Select value={editPac.servico_id ?? "none"} onValueChange={(v) => setEditPac({ ...editPac, servico_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— nenhum —</SelectItem>
                    {servicos.filter((s) => s.ativo).map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Nº de sessões</Label><Input type="number" min={2} value={editPac.numero_sessoes ?? 5} onFocus={(e) => e.target.select()} onChange={(e) => setEditPac({ ...editPac, numero_sessoes: Number(e.target.value) || 2 })} /></div>
                <div><Label>Preço total (R$)</Label><Input type="number" step="0.01" min="0" value={editPac.preco_total ?? 0} onFocus={(e) => e.target.select()} onChange={(e) => setEditPac({ ...editPac, preco_total: Number(e.target.value) || 0 })} /></div>
              </div>
              <div><Label>Validade (dias, opcional)</Label><Input type="number" value={editPac.validade_dias ?? ""} onChange={(e) => setEditPac({ ...editPac, validade_dias: e.target.value ? Number(e.target.value) : null })} /></div>
              <div className="flex items-center gap-2"><Switch checked={editPac.ativo ?? true} onCheckedChange={(v) => setEditPac({ ...editPac, ativo: v })} /><Label>Ativo</Label></div>
              <div className="flex gap-2">
                <Button onClick={salvarPacote} className="flex-1">Salvar</Button>
                <Button variant="outline" onClick={() => setEditPac(null)}>Cancelar</Button>
              </div>
            </Card>
          )}

          {pacotes.map((p) => (
            <Card key={p.id} className="p-3">
              <div className="flex items-start gap-2">
                <Package className="w-5 h-5 text-primary mt-1 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{p.nome} {!p.ativo && <span className="text-xs text-muted-foreground">(inativo)</span>}</div>
                  <div className="text-sm text-muted-foreground">
                    {p.numero_sessoes} sessões · {fmt(Number(p.preco_total))}
                    {" "} · {fmt(Number(p.preco_total) / p.numero_sessoes)}/sessão
                  </div>
                  {p.validade_dias && <div className="text-xs text-muted-foreground">Validade: {p.validade_dias} dias</div>}
                </div>
                {podeGerenciar && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => setEditPac(p)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => excluirPacote(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
