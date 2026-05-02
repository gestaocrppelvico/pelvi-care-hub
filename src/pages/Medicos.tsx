import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Stethoscope, MapPin, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Medico {
  id: string;
  nome: string;
  especialidade: string | null;
  cidade: string | null;
  latitude: number | null;
  longitude: number | null;
  ultima_visita: string | null;
}

export default function Medicos() {
  const [list, setList] = useState<Medico[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    supabase
      .from("medicos")
      .select("id, nome, especialidade, cidade, latitude, longitude, ultima_visita")
      .order("nome")
      .then(({ data }) => setList(data ?? []));
  }, []);

  const filtered = list.filter((m) => m.nome.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Médicos</h1>
        <Button asChild size="sm">
          <Link to="/medicos/novo"><Plus className="w-4 h-4 mr-1" /> Novo</Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar médico..." className="pl-9 h-12" />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <Stethoscope className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhum médico cadastrado ainda.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <Link key={m.id} to={`/medicos/${m.id}`}>
              <Card className="p-4 shadow-card hover:shadow-elegant transition-shadow flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                  <Stethoscope className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{m.nome}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {m.especialidade ?? "—"} {m.cidade ? `• ${m.cidade}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {m.ultima_visita && (
                    <Badge variant="default" className="text-[10px]">
                      <CheckCircle className="w-3 h-3 mr-1" />Visitado
                    </Badge>
                  )}
                  {m.latitude && m.longitude && (
                    <Badge variant="secondary"><MapPin className="w-3 h-3 mr-1" />GPS</Badge>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
