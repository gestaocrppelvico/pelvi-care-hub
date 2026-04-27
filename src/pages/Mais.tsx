import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, Shield, Trash2 } from "lucide-react";

interface UserWithRoles {
  id: string;
  nome_completo: string;
  email: string;
  roles: string[];
}

export default function Mais() {
  const { isAdmin } = useAuth();
  const [usuarios, setUsuarios] = useState<UserWithRoles[]>([]);
  const [novoRole, setNovoRole] = useState<Record<string, string>>({});

  async function carregar() {
    const { data: profiles } = await supabase.from("profiles").select("id, nome_completo, email");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const map = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const arr = map.get(r.user_id) ?? [];
      arr.push(r.role);
      map.set(r.user_id, arr);
    });
    setUsuarios(
      (profiles ?? []).map((p) => ({
        id: p.id,
        nome_completo: p.nome_completo || "(sem nome)",
        email: p.email,
        roles: map.get(p.id) ?? [],
      }))
    );
  }

  useEffect(() => { if (isAdmin) carregar(); }, [isAdmin]);

  async function adicionarRole(userId: string) {
    const role = novoRole[userId];
    if (!role) return;
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
    if (error) { toast.error(error.message); return; }
    toast.success("Papel adicionado");
    setNovoRole({ ...novoRole, [userId]: "" });
    carregar();
  }

  async function removerRole(userId: string, role: string) {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Papel removido");
    carregar();
  }

  if (!isAdmin) {
    return (
      <Card className="p-8 text-center">
        <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold">Apenas administradores</h2>
        <p className="text-sm text-muted-foreground mt-1">Esta área será expandida em breve com estoque, financeiro e documentos.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Usuários e papéis</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Atribua papéis aos usuários cadastrados. Cada papel define o que ele pode ver no app.
      </p>

      <div className="space-y-3">
        {usuarios.map((u) => (
          <Card key={u.id} className="p-4 space-y-3">
            <div>
              <div className="font-semibold">{u.nome_completo}</div>
              <div className="text-xs text-muted-foreground">{u.email}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {u.roles.length === 0 && <span className="text-xs text-muted-foreground italic">sem papel</span>}
              {u.roles.map((r) => (
                <Badge key={r} variant="secondary" className="capitalize gap-1">
                  {r}
                  <button onClick={() => removerRole(u.id, r)} aria-label={`remover ${r}`}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Select value={novoRole[u.id] ?? ""} onValueChange={(v) => setNovoRole({ ...novoRole, [u.id]: v })}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Adicionar papel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="secretaria">Secretaria</SelectItem>
                  <SelectItem value="fisio">Fisio</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => adicionarRole(u.id)} disabled={!novoRole[u.id]}>Adicionar</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
