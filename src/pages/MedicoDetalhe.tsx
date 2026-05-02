import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2, Save, MapPin, Loader2, Search, CheckCircle } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  nome: z.string().trim().min(2).max(120),
  especialidade: z.string().trim().max(120).optional().or(z.literal("")),
  crm: z.string().trim().max(40).optional().or(z.literal("")),
  telefone: z.string().trim().max(30).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  endereco: z.string().trim().max(300).optional().or(z.literal("")),
  cidade: z.string().trim().max(80).optional().or(z.literal("")),
  estado: z.string().trim().max(40).optional().or(z.literal("")),
  planos_atendidos: z.string().trim().max(300).optional().or(z.literal("")),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
});

export default function MedicoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Record<string, string>>({});
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [gettingGps, setGettingGps] = useState(false);
  const [ultimaVisita, setUltimaVisita] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from("medicos").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      if (data) {
        setForm({
          nome: data.nome ?? "",
          especialidade: data.especialidade ?? "",
          crm: data.crm ?? "",
          telefone: data.telefone ?? "",
          whatsapp: data.whatsapp ?? "",
          email: data.email ?? "",
          endereco: data.endereco ?? "",
          cidade: data.cidade ?? "",
          estado: data.estado ?? "",
          planos_atendidos: (data.planos_atendidos ?? []).join(", "),
          observacoes: data.observacoes ?? "",
        });
        setLat(data.latitude?.toString() ?? "");
        setLng(data.longitude?.toString() ?? "");
        setUltimaVisita(data.ultima_visita);
      }
      setLoading(false);
    });
  }, [id]);

  async function geocodificarEndereco() {
    if (!form.endereco && !form.cidade) { toast.error("Preencha endereço ou cidade"); return; }
    setGeocoding(true);
    const { data, error } = await supabase.functions.invoke("geocode", {
      body: { endereco: form.endereco, cidade: form.cidade, estado: form.estado },
    });
    setGeocoding(false);
    if (error) { toast.error(error.message); return; }
    if (!data?.found) { toast.error("Endereço não encontrado"); return; }
    setLat(String(data.latitude));
    setLng(String(data.longitude));
    toast.success("Coordenadas encontradas!");
  }

  function pegarGps() {
    if (!navigator.geolocation) { toast.error("GPS não suportado"); return; }
    setGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude.toFixed(7)); setLng(pos.coords.longitude.toFixed(7)); setGettingGps(false); toast.success("GPS capturado!"); },
      (err) => { setGettingGps(false); toast.error(err.message); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function marcarVisita() {
    const hoje = new Date().toISOString().split("T")[0];
    const { error } = await supabase.from("medicos").update({ ultima_visita: hoje }).eq("id", id!);
    if (error) { toast.error(error.message); return; }
    setUltimaVisita(hoje);
    toast.success("Visita registrada!");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    setBusy(true);
    const planos = parsed.data.planos_atendidos
      ? parsed.data.planos_atendidos.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const payload: any = Object.fromEntries(
      Object.entries(parsed.data).map(([k, v]) => [k, v === "" ? null : v])
    );
    payload.planos_atendidos = planos;
    payload.latitude = lat ? Number(lat) : null;
    payload.longitude = lng ? Number(lng) : null;
    const { error } = await supabase.from("medicos").update(payload).eq("id", id!);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Médico atualizado!");
    navigate("/medicos");
  }

  async function onDelete() {
    if (!confirm("Excluir este médico?")) return;
    const { error } = await supabase.from("medicos").delete().eq("id", id!);
    if (error) { toast.error(error.message); return; }
    toast.success("Médico excluído!");
    navigate("/medicos");
  }

  if (loading) return <p className="text-muted-foreground text-center py-8">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-2xl font-bold">Editar médico</h1>
      </div>

      <Card className="p-3 flex items-center justify-between">
        <div className="text-sm">
          <span className="text-muted-foreground">Última visita: </span>
          <span className="font-medium">{ultimaVisita ? format(new Date(ultimaVisita + "T12:00:00"), "dd/MM/yyyy") : "Nunca"}</span>
        </div>
        <Button size="sm" variant="outline" onClick={marcarVisita}>
          <CheckCircle className="w-4 h-4 mr-1" /> Marcar visita hoje
        </Button>
      </Card>

      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nome *" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Especialidade" value={form.especialidade} onChange={(v) => setForm({ ...form, especialidade: v })} />
            <Field label="CRM" value={form.crm} onChange={(v) => setForm({ ...form, crm: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} />
            <Field label="WhatsApp" value={form.whatsapp} onChange={(v) => setForm({ ...form, whatsapp: v })} />
          </div>
          <Field label="E-mail" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
          <Field label="Endereço" value={form.endereco} onChange={(v) => setForm({ ...form, endereco: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cidade" value={form.cidade} onChange={(v) => setForm({ ...form, cidade: v })} />
            <Field label="Estado" value={form.estado} onChange={(v) => setForm({ ...form, estado: v })} />
          </div>

          <div className="space-y-2">
            <Label>Localização no mapa</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" className="h-11" onClick={geocodificarEndereco} disabled={geocoding}>
                {geocoding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Buscar endereço
              </Button>
              <Button type="button" variant="secondary" className="h-11" onClick={pegarGps} disabled={gettingGps}>
                {gettingGps ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
                Usar GPS
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} />
              <Input placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
          </div>

          <Field label="Planos atendidos (vírgula)" value={form.planos_atendidos} onChange={(v) => setForm({ ...form, planos_atendidos: v })} />
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>

          <Button type="submit" className="w-full h-12" disabled={busy}>
            <Save className="w-4 h-4 mr-2" /> {busy ? "Salvando..." : "Salvar alterações"}
          </Button>
        </form>
      </Card>
      <Button variant="destructive" className="w-full" onClick={onDelete}>
        <Trash2 className="w-4 h-4 mr-2" /> Excluir médico
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
