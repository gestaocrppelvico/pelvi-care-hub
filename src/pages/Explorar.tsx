import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, MessageCircle, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { medicoIcon, userIcon } from "@/lib/leaflet-icons";

interface Medico {
  id: string;
  nome: string;
  especialidade: string | null;
  telefone: string | null;
  whatsapp: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  latitude: number | null;
  longitude: number | null;
  planos_atendidos: string[] | null;
  ultima_visita: string | null;
}

const RAIO_OPCOES = [2, 5, 10, 25, 50];

// Distância em km (Haversine)
function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

export default function Explorar() {
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [raio, setRaio] = useState<number>(10);
  const [busca, setBusca] = useState("");
  const [especialidade, setEspecialidade] = useState<string>("todas");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("medicos")
        .select("id,nome,especialidade,telefone,whatsapp,endereco,cidade,estado,latitude,longitude,planos_atendidos,ultima_visita")
        .not("latitude", "is", null)
        .not("longitude", "is", null);
      if (error) toast.error(error.message);
      else setMedicos((data ?? []) as Medico[]);
    })();
    pegarGps(true);
  }, []);

  function pegarGps(silent = false) {
    if (!navigator.geolocation) {
      if (!silent) toast.error("Geolocalização não suportada");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGpsLoading(false);
        if (!silent) toast.success("Localização atualizada");
      },
      (err) => {
        setGpsLoading(false);
        if (!silent) toast.error("Erro GPS: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const especialidades = useMemo(() => {
    const set = new Set<string>();
    medicos.forEach((m) => m.especialidade && set.add(m.especialidade));
    return Array.from(set).sort();
  }, [medicos]);

  const filtrados = useMemo(() => {
    return medicos
      .filter((m) => {
        if (especialidade !== "todas" && m.especialidade !== especialidade) return false;
        if (busca) {
          const q = busca.toLowerCase();
          const hay = `${m.nome} ${m.especialidade ?? ""} ${m.cidade ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (pos && raio) {
          const d = distanciaKm(pos.lat, pos.lng, m.latitude!, m.longitude!);
          if (d > raio) return false;
        }
        return true;
      })
      .map((m) => ({
        ...m,
        distancia: pos ? distanciaKm(pos.lat, pos.lng, m.latitude!, m.longitude!) : null,
      }))
      .sort((a, b) => (a.distancia ?? 0) - (b.distancia ?? 0));
  }, [medicos, busca, especialidade, raio, pos]);

  // Centro padrão: Brasília se não tiver GPS
  const centro: [number, number] = pos ? [pos.lat, pos.lng] : [-15.7942, -47.8822];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MapPin className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Explorar próximos</h1>
      </div>

      <Card className="p-3 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar nome, especialidade, cidade..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <Button variant="secondary" size="icon" onClick={() => pegarGps(false)} disabled={gpsLoading} aria-label="Atualizar GPS">
            {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={especialidade} onValueChange={setEspecialidade}>
            <SelectTrigger className="h-10"><SelectValue placeholder="Especialidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas especialidades</SelectItem>
              {especialidades.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(raio)} onValueChange={(v) => setRaio(Number(v))}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RAIO_OPCOES.map((r) => <SelectItem key={r} value={String(r)}>Raio {r} km</SelectItem>)}
              <SelectItem value="9999">Sem limite</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="h-[420px] w-full relative z-0">
          <MapContainer center={centro} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {pos && (
              <>
                <RecenterMap lat={pos.lat} lng={pos.lng} />
                <Marker position={[pos.lat, pos.lng]} icon={userIcon}>
                  <Popup>Você está aqui</Popup>
                </Marker>
                {raio < 9999 && (
                  <Circle
                    center={[pos.lat, pos.lng]}
                    radius={raio * 1000}
                    pathOptions={{ color: "hsl(var(--primary))", fillOpacity: 0.08, weight: 1.5 }}
                  />
                )}
              </>
            )}
            {filtrados.map((m) => (
              <Marker key={m.id} position={[m.latitude!, m.longitude!]} icon={medicoIcon}>
                <Popup>
                  <div className="space-y-1 min-w-[180px]">
                    <div className="font-semibold text-sm">{m.nome}</div>
                    {m.especialidade && <div className="text-xs text-muted-foreground">{m.especialidade}</div>}
                    {m.distancia !== null && <div className="text-xs">📍 {m.distancia.toFixed(1)} km</div>}
                    {m.endereco && <div className="text-xs text-muted-foreground">{m.endereco}</div>}
                    <div className="flex gap-1 pt-2">
                      {m.whatsapp && (
                        <a
                          href={`https://wa.me/${m.whatsapp.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-1 rounded bg-green-600 text-white"
                        >
                          WhatsApp
                        </a>
                      )}
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${m.latitude},${m.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground"
                      >
                        Como chegar
                      </a>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </Card>

      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          {filtrados.length} médico{filtrados.length !== 1 && "s"} encontrado{filtrados.length !== 1 && "s"}
        </div>
        {filtrados.map((m) => (
          <Card key={m.id} className="p-3">
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{m.nome}</div>
                {m.especialidade && <div className="text-xs text-muted-foreground">{m.especialidade}</div>}
                {m.endereco && <div className="text-xs text-muted-foreground truncate">{m.endereco}</div>}
                {m.planos_atendidos && m.planos_atendidos.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {m.planos_atendidos.slice(0, 3).map((p) => (
                      <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                    ))}
                  </div>
                )}
              </div>
              {m.distancia !== null && (
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-primary">{m.distancia.toFixed(1)} km</div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              {m.whatsapp && (
                <Button asChild size="sm" variant="secondary" className="flex-1">
                  <a href={`https://wa.me/${m.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp
                  </a>
                </Button>
              )}
              <Button asChild size="sm" className="flex-1">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${m.latitude},${m.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation className="w-3.5 h-3.5 mr-1" /> Como chegar
                </a>
              </Button>
            </div>
          </Card>
        ))}
        {filtrados.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nenhum médico nesse raio. Aumente o raio ou cadastre o endereço dos médicos.
          </Card>
        )}
      </div>
    </div>
  );
}
