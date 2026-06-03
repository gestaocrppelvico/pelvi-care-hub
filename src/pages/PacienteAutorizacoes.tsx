import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, Plus, Pencil, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

type StatusAutorizacao = "pendente" | "ativa" | "esgotada" | "expirada";

interface Autorizacao {
  id: string;
  plano: string;
  numero_guia: string | null;
  sessoes_autorizadas: number;
  sessoes_realizadas: number;
  data_emissao: string | null;
  data_validade: string | null;
  status: StatusAutorizacao;
  observacoes: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<StatusAutorizacao, string> = {
  pendente: "bg-yellow-100 text-yellow-800",
  ativa: "bg-green-100 text-green-800",
  esgotada: "bg-red-100 text-red-800",
  expirada: "bg-gray-100 text-gray-800",
};

const EMPTY: Omit<Autorizacao, "id" | "created_at"> = {
  plano: "",
  numero_guia: "",
  sessoes_autorizadas: 10,
  sessoes_realizadas: 0,
  data_emissao: "",
  data_validade: "",
  status: "ativa",
  observacoes: "",
};

export default function PacienteAutorizacoes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pacNome, setPacNome] = useState("");
  const [autorizacoes, setAutorizacoes] = useState<Autorizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Autorizacao | null>(null);
  const [form, setForm] = useState(EMPTY);

  async function carregar() {
    if (!id) return;
    const [{ data: pac }, { data: aut }] = await Promise.all([
      supabase.from("pacientes").select("nome").eq("id", id).maybeSingle(),
      supabase.from("autorizacoes").select("*").eq("paciente_id", id).order("created_at", { ascending: false }),
    ]);
    setPacNome(pac?.nome ?? "");
    setAutorizacoes((aut as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [id]);

  function abrirNovo() {
    setEditando(null);
    setForm({ ...EMPTY });
    setOpen(true);
  }

  function abrirEditar(a: Autorizacao) {
    setEditando(a);
    setForm({
      plano: a.plano,
      numero_guia: a.numero_guia ?? "",
      sessoes_autorizadas: a.sessoes_autorizadas,
      sessoes_realizadas: a.sessoes_realizadas,
      data_emissao: a.data_emissao ?? "",
      data_validade: a.data_validade ?? "",
      status: a.status,
      observacoes: a.observacoes ?? "",
    });
    setOpen(true);
  }

  async function salvar() {
    if (!form.plano.trim()) {
      toast.error("Informe o plano de saúde");
      return;
    }
    const payload = {
      paciente_id: id!,
      plano: form.plano,
      numero_guia: form.numero_guia || null,
      sessoes_autorizadas: form.sessoes_autorizadas,
      sessoes_realizadas: form.sessoes_realizadas,
      data_emissao: form.data_emissao || null,
      data_validade: form.data_validade || null,
      status: form.status as StatusAutorizacao,
      observacoes: form.observacoes || null,
    };

    if (editando) {
      const { error } = await supabase.from("autorizacoes").update(payload).eq("id", editando.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Autorização atualizada");
    } else {
      // Cria a autorização no sistema
      const { data: novaAut, error } = await supabase.from("autorizacoes").insert(payload).select().single();
      if (error) { toast.error(error.message); return; }
      
      // MÁGICA: Cria o pacote financeiro atrelado instantaneamente!
      if (novaAut) {
        await supabase.from("paciente_pacotes").insert({
          paciente_id: id!,
          autorizacao_id: novaAut.id,
          sessoes_totais: form.sessoes_autorizadas,
          sessoes_restantes: form.sessoes_autorizadas - form.sessoes_realizadas,
          preco_pago: 0,
          status_pagamento: "pago"
        });
      }
      toast.success("Guia e Pacote Financeiro criados com sucesso!");
    }
    setOpen(false);
    carregar();
  }

  if (loading) return <p className="text-muted-foreground text-center py-8">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Autorizações</h1>
          <p className="text-xs text-muted-foreground">{pacNome}</p>
        </div>
      </div>

      <Button size="sm" onClick={abrirNovo}>
        <Plus className="w-4 h-4 mr-1" /> Nova autorização
      </Button>

      {autorizacoes.length === 0 ? (
        <Card className="p-8 text-center">
          <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">Nenhuma autorização registrada.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {autorizacoes.map((a) => {
            const restantes = a.sessoes_autorizadas - a.sessoes_realizadas;
            const pctUsado = a.sessoes_autorizadas > 0
              ? Math.round((a.sessoes_realizadas / a.sessoes_autorizadas) * 100)
              : 0;
            const vencida = a.data_validade && new Date(a.data_validade) < new Date();

            return (
              <Card
                key={a.id}
                className="p-4 space-y-3 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => abrirEditar(a)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{a.plano}</span>
                    <Badge className={`text-[10px] ${STATUS_COLORS[a.status]}`}>
                      {a.status}
                    </Badge>
                    {vencida && a.status === "ativa" && (
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                    )}
                  </div>
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </div>

                {a.numero_guia && (
                  <p className="text-xs text-muted-foreground">Guia: {a.numero_guia}</p>
                )}

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Sessões: {a.sessoes_realizadas}/{a.sessoes_autorizadas}</span>
                    <span className={restantes <= 2 && restantes > 0 ? "text-yellow-600 font-medium" : restantes <= 0 ? "text-destructive font-medium" : ""}>
                      {restantes > 0 ? `${restantes} restantes` : "Esgotado"}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${pctUsado >= 100 ? "bg-destructive" : pctUsado >= 80 ? "bg-yellow-500" : "bg-primary"}`}
                      style={{ width: `${Math.min(pctUsado, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex gap-4 text-[11px] text-muted-foreground">
                  {a.data_emissao && <span>Emissão: {format(new Date(a.data_emissao), "dd/MM/yy")}</span>}
                  {a.data_validade && (
                    <span className={vencida ? "text-destructive" : ""}>
                      Validade: {format(new Date(a.data_validade), "dd/MM/yy")}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar autorização" : "Nova autorização"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium">Plano de saúde *</label>
              <Input value={form.plano} onChange={(e) => setForm({ ...form, plano: e.target.value })} placeholder="Ex: Unimed" />
            </div>
            <div>
              <label className="text-sm font-medium">Número da guia</label>
              <Input value={form.numero_guia ?? ""} onChange={(e) => setForm({ ...form, numero_guia: e.target.value })} placeholder="Opcional" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Sessões autorizadas</label>
                <Input
                  type="number"
                  min={0}
                  value={form.sessoes_autorizadas}
                  onChange={(e) => setForm({ ...form, sessoes_autorizadas: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Sessões realizadas</label>
                <Input
                  type="number"
                  min={0}
                  value={form.sessoes_realizadas}
                  onChange={(e) => setForm({ ...form, sessoes_realizadas: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Data emissão</label>
                <Input type="date" value={form.data_emissao ?? ""} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data validade</label>
                <Input type="date" value={form.data_validade ?? ""} onChange={(e) => setForm({ ...form, data_validade: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as StatusAutorizacao })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="esgotada">Esgotada</SelectItem>
                  <SelectItem value="expirada">Expirada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Observações</label>
              <Textarea
                value={form.observacoes ?? ""}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                rows={3}
                placeholder="Opcional"
              />
            </div>
            <Button className="w-full" onClick={salvar}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
