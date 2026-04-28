import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Phone, Calendar, Activity } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Paciente {
  id: string;
  nome: string;
  telefone: string | null;
  data_nascimento: string | null;
  plano_saude: string | null;
  numero_carteirinha: string | null;
  observacoes: string | null;
}

interface ProntuarioItem {
  id: string;
  atendimento_id: string;
  escala_dor: number | null;
  queixa_principal: string | null;
  conduta: string | null;
  evolucao_livre: string | null;
  created_at: string;
  atendimento: { data_inicio: string; profissional: { nome: string } | null } | null;
}

export default function PacienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pac, setPac] = useState<Paciente | null>(null);
  const [pront, setPront] = useState<ProntuarioItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: p }, { data: ev }] = await Promise.all([
        supabase.from("pacientes").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("prontuarios")
          .select("id, atendimento_id, escala_dor, queixa_principal, conduta, evolucao_livre, created_at, atendimento:atendimentos(data_inicio, profissional:profissionais(nome))")
          .eq("paciente_id", id)
          .order("created_at", { ascending: false }),
      ]);
      setPac(p as any);
      setPront((ev as any) ?? []);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <p className="text-muted-foreground text-center py-8">Carregando...</p>;
  if (!pac) return <p className="text-muted-foreground text-center py-8">Paciente não encontrado.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-2xl font-bold truncate">{pac.nome}</h1>
      </div>

      <Card className="p-4 space-y-2">
        {pac.telefone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="w-4 h-4 text-muted-foreground" /> {pac.telefone}
          </div>
        )}
        {pac.data_nascimento && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            {format(new Date(pac.data_nascimento), "dd/MM/yyyy")}
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <Activity className="w-4 h-4 text-muted-foreground" />
          {pac.plano_saude ?? "Particular"} {pac.numero_carteirinha ? `• ${pac.numero_carteirinha}` : ""}
        </div>
        {pac.observacoes && (
          <p className="text-xs text-muted-foreground pt-2 border-t">{pac.observacoes}</p>
        )}
      </Card>

      <div className="flex items-center justify-between pt-2">
        <h2 className="text-lg font-semibold">Histórico de evoluções</h2>
        <Badge variant="secondary">{pront.length}</Badge>
      </div>

      {pront.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">Nenhuma evolução registrada ainda.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {pront.map((p) => (
            <Link key={p.id} to={`/atendimentos/${p.atendimento_id}/prontuario`}>
              <Card className="p-4 shadow-card hover:shadow-elegant transition-shadow space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {p.atendimento?.data_inicio
                      ? format(new Date(p.atendimento.data_inicio), "dd 'de' MMM yyyy", { locale: ptBR })
                      : format(new Date(p.created_at), "dd 'de' MMM yyyy", { locale: ptBR })}
                  </span>
                  {p.escala_dor !== null && (
                    <Badge variant={p.escala_dor >= 7 ? "destructive" : "secondary"}>
                      Dor {p.escala_dor}/10
                    </Badge>
                  )}
                </div>
                {p.queixa_principal && <div className="text-sm font-medium truncate">{p.queixa_principal}</div>}
                {(p.conduta || p.evolucao_livre) && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {p.conduta || p.evolucao_livre}
                  </p>
                )}
                {p.atendimento?.profissional?.nome && (
                  <p className="text-[11px] text-muted-foreground">por {p.atendimento.profissional.nome}</p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
