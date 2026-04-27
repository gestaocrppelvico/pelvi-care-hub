import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
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

export default function MedicoNovo() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [gettingGps, setGettingGps] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  function pegarGps() {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada neste dispositivo");
      return;
    }
    setGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(7));
        setLng(pos.coords.longitude.toFixed(7));
        setGettingGps(false);
        toast.success("Localização capturada!");
      },
      (err) => {
        setGettingGps(false);
        toast.error("Erro ao obter GPS: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
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

    const { error } = await supabase.from("medicos").insert(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Médico cadastrado!");
    navigate("/medicos");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-2xl font-bold">Novo médico</h1>
      </div>

      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nome *" name="nome" required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Especialidade" name="especialidade" />
            <Field label="CRM" name="crm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone" name="telefone" />
            <Field label="WhatsApp" name="whatsapp" />
          </div>
          <Field label="E-mail" name="email" type="email" />
          <Field label="Endereço" name="endereco" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cidade" name="cidade" />
            <Field label="Estado" name="estado" />
          </div>

          <div className="space-y-2">
            <Label>Localização (GPS)</Label>
            <Button
              type="button"
              variant="secondary"
              className="w-full h-11"
              onClick={pegarGps}
              disabled={gettingGps}
            >
              {gettingGps ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
              Obter localização atual
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} />
              <Input placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
          </div>

          <Field label="Planos atendidos (separe por vírgula)" name="planos_atendidos" />
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <Textarea id="obs" name="observacoes" rows={3} placeholder="Insights, preferências, último contato..." />
          </div>

          <Button type="submit" className="w-full h-12" disabled={busy}>
            {busy ? "Salvando..." : "Salvar médico"}
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
