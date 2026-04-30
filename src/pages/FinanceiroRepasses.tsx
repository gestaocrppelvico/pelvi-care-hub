import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Settings } from "lucide-react";
import { toast } from "sonner";

interface Repasse {
  id: string;
  profissional_id: string;
  item_tipo: "servico" | "pacote";
  servico_id: string | null;
  pacote_id: string | null;
  tipo_repasse: "percentual" | "fixo";
  valor_repasse: number;
  ativo: boolean;
}

export default function FinanceiroRepasses() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [repasses, setRepasses] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  const [servicos, setServicos] = useState<any[]>([]);
  const [pacotes, setPacotes] = useState<any[]>([]);
  const [novo, setNovo] = useState<Partial<Repasse>>({ item_tipo: "servico", tipo_repasse: "percentual", valor_repasse: 50, ativo: true });

  async function carregar() {
    const [r, prof, s, p] = await Promise.all([
      supabase.from("repasses_servico").select("*, profissional:profissionais(nome, cor_agenda), servico:servicos(nome), pacote:pacotes(nome)").order("created_at", { ascending: false }),
      supabase.from("profissionais").select("id, nome, cor_agenda").eq("ativo", true).order("nome"),
      supabase.from("servicos").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("pacotes").select("id, nome").eq("ativo", true).order("nome"),
    ]);
    setRepasses(r.data ?? []);
    setProfissionais(prof.data ?? []);
    setServicos(s.data ?? []);
    setPacotes(p.data ?? []);
  }
  useEffect(() => { if (isAdmin) carregar(); }, [isAdmin]);

  async function salvar() {
    if (!novo.profissional_id) { toast.error("Selecione o fisio"); return; }
    if (novo.item_tipo === "servico" && !novo.servico_id) { toast.error("Selecione o serviço"); return; }
    if (novo.item_tipo === "pacote" && !novo.pacote_id) { toast.error("Selecione o pacote"); return; }
    const payload: any = {
      profissional_id: novo.profissional_id,
      item_tipo: novo.item_tipo,
      servico_id: novo.item_tipo === "servico" ? novo.servico_id : null,
      pacote_id: novo.item_tipo === "pacote" ? novo.pacote_id : null,
      tipo_repasse: novo.tipo_repasse,
      valor_repasse: Number(novo.valor_repasse) || 0,
      ativo: true,
    };
    const { error } = await supabase.from("repasses_servico").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Repasse cadastrado");
    setNovo({ item_tipo: "servico", tipo_repasse: "percentual", valor_repasse: 50, ativo: true });
    carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir esta regra?")) return;
    const { error } = await supabase.from("repasses_servico").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído"); carregar();
  }

  if (!isAdmin) return <div className="p-6 text-center">Apenas administradores</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => navigate("/financeiro")}><ArrowLeft className="w-5 h-5" /></Button>
        <Settings className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold">Repasses</h1>
      </div>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Nova regra</h3>
        <div>
          <Label>Fisioterapeuta</Label>
          <Select value={novo.profissional_id ?? ""} onValueChange={(v) => setNovo({ ...novo, profissional_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {profissionais.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.cor_agenda }} />{p.nome}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Tipo de item</Label>
          <Select value={novo.item_tipo} onValueChange={(v: any) => setNovo({ ...novo, item_tipo: v, servico_id: null, pacote_id: null })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="servico">Serviço</SelectItem>
              <SelectItem value="pacote">Pacote</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {novo.item_tipo === "servico" ? (
          <div>
            <Label>Serviço</Label>
            <Select value={novo.servico_id ?? ""} onValueChange={(v) => setNovo({ ...novo, servico_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{servicos.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : (
          <div>
            <Label>Pacote</Label>
            <Select value={novo.pacote_id ?? ""} onValueChange={(v) => setNovo({ ...novo, pacote_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{pacotes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Tipo de repasse</Label>
            <Select value={novo.tipo_repasse} onValueChange={(v: any) => setNovo({ ...novo, tipo_repasse: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentual">Percentual (%)</SelectItem>
                <SelectItem value="fixo">Fixo (R$)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Valor</Label>
            <Input type="number" step="0.01" value={novo.valor_repasse ?? 0} onChange={(e) => setNovo({ ...novo, valor_repasse: Number(e.target.value) })} />
          </div>
        </div>

        <Button onClick={salvar} className="w-full"><Plus className="w-4 h-4" /> Adicionar regra</Button>
      </Card>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm text-muted-foreground">Regras cadastradas</h3>
        {repasses.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma regra cadastrada.</Card>}
        {repasses.map((r) => (
          <Card key={r.id} className="p-3 flex items-center gap-3">
            {r.profissional?.cor_agenda && <span className="w-3 h-10 rounded-full shrink-0" style={{ backgroundColor: r.profissional.cor_agenda }} />}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{r.profissional?.nome}</div>
              <div className="text-xs text-muted-foreground">
                {r.item_tipo === "servico" ? `Serviço: ${r.servico?.nome}` : `Pacote: ${r.pacote?.nome}`}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-semibold">
                {r.tipo_repasse === "percentual" ? `${r.valor_repasse}%` : Number(r.valor_repasse).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => excluir(r.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
