import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Package, Settings, ChevronRight, CheckCircle2, CheckSquare, Calendar, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";

// Expandimos a interface para receber os dados do paciente e do atendimento
interface RepasseRow {
  id: string;
  atendimento_id: string;
  profissional_id: string;
  valor_atendimento: number;
  valor_repasse: number;
  status: string;
  created_at: string;
  profissional?: { id: string; nome: string; cor_agenda: string };
  atendimento?: {
    tipo: string;
    paciente?: { nome: string };
  };
}

export default function Financeiro() {
  const { isAdmin, isSecretaria } = useAuth();
  const podeGerenciar = isAdmin || isSecretaria;
  
  const [repasses, setRepasses] = useState<RepasseRow[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para os nossos novos filtros
  const [filtroProfissional, setFiltroProfissional] = useState<string>("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>("semana");

  async function carregar() {
    setLoading(true);
    // A MÁGICA DO JOIN: Buscamos os dados aninhados do atendimento e do paciente
    const { data } = await supabase
      .from("repasses_atendimento")
      .select(`
        *,
        profissional:profissionais(id, nome, cor_agenda),
        atendimento:atendimentos(
          tipo,
          paciente:pacientes(nome)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(500); // Aumentamos o limite para garantir que os filtros tenham dados suficientes
      
    setRepasses((data as any[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  // Lista única de profissionais para preencher o dropdown de filtros
  const profissionaisFiltro = useMemo(() => {
    const lista = new Map();
    repasses.forEach(r => {
      if (r.profissional) lista.set(r.profissional.id, r.profissional.nome);
    });
    return Array.from(lista.entries()).map(([id, nome]) => ({ id, nome }));
  }, [repasses]);

  // A MÁGICA DOS FILTROS: Aplicamos as regras de tempo e profissional na lista
  const repassesFiltrados = useMemo(() => {
    let filtrados = repasses;

    // 1. Filtro de Profissional
    if (filtroProfissional !== "todos") {
      filtrados = filtrados.filter(r => r.profissional_id === filtroProfissional);
    }

    // 2. Filtro de Período (Semana ou Mês)
    if (filtroPeriodo !== "todos") {
      const hoje = new Date();
      let start, end;
      
      if (filtroPeriodo === "semana") {
        start = startOfWeek(hoje, { weekStartsOn: 1 }); // Começa na Segunda-feira
        end = endOfWeek(hoje, { weekStartsOn: 1 });
      } else {
        start = startOfMonth(hoje);
        end = endOfMonth(hoje);
      }

      filtrados = filtrados.filter(r => {
        const dataRepasse = parseISO(r.created_at);
        return isWithinInterval(dataRepasse, { start, end });
      });
    }

    return filtrados;
  }, [repasses, filtroProfissional, filtroPeriodo]);

  // Separação entre Pendentes e Conferidos (mantemos "pago" no banco de dados para segurança)
  const pendentes = repassesFiltrados.filter((r) => r.status === "pendente");
  const conferidos = repassesFiltrados.filter((r) => r.status === "pago");
  
  // Totais matemáticos
  const totalPendente = pendentes.reduce((s, r) => s + Number(r.valor_repasse), 0);
  const totalConferido = conferidos.reduce((s, r) => s + Number(r.valor_repasse), 0);
  const totalReceitas = repassesFiltrados.reduce((s, r) => s + Number(r.valor_atendimento), 0);

  // Ação de conferir um único repasse
  async function marcarPago(id: string) {
    const { error } = await supabase
      .from("repasses_atendimento")
      .update({ status: "pago", data_pagamento: new Date().toISOString().slice(0, 10) })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Repasse conferido com sucesso!");
    carregar();
  }

  // A MÁGICA DO LOTE: Conferir todos os que estão visíveis no ecrã de uma vez!
  async function conferirVisiveis() {
    if (pendentes.length === 0) return;
    if (!confirm(`Tem certeza que deseja marcar os ${pendentes.length} repasses visíveis como CONFERIDOS?`)) return;

    // Extraímos apenas os IDs da lista que está na tela
    const idsParaAtualizar = pendentes.map(r => r.id);

    // Mandamos um comando .in() para atualizar todos de uma vez
    const { error } = await supabase
      .from("repasses_atendimento")
      .update({ status: "pago", data_pagamento: new Date().toISOString().slice(0, 10) })
      .in("id", idsParaAtualizar);

    if (error) { toast.error("Erro ao conferir: " + error.message); return; }
    toast.success(`${pendentes.length} repasses foram marcados como conferidos!`);
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

      {/* ÁREA DE FILTROS INTELIGENTES */}
      <div className="flex flex-col sm:flex-row gap-3 p-3 bg-muted/50 rounded-lg border">
        <div className="flex-1">
          <label className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Período
          </label>
          <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semana">Esta Semana</SelectItem>
              <SelectItem value="mes">Este Mês</SelectItem>
              <SelectItem value="todos">Todo o Histórico</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <label className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
            <UserIcon className="w-3 h-3" /> Fisioterapeuta
          </label>
          <Select value={filtroProfissional} onValueChange={setFiltroProfissional}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Toda a Equipa</SelectItem>
              {profissionaisFiltro.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* PAINEL DE TOTAIS DINÂMICOS (Refletem os filtros) */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Receita</div>
          <div className="text-lg font-bold">{formatBRL(totalReceitas)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Pendentes</div>
          <div className="text-lg font-bold text-amber-600">{formatBRL(totalPendente)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Conferidos</div>
          <div className="text-lg font-bold text-emerald-600">{formatBRL(totalConferido)}</div>
        </Card>
      </div>

      <Tabs defaultValue="pendentes">
        <TabsList className="w-full">
          <TabsTrigger value="pendentes" className="flex-1">Pendentes ({pendentes.length})</TabsTrigger>
          <TabsTrigger value="conferidos" className="flex-1">Conferidos ({conferidos.length})</TabsTrigger>
        </TabsList>

        {/* LISTA DE PENDENTES */}
        <TabsContent value="pendentes" className="space-y-3 mt-3">
          
          {podeGerenciar && pendentes.length > 0 && (
            <div className="flex justify-end mb-2">
              <Button onClick={conferirVisiveis} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                <CheckSquare className="w-4 h-4 mr-2" />
                Conferir os {pendentes.length} visíveis
              </Button>
            </div>
          )}

          {loading && <p className="text-sm text-muted-foreground text-center py-4">A carregar...</p>}
          {!loading && pendentes.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum repasse pendente para os filtros selecionados.</Card>
          )}
          
          {pendentes.map((r) => (
            <Card key={r.id} className="p-4 flex flex-col sm:flex-row gap-4 hover:border-emerald-200 transition-colors">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  {r.profissional?.cor_agenda && (
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.profissional.cor_agenda }} />
                  )}
                  <span className="font-semibold text-sm">{r.profissional?.nome ?? "Profissional não identificado"}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto sm:ml-2">{new Date(r.created_at).toLocaleDateString("pt-BR")}</Badge>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground bg-muted/30 p-2 rounded-md">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-medium text-foreground">Paciente:</span> 
                    {r.atendimento?.paciente?.nome || "Não associado"}
                  </div>
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-medium text-foreground">Referência:</span> 
                    {r.atendimento?.tipo || "Geral"}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">Valor Base:</span> 
                    {formatBRL(Number(r.valor_atendimento))}
                  </div>
                </div>
              </div>

              <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 sm:border-l pt-3 sm:pt-0 sm:pl-4 min-w-[120px]">
                <div className="text-xs text-muted-foreground mb-0.5">Valor Repasse</div>
                <div className="font-bold text-amber-600 text-lg">{formatBRL(Number(r.valor_repasse))}</div>
                
                {podeGerenciar && (
                  <Button size="sm" variant="outline" className="mt-2 w-full text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => marcarPago(r.id)}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Único
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </TabsContent>

        {/* LISTA DE CONFERIDOS */}
        <TabsContent value="conferidos" className="space-y-3 mt-3">
          {conferidos.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum repasse conferido para os filtros selecionados.</Card>
          )}
          {conferidos.map((r) => (
            <Card key={r.id} className="p-4 flex flex-col sm:flex-row gap-4 opacity-80 bg-slate-50">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-muted-foreground">{r.profissional?.nome ?? "Profissional"}</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto sm:ml-2 bg-emerald-100 text-emerald-800 border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Conferido
                  </Badge>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <div className="truncate">Paciente: {r.atendimento?.paciente?.nome || "Não associado"}</div>
                  <div>Data: {new Date(r.created_at).toLocaleDateString("pt-BR")}</div>
                </div>
              </div>

              <div className="flex items-center sm:justify-end border-t sm:border-t-0 sm:border-l pt-2 sm:pt-0 sm:pl-4">
                <div className="font-bold text-emerald-700">{formatBRL(Number(r.valor_repasse))}</div>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
