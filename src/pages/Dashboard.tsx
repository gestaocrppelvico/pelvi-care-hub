import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Users, Stethoscope, FileText, Package, MapPin, ShieldAlert, Link2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import DashboardFisio from "./DashboardFisio";

interface Stats {
  pacientes: number;
  atendimentosHoje: number;
  medicos: number;
  alertasEstoque: number;
}

export default function Dashboard() {
  const { user, roles, isAdmin, isFisio, isSecretaria } = useAuth();
  const [stats, setStats] = useState<Stats>({
    pacientes: 0,
    atendimentosHoje: 0,
    medicos: 0,
    alertasEstoque: 0,
  });
  const [nome, setNome] = useState("");

  useEffect(() => {
    (async () => {
      if (user) {
        const { data } = await supabase.from("profiles").select("nome_completo").eq("id", user.id).maybeSingle();
        setNome(data?.nome_completo?.split(" ")[0] ?? "");
      }
      const today = new Date();
      const start = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const end = new Date(today.setHours(23, 59, 59, 999)).toISOString();

      const [{ count: pac }, { count: atend }, { count: med }, { data: estoque }] = await Promise.all([
        supabase.from("pacientes").select("id", { count: "exact", head: true }),
        supabase.from("atendimentos").select("id", { count: "exact", head: true }).gte("data_inicio", start).lte("data_inicio", end),
        supabase.from("medicos").select("id", { count: "exact", head: true }),
        supabase.from("estoque_insumos").select("id, quantidade_atual, connectivity_check:quantidade_minima"),
      ]);

      // Alertas de estoque simples
      const alertas = (estoque ?? []).filter((i: any) => Number(i.quantidade_atual) <= Number(i.connectivity_check)).length;
      setStats({ pacientes: pac ?? 0, atendimentosHoje: atend ?? 0, medicos: med ?? 0, alertasEstoque: alertas });
    })();
  }, [user]);

  const cards = [
    { to: "/agenda", icon: Calendar, label: "Atend. hoje", value: stats.atendimentosHoje, show: true },
    { to: "/pacientes", icon: Users, label: "Pacientes", value: stats.pacientes, show: true },
    { to: "/medicos", icon: Stethoscope, label: "Médicos", value: stats.medicos, show: true },
    { to: "/mais", icon: Package, label: "Estoque baixo", value: stats.alertasEstoque, show: isAdmin || isSecretaria },
  ].filter((c) => c.show);

  // LISTA DE ATALHOS - ADICIONADO O BOTÃO DO VÍNCULO LEVE DE PACIENTES AQUI
  const quickActions = [
    { to: "/agenda", icon: Calendar, label: "Ver agenda", desc: "Atendimentos do dia" },
    { to: "/pacientes", icon: Users, label: "Pacientes", desc: "Cadastro e prontuário" },
    
    // NOVO ATALHO EXCLUSIVO PARA O VÍNCULO DE PACIENTES DA RECORRÊNCIA
    (isAdmin || isSecretaria) && { to: "/financeiro/vincular", icon: Link2, label: "Vincular Agenda", desc: "Identificar pacientes pendentes" },
    
    { to: "/medicos", icon: Stethoscope, label: "Médicos parceiros", desc: "CRM de visitação" },
    isAdmin && { to: "/mais", icon: ShieldAlert, label: "Administração", desc: "Usuários e papéis" },
    isFisio && { to: "/explorar", icon: MapPin, label: "Explorar próximos", desc: "Médicos perto de você" },
    { to: "/mais", icon: FileText, label: "Documentos", desc: "Atestados, alta, reembolso" },
  ].filter(Boolean) as { to: string; icon: any; label: string; desc: string }[];

  if (isFisio && !isAdmin && !isSecretaria) {
    return <DashboardFisio />;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Olá{nome ? `, ${nome}` : ""}</p>
        <h1 className="text-2xl font-bold text-foreground">Bom dia 👋</h1>
      </div>

      {roles.length === 0 && (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Acesso pendente</AlertTitle>
          <AlertDescription>
            Sua conta foi criada mas ainda não tem um papel atribuído. Peça a um administrador para liberar seu acesso.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        {cards.map(({ to, icon: Icon, label, value }) => (
          <Link key={label} to={to}>
            <Card className="p-4 shadow-card hover:shadow-elegant transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Atalhos</h2>
        <div className="space-y-2">
          {quickActions.map(({ to, icon: Icon, label, desc }) => (
            <Link key={label} to={to}>
              <Card className="p-4 shadow-card hover:shadow-elegant transition-shadow flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-foreground">{label}</div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
