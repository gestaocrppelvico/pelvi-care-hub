import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PLACEHOLDERS } from "@/lib/crm";

interface Template {
  id: string;
  tipo: string;
  nome: string;
  conteudo: string;
}

const TIPO_LABEL: Record<string, string> = {
  lembrete: "Lembrete 24h antes",
  retorno: "Retorno de paciente inativo",
  aniversario: "Aniversário",
};

export default function CrmTemplates() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [list, setList] = useState<Template[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function carregar() {
    const { data } = await supabase.from("crm_templates").select("*").order("tipo");
    setList((data as any) ?? []);
  }

  useEffect(() => { carregar(); }, []);

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/crm" replace />;

  async function salvar(t: Template) {
    setBusy(t.id);
    const { error } = await supabase.from("crm_templates")
      .update({ conteudo: t.conteudo, nome: t.nome })
      .eq("id", t.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Template salvo");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to="/crm" aria-label="Voltar"><ArrowLeft className="w-5 h-5" /></Link>
        </Button>
        <h1 className="text-2xl font-bold">Templates de mensagem</h1>
      </div>

      <Card className="p-3 text-xs space-y-1 bg-muted/50">
        <p className="font-medium">Variáveis disponíveis:</p>
        <div className="flex flex-wrap gap-1">
          {PLACEHOLDERS.map((p) => (
            <code key={p} className="px-2 py-0.5 rounded bg-background border">{p}</code>
          ))}
        </div>
      </Card>

      {list.map((t) => (
        <Card key={t.id} className="p-4 space-y-2">
          <div>
            <div className="text-xs text-muted-foreground uppercase">{TIPO_LABEL[t.tipo] ?? t.tipo}</div>
            <div className="font-semibold">{t.nome}</div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`tpl-${t.id}`} className="sr-only">Mensagem</Label>
            <Textarea
              id={`tpl-${t.id}`}
              value={t.conteudo}
              onChange={(e) => setList((prev) => prev.map((x) => x.id === t.id ? { ...x, conteudo: e.target.value } : x))}
              rows={4}
              className="text-sm"
            />
          </div>
          <Button onClick={() => salvar(t)} disabled={busy === t.id} size="sm" className="w-full">
            <Save className="w-4 h-4 mr-1" /> {busy === t.id ? "Salvando..." : "Salvar"}
          </Button>
        </Card>
      ))}
    </div>
  );
}
