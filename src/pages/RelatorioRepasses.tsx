import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { ArrowLeft, Printer, TrendingUp, Calculator, FileText, Activity } from "lucide-react";
import { toast } from "sonner";

interface Repasse {
  id: string;
  valor_atendimento: number;
  valor_repasse: number;
  status: string;
  created_at: string;
  profissional?: { id: string; nome: string };
  atendimento?: { tipo: string; paciente?: { nome: string } };
}

export default function RelatorioRepasses() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [repasses, setRepasses] = useState<Repasse[]>([]);
  
  // Lista de profissionais para o filtro
  const [profissionaisLista, setProfissionaisLista] = useState<{id: string, nome: string}[]>([]);

  // Estado dos filtros (Padrão: Mês atual)
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [filtroFisio, setFiltroFisio] = useState("todos");

  // Busca os profissionais apenas uma vez para montar o menu de filtros
  useEffect(() => {
    supabase.from("profissionais").select("id, nome").then(({ data }) => {
      if (data) setProfissionaisLista(data);
    });
  }, []);

  // Função que vai ao banco de dados buscar os repasses do período selecionado
  async function gerarRelatorio() {
    if (!dataInicio || !dataFim) {
      toast.error("Preencha a data de início e fim.");
      return;
    }

    setLoading(true);
    let query = supabase
      .from("repasses_atendimento")
      .select(`
        id, valor_atendimento, valor_repasse, status, created_at,
        profissional:profissionais(id, nome),
        atendimento:atendimentos(tipo, paciente:pacientes(nome))
      `)
      .gte("created_at", `${dataInicio}T00:00:00.000Z`)
      .lte("created_at", `${dataFim}T23:59:59.999Z`)
      .order("created_at", { ascending: true });

    if (filtroFisio !== "todos") {
      query = query.eq("profissional_id", filtroFisio);
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Erro ao gerar relatório: " + error.message);
    } else {
      setRepasses((data as any[]) || []);
      if (data?.length === 0) toast.info("Nenhum repasse encontrado neste período.");
    }
    setLoading(false);
  }

  // ---- CÁLCULOS SINTÉTICOS (Resumo Financeiro) ----
  const { totalReceita, totalRepasses, lucroBruto, margemLucro, resumoPorProfissional } = useMemo(() => {
    let rec = 0;
    let rep = 0;
    const mapaFisio = new Map<string, { nome: string; receita: number; repasse: number; qtd: number }>();

    repasses.forEach((r) => {
      const valRec = Number(r.valor_atendimento) || 0;
      const valRep = Number(r.valor_repasse) || 0;
      const fisioId = r.profissional?.id || "sem-id";
      const fisioNome = r.profissional?.nome || "Desconhecido";

      rec += valRec;
      rep += valRep;

      // Agrupando para a tabela sintética de profissionais
      const atual = mapaFisio.get(fisioId) || { nome: fisioNome, receita: 0, repasse: 0, qtd: 0 };
      mapaFisio.set(fisioId, {
        nome: fisioNome,
        receita: atual.receita + valRec,
        repasse: atual.repasse + valRep,
        qtd: atual.qtd + 1,
      });
    });

    const lucro = rec - rep;
    const margem = rec > 0 ? (lucro / rec) * 100 : 0;

    return {
      totalReceita: rec,
      totalRepasses: rep,
      lucroBruto: lucro,
      margemLucro: margem,
      resumoPorProfissional: Array.from(mapaFisio.values()),
    };
  }, [repasses]);

  function formatBRL(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  return (
    <div className="space-y-6 pb-12">
      {/* CABEÇALHO (Oculto na impressão) */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Relatório Analítico de Repasses</h1>
            <p className="text-sm text-muted-foreground">Visão sintética e detalhada das operações</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => window.print()} disabled={repasses.length === 0} className="gap-2">
          <Printer className="w-4 h-4" /> Imprimir / PDF
        </Button>
      </div>

      {/* ÁREA DE FILTROS (Oculta na impressão) */}
      <Card className="p-4 print:hidden bg-muted/30 border-dashed">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Data Início</label>
            <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Data Fim</label>
            <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Fisioterapeuta</label>
            <Select value={filtroFisio} onValueChange={setFiltroFisio}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Toda a Equipe</SelectItem>
                {profissionaisLista.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={gerarRelatorio} disabled={loading} className="w-full font-semibold">
            {loading ? "Processando..." : "Gerar Relatório"}
          </Button>
        </div>
      </Card>

      {/* CABEÇALHO EXCLUSIVO PARA IMPRESSÃO */}
      <div className="hidden print:block text-center mb-8 border-b pb-4">
        <h1 className="text-2xl font-bold uppercase tracking-wider">Relatório de Repasses</h1>
        <p className="text-muted-foreground">Período: {format(parseISO(dataInicio), "dd/MM/yyyy")} a {format(parseISO(dataFim), "dd/MM/yyyy")}</p>
        {filtroFisio !== "todos" && <p className="text-muted-foreground font-medium mt-1">Filtro: Fisioterapeuta Específico</p>}
      </div>

      {repasses.length > 0 && (
        <div className="space-y-8">
          
          {/* SESSÃO 1: SINTÉTICO (Resumo Geral) */}
          <section className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 border-b pb-2">
              <Activity className="w-5 h-5 text-primary" /> Visão Sintética Geral
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4 border-l-4 border-l-blue-500">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3"/> Total Faturado</div>
                <div className="text-xl font-bold">{formatBRL(totalReceita)}</div>
              </Card>
              <Card className="p-4 border-l-4 border-l-amber-500">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Calculator className="w-3 h-3"/> Total Repassado</div>
                <div className="text-xl font-bold">{formatBRL(totalRepasses)}</div>
              </Card>
              <Card className="p-4 border-l-4 border-l-emerald-500">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3"/> Lucro Bruto</div>
                <div className="text-xl font-bold text-emerald-700">{formatBRL(lucroBruto)}</div>
              </Card>
              <Card className="p-4 border-l-4 border-l-purple-500">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="w-3 h-3"/> Margem de Lucro</div>
                <div className="text-xl font-bold text-purple-700">{margemLucro.toFixed(1)}%</div>
              </Card>
            </div>

            {/* Tabela Sintética por Profissional */}
            {filtroFisio === "todos" && (
              <div className="border rounded-lg overflow-hidden mt-6">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="p-3 font-semibold">Profissional</th>
                      <th className="p-3 font-semibold text-center">Atendimentos</th>
                      <th className="p-3 font-semibold text-right">Receita Gerada</th>
                      <th className="p-3 font-semibold text-right">Repasse Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {resumoPorProfissional.map((res, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="p-3 font-medium">{res.nome}</td>
                        <td className="p-3 text-center">{res.qtd}</td>
                        <td className="p-3 text-right">{formatBRL(res.receita)}</td>
                        <td className="p-3 text-right text-amber-600 font-medium">{formatBRL(res.repasse)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* SESSÃO 2: ANALÍTICO (Linha a linha) */}
          <section className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 border-b pb-2 mt-8">
              <FileText className="w-5 h-5 text-primary" /> Visão Analítica Detalhada
            </h2>
            
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-800 text-slate-100">
                  <tr>
                    <th className="p-3 font-medium">Data</th>
                    <th className="p-3 font-medium">Paciente</th>
                    <th className="p-3 font-medium">Serviço/Guia</th>
                    <th className="p-3 font-medium">Profissional</th>
                    <th className="p-3 font-medium text-right">Base Faturada</th>
                    <th className="p-3 font-medium text-right">Repasse</th>
                    <th className="p-3 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-card text-foreground">
                  {repasses.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/50 transition-colors">
                      <td className="p-3 text-xs">{format(parseISO(r.created_at), "dd/MM/yyyy")}</td>
                      <td className="p-3 font-medium">{r.atendimento?.paciente?.nome || "N/A"}</td>
                      <td className="p-3 text-xs text-muted-foreground">{r.atendimento?.tipo || "Geral"}</td>
                      <td className="p-3">{r.profissional?.nome || "N/A"}</td>
                      <td className="p-3 text-right">{formatBRL(Number(r.valor_atendimento))}</td>
                      <td className="p-3 text-right font-semibold text-amber-600">{formatBRL(Number(r.valor_repasse))}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider ${
                          r.status === 'pago' ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {r.status === 'pago' ? 'Conferido' : 'Pendente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
