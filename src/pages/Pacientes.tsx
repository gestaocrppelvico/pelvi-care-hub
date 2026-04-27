import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

interface Paciente {
  id: string;
  nome: string;
  telefone: string | null;
  plano_saude: string | null;
}

export default function Pacientes() {
  const [list, setList] = useState<Paciente[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome, telefone, plano_saude")
        .eq("ativo", true)
        .order("nome");
      setList(data ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = list.filter((p) => p.nome.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pacientes</h1>
        <Button asChild size="sm">
          <Link to="/pacientes/novo"><Plus className="w-4 h-4 mr-1" /> Novo</Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar paciente..." className="pl-9 h-12" />
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-8">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <User className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhum paciente encontrado.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <Link key={p.id} to={`/pacientes/${p.id}`}>
              <Card className="p-4 shadow-card hover:shadow-elegant transition-shadow flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-primary font-semibold">
                  {p.nome.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{p.nome}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.plano_saude ?? "Particular"} {p.telefone ? `• ${p.telefone}` : ""}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
