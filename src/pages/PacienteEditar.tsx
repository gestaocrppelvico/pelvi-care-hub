import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(120),
  cpf: z.string().trim().max(20).optional().or(z.literal("")),
  data_nascimento: z.string().optional().or(z.literal("")),
  telefone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("E-mail inválido").max(255).optional().or(z.literal("")),
  endereco: z.string().trim().max(300).optional().or(z.literal("")),
  plano_saude: z.string().trim().max(80).optional().or(z.literal("")),
  numero_carteirinha: z.string().trim().max(60).optional().or(z.literal("")),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
});

export default function PacienteEditar() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Record<string, string>>({});
  
  // Novo estado para guardar a lista oficial de planos do banco
  const [listaPlanos, setListaPlanos] = useState<{id: string, nome: string}[]>([]);

  useEffect(() => {
    // Busca os planos de saúde ativos na hora que a tela abre
    supabase.from("planos_saude").select("id, nome").eq("ativo", true).then(({ data }) => {
      if (data) setListaPlanos(data);
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    supabase.from("pacientes").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      if (data) {
        setForm({
          nome: data.nome ?? "",
          cpf: data.cpf ?? "",
          data_nascimento: data.data_nascimento ?? "",
          telefone: data.telefone ?? "",
          email: data.email ?? "",
          endereco: data.endereco ?? "",
          plano_saude: data.plano_saude ?? "",
          numero_carteirinha: data.numero_carteirinha ?? "",
          observacoes: data.observacoes ?? "",
        });
      }
      setLoading(false);
    });
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    setBusy(true);
    const payload = Object.fromEntries(
      Object.entries(parsed.data).map(([k, v]) => [k, v === "" ? null : v])
    ) as any;
    const { error } = await supabase.from("pacientes").update(payload).eq("id", id!);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Paciente atualizado!");
    navigate(`/pacientes/${id}`);
  }

  async function onDelete() {
    if (!confirm("Deseja realmente excluir este paciente? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("pacientes").delete().eq("id", id!);
    if (error) { toast.error(error.message); return; }
    toast.success("Paciente excluído!");
    navigate("/pacientes");
  }

  if (loading) return <p className="text-muted-foreground text-center py-8">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-2xl font-bold">Editar paciente</h1>
      </div>
      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nome completo *" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
          
          <div className="grid grid-cols-2 gap-3">
            <Field label="CPF" value={form.cpf} onChange={(v) => setForm({ ...form, cpf: v })} />
            <Field label="Nascimento" value={form.data_nascimento} onChange={(v) => setForm({ ...form, data_nascimento: v })} type="date" />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} />
            <Field label="E-mail" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
          </div>
          
          <Field label="Endereço" value={form.endereco} onChange={(v) => setForm({ ...form, endereco: v })} />
          
          <div className="grid grid-cols-2 gap-3">
            {/* NOVO CAMPO SELECT COM A LISTA DE PLANOS */}
            <div className="space-y-2">
              <Label>Plano de saúde</Label>
              <Select 
                value={form.plano_saude || "nenhum"} 
                onValueChange={(v) => setForm({ ...form, plano_saude: v === "nenhum" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum / Particular</SelectItem>
                  {listaPlanos.map((p) => (
                    <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Field label="Carteirinha" value={form.numero_carteirinha} onChange={(v) => setForm({ ...form, numero_carteirinha: v })} />
          </div>
          
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>
          
          <Button type="submit" className="w-full h-12" disabled={busy}>
            {busy ? "Salvando..." : "Salvar alterações"}
          </Button>
        </form>
      </Card>
      
      <Button variant="destructive" className="w-full" onClick={onDelete}>
        <Trash2 className="w-4 h-4 mr-2" /> Excluir paciente
      </Button>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
