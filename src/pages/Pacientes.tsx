import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AuditoriaFinanceira } from "@/components/AuditoriaFinanceira";
import { Search, User, Phone, ShieldAlert, Settings } from "lucide-react";
import { toast } from "sonner";

interface Paciente {
  id: string;
  nome: string;
  telefone: string | null;
  created_at: string;
}

export default function Pacientes() {
  const { isAdmin } = useAuth();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);

  // Estados de controlo do painel de auditoria manual
  const [auditoriaOpen, setAuditoriaOpen] = useState(false);
  const [pacienteSelecionado, setPacienteSelecionado] = useState<{ id: string; nome: string } | null>(null);

  const carregarPacientes = async () => {
    setLoading(true);
    let query = supabase
      .from("pacientes")
      .select("id, nome, telefone, created_at")
      .order("nome", { ascending: true });

    if (busca.trim().length > 0) {
      query = query.ilike("nome", `%${busca}%`);
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Erro ao carregar lista de pacientes: " + error.message);
    } else {
      setPacientes(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      carregarPacientes();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [busca]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Pacientes Cadastrados</h1>
        <Badge variant="outline" className="bg-slate-50">Total: {pacientes.length}</Badge>
      </div>

      {/* BARRA DE PESQUISA */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
          placeholder="Buscar paciente pelo nome..."
        />
      </div>

      {/* LISTA DE PACIENTES */}
      {loading ? (
        <p className="text-center text-sm text-muted-foreground py-8">A carregar pacientes...</p>
      ) : pacientes.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhum paciente encontrado.</p>
      ) : (
        <div className="grid gap-3">
          {pacientes.map((paciente) => (
            <Card key={paciente.id} className="p-4 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm text-foreground">{paciente.nome}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="w-3.5 h-3.5" />
                  <span>{paciente.telefone || "Sem telefone cadastrado"}</span>
                </div>
              </div>

              {/* BOTÃO EXCLUSIVO DO ADM PARA ENCONTRO DE CONTAS E AUDITORIA */}
              {isAdmin ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-200 bg-amber-50/50 hover:bg-amber-100/70 text-amber-800 font-medium text-xs h-8"
                  onClick={() => {
                    setPacienteSelecionado({ id: paciente.id, nome: paciente.nome });
                    setAuditoriaOpen(true);
                  }}
                >
                  <Settings className="w-3.5 h-3.5 mr-1" />
                  Auditoria / Saldo
                </Button>
              ) : (
                <Badge variant="ghost" className="text-[10px] text-muted-foreground">Profissional</Badge>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* NOTA EXPLICATIVA SOBRE MIGRAÇÃO DE DADOS */}
      {isAdmin && (
        <div className="p-3 border border-dashed rounded-lg bg-slate-50 flex gap-2 items-start text-xs text-muted-foreground mt-6">
          <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>
            <strong>Área de Migração:</strong> Utilize o painel de Auditoria acima para injetar históricos ou alterar manualmente o saldo de sessões de contratos antigos que vieram da sua operação anterior.
          </p>
        </div>
      )}

      {/* INSTÂNCIA DO PAINEL LATERAL DE AUDITORIA */}
      {pacienteSelecionado && (
        <AuditoriaFinanceira
          isOpen={auditoriaOpen}
          onClose={() => {
            setAuditoriaOpen(false);
            carregarPacientes(); // Recarrega para refletir qualquer mudança imediata
          }}
          pacienteId={pacienteSelecionado.id}
          nomePaciente={pacienteSelecionado.nome}
        />
      )}
    </div>
  );
}
