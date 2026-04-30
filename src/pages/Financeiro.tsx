import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, Package, Settings, ChevronRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface RepasseRow {
  id: string;
  atendimento_id: string;
  profissional_id: string;
  valor_atendimento: number;
  valor_repasse: number;
  status: string;
  created_at: string;
  profissional?: { nome: string; cor_agenda: string };
}

export default function Financeiro() {
  const { isAdmin, isSecretaria } = useAuth();
  const podeGerenciar = isAdmin || isSecretaria;
  const [repasses, setRepasses] = useState<RepasseRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    const { data } = await supabase
      .from("repasses_atendimento")
      .select("*, profissional:profissionais(nome, cor_agenda)")
      .order("created_at", { ascending: false })
      .limit(200);
    setRepasses((data as any[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  const pendentes = repasses.filter((r) => r.status === "pendente");
  const pagos = repasses.filter((r) => r.status === "pago");
  const totalPendente = pendentes.reduce((s, r) => s + Number(r.valor_repasse), 0);
  const totalPago = pagos.reduce((s, r) => s + Number(r.valor_repasse), 0);
  const totalReceitas = repasses.reduce((s, r) => s + Number(r.valor_atendimento), 0);

  async function marcarPago(id: string) {
    const { error } = await supabase
      .from("repasses_atendimento")
      .update({ status: "pago", data_pagamento: new Date().toISOString().slice(0, 10) })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Repasse pago");
    carregar();
  }

  function formatBRL(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Financeiro</h1>
      </div>

      {podeGerenciar && (
        <div className="grid grid-cols-2 gap-2">
          <Link to="/financeiro/servicos">
            <Card className="p-3 flex items-center gap-2 hover:bg-accent transition-colors h-full">
              <Package className="w-5 h-5 text-primary" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">Serviços e Pacotes</div>
                <div className="text-xs text-muted-foreground">Catálogo</div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Card>
          </Link>
          {isAdmin && (
            <Link to="/financeiro/repasses">
              <Card className="p-3 flex items-center gap-2 hover:bg-accent transition-colors h-full">
                <Settings className="w-5 h-5 text-primary" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">Repasses</div>
                  <div className="text-xs text-muted-foreground">Por serviço × fisio</div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </Card>
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Receita</div>
          <div className="text-lg font-bold">{formatBRL(totalReceitas)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Repasse pendente</div>
          <div className="text-lg font-bold text-amber-600">{formatBRL(totalPendente)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Repasse pago</div>
          <div className="text-lg font-bold text-emerald-600">{formatBRL(totalPago)}</div>
        </Card>
      </div>

      <Tabs defaultValue="pendentes">
        <TabsList className="w-full">
          <TabsTrigger value="pendentes" className="flex-1">Pendentes ({pendentes.length})</TabsTrigger>
          <TabsTrigger value="pagos" className="flex-1">Pagos ({pagos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes" className="space-y-2 mt-3">
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && pendentes.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum repasse pendente.</Card>
          )}
          {pendentes.map((r) => (
            <Card key={r.id} className="p-3 flex items-center gap-3">
              {r.profissional?.cor_agenda && (
                <span className="w-3 h-10 rounded-full shrink-0" style={{ backgroundColor: r.profissional.cor_agenda }} />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{r.profissional?.nome ?? "Profissional"}</div>
                <div className="text-xs text-muted-foreground">
                  Atend. {formatBRL(Number(r.valor_atendimento))} · {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold text-amber-600">{formatBRL(Number(r.valor_repasse))}</div>
              </div>
              {podeGerenciar && (
                <Button size="sm" variant="outline" onClick={() => marcarPago(r.id)}>
                  <CheckCircle2 className="w-4 h-4" />
                </Button>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="pagos" className="space-y-2 mt-3">
          {pagos.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum repasse pago.</Card>
          )}
          {pagos.map((r) => (
            <Card key={r.id} className="p-3 flex items-center gap-3">
              {r.profissional?.cor_agenda && (
                <span className="w-3 h-10 rounded-full shrink-0" style={{ backgroundColor: r.profissional.cor_agenda }} />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{r.profissional?.nome ?? "Profissional"}</div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</div>
              </div>
              <Badge variant="secondary" className="shrink-0">{formatBRL(Number(r.valor_repasse))}</Badge>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
