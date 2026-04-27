import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

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

export default function PacienteNovo() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    const payload = Object.fromEntries(
      Object.entries(parsed.data).map(([k, v]) => [k, v === "" ? null : v])
    ) as any;
    const { error } = await supabase.from("pacientes").insert(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Paciente cadastrado!");
    navigate("/pacientes");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-2xl font-bold">Novo paciente</h1>
      </div>

      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nome completo *" name="nome" required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="CPF" name="cpf" />
            <Field label="Nascimento" name="data_nascimento" type="date" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone" name="telefone" />
            <Field label="E-mail" name="email" type="email" />
          </div>
          <Field label="Endereço" name="endereco" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plano de saúde" name="plano_saude" />
            <Field label="Carteirinha" name="numero_carteirinha" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <Textarea id="obs" name="observacoes" rows={3} />
          </div>
          <Button type="submit" className="w-full h-12" disabled={busy}>
            {busy ? "Salvando..." : "Salvar paciente"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, name, type = "text", required }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} />
    </div>
  );
}
