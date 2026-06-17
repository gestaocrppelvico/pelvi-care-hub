import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { format, addDays, addWeeks, addMonths, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameMonth, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, RefreshCw, ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon } from "lucide-react";

interface Atendimento {
  id: string;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  tipo: string;
  nome_paciente_livre: string | null;
  telefone_contato: string | null;
  paciente_id: string | null;
  paciente: { nome: string; telefone: string | null } | null;
  profissional: { id: string; nome: string; cor_agenda: string } | null;
  profissional_id: string | null;
}

export default function Agenda() {
  const { isSecretaria, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const profFiltroUrl = searchParams.get("profissional");

  // Estados de Controle da Grade
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados do Formulário/Sheet de Edição
  const [selectedAtend, setSelectedAtend] = useState<Atendimento | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [statusForm, setStatusForm] = useState("agendado");
  const [busy, setBusy] = useState(false);

  // Carrega os atendimentos do banco de dados
  const carregarAtendimentos = useCallback(async () => {
    setLoading(true);
    try {
      let start: Date;
      let end: Date;

      if (view === "day") {
        start = startOfDay(currentDate);
        end = endOfDay(currentDate);
      } else if (view === "week") {
        start = startOfWeek(currentDate, { weekStartsOn: 1 });
        end = endOfWeek(currentDate, { weekStartsOn: 1 });
      } else {
        start = startOfMonth(currentDate);
        end = endOfMonth(currentDate);
      }

      let query = supabase
        .from("atendimentos")
        .select("id, data_inicio, data_fim, status, tipo, nome_paciente_livre, telefone_contato, paciente_id, paciente:pacientes(nome, telefone), profissional:profissionais(id, nome, cor_agenda), profissional_id")
        .gte("data_inicio", start.toISOString())
        .lte("data_inicio", end.toISOString());

      if (profFiltroUrl) {
        query = query.eq("profissional_id", profFiltroUrl);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAtendimentos((data as any[]) || []);
    } catch (err: any) {
      toast.error("Erro ao carregar agenda: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [view, currentDate, profFiltroUrl]);

  useEffect(() => {
    carregarAtendimentos();
  }, [carregarAtendimentos]);

  const mapeamentoDias = useMemo(() => {
    const mapa = new Map<string, Atendimento[]>();
    atendimentos.forEach((at) => {
      const chave = format(new Date(at.data_inicio), "yyyy-MM-dd");
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(at);
    });
    return mapa;
  }, [atendimentos]);

  const abrirEdicao = (at: Atendimento) => {
    setSelectedAtend(at);
    setStatusForm(at.status);
    setSheetOpen(true);
  };

  // ----------------------------------------------------------------------
  // FUNÇÃO REESCRITA COM AS TRAVAS ORIGINAIS DE VERIFICAÇÃO DE SALDO E VÍNCULO
  // ----------------------------------------------------------------------
  const handleSalvarStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAtend) return;

    setBusy(true);
    try {
      // REGRA: Apenas aplicar validações se a tentativa for de dar CHECK-IN (Realizado)
      if (statusForm === "realizado") {
        
        // 1. O Paciente DEVE estar cadastrado (vínculo de paciente_id existe)
        if (!selectedAtend.paciente_id) {
          toast.error("Ação bloqueada: Este paciente não possui cadastro no sistema. Edite o agendamento e vincule a uma ficha antes de dar o check-in.");
          setBusy(false);
          return;
        }

        // 2. O Paciente DEVE ter um pacote ativo com pelo menos 1 sessão restante
        const { data: pacotes, error: pacotesError } = await supabase
          .from("paciente_pacotes")
          .select("id, sessoes_restantes")
          .eq("paciente_id", selectedAtend.paciente_id)
          .gt("sessoes_restantes", 0);

        if (pacotesError) throw pacotesError;

        if (!pacotes || pacotes.length === 0) {
          toast.error("Ação bloqueada: Paciente sem sessões disponíveis. Lance um novo pacote ou venda avulsa no financeiro do paciente.");
          setBusy(false);
          return;
        }
      }

      // Se passou nas travas (ou se for falta/cancelado), grava a alteração
      const { error } = await supabase
        .from("atendimentos")
        .update({ status: statusForm })
        .eq("id", selectedAtend.id);

      if (error) throw error;

      toast.success("Status do agendamento atualizado com sucesso!");
      setSheetOpen(false);
      carregarAtendimentos();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAnterior = () => {
    if (view === "day") setCurrentDate(prev => addDays(prev, -1));
    else if (view === "week") setCurrentDate(prev => addWeeks(prev, -1));
    else setCurrentDate(prev => addMonths(prev, -1));
  };

  const handleProximo = () => {
    if (view === "day") setCurrentDate(prev => addDays(prev, 1));
    else if (view === "week") setCurrentDate(prev => addWeeks(prev, 1));
    else setCurrentDate(prev => addMonths(prev, 1));
  };

  const obterEstiloCard = (status: string, corProfissional?: string) => {
    if (status === "faltou") {
      return "border-l-4 border-slate-400 bg-slate-100/80 text-slate-400 shadow-none opacity-70";
    }
    if (status === "realizado") {
      return "border-l-4 border-emerald-500 bg-emerald-50/40 text-emerald-900";
    }
    if (status === "cancelado") {
      return "border-l-4 border-red-300 bg-red-50/30 text-red-400 line-through";
    }
    return `border-l-4 bg-white text-slate-800 shadow-sm`;
  };

  return (
    <div className="space-y-4 p-2 max-w-7xl mx-auto">
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3 rounded-xl border shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleAnterior}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" onClick={() => setCurrentDate(new Date())} className="text-xs font-semibold">Hoje</Button>
          <Button variant="outline" size="icon" onClick={handleProximo}><ChevronRight className="w-4 h-4" /></Button>
          <h2 className="text-base font-bold capitalize text-slate-700 ml-1">
            {format(currentDate, view === "month" ? "MMMM 'de' yyyy" : "dd 'de' MMMM", { locale: ptBR })}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg self-stretch sm:self-auto">
          {(["day", "week", "month"] as const).map((v) => (
            <Button
              key={v}
              variant={view === v ? "default" : "ghost"}
              size="sm"
              onClick={() => setView(v)}
              className="text-xs capitalize flex-1 sm:flex-none font-semibold h-8"
            >
              {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}
            </Button>
          ))}
          <Button variant="outline" size="icon" onClick={carregarAtendimentos} className="h-8 w-8 bg-white"><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {profFiltroUrl && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 p-2 rounded-lg text-xs font-semibold text-center">
          📌 A filtrar agenda por profissional selecionado no painel.
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground animate-pulse">A sintonizar os horários...</div>
      ) : view === "day" ? (
        <div className="space-y-2">
          {atendimentos.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed rounded-xl bg-white text-muted-foreground text-sm">Nenhum atendimento agendado para este dia.</div>
          ) : (
            atendimentos.map((at) => (
              <div
                key={at.id}
                onClick={() => abrirEdicao(at)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${obterEstiloCard(at.status)}`}
                style={at.status !== 'faltou' && at.status !== 'realizado' && at.status !== 'cancelado' && at.profissional?.cor_agenda ? { borderLeftColor: at.profissional.cor_agenda } : {}}
              >
                <div className="min-w-0 flex-1">
                  <div className={`font-bold text-sm truncate ${at.status === "faltou" ? "line-through text-slate-400" : ""}`}>
                    {at.paciente?.nome || at.nome_paciente_livre || "Sem Identificação"}
                  </div>
                  <div className="text-xs font-medium text-muted-foreground mt-0.5 flex items-center gap-2">
                    <span className="font-bold text-slate-600">{format(new Date(at.data_inicio), "HH:mm")}</span>
                    <span>•</span>
                    <span className="uppercase tracking-wider text-[10px]">{at.profissional?.nome || "Clínica"}</span>
                    <span>•</span>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-bold uppercase">{at.tipo}</Badge>
                  </div>
                </div>
                <Badge className={`text-[10px] font-bold uppercase h-5 px-2 ${
                  at.status === "realizado" ? "bg-emerald-600" : at.status === "faltou" ? "bg-slate-400" : at.status === "cancelado" ? "bg-red-400" : "bg-blue-600"
                }`}>
                  {at.status}
                </Badge>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border p-3 shadow-sm">
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-500 uppercase tracking-wider mb-2 pb-2 border-b">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {eachDayOfInterval({
              start: view === "week" ? startOfWeek(currentDate, { weekStartsOn: 1 }) : startOfMonth(currentDate),
              end: view === "week" ? endOfWeek(currentDate, { weekStartsOn: 1 }) : endOfMonth(currentDate)
            }).map((dia, idx) => {
              const chaveDia = format(dia, "yyyy-MM-dd");
              const listaEvts = mapeamentoDias.get(chaveDia) || [];
              return (
                <div key={idx} className={`min-h-[70px] p-1.5 rounded-lg border bg-slate-50/50 flex flex-col justify-between ${!isSameMonth(dia, currentDate) ? "opacity-30" : ""}`}>
                  <span className="text-xs font-bold text-slate-500">{format(dia, "d")}</span>
                  <div className="space-y-1 mt-1 flex-1 flex flex-col justify-end">
                    {listaEvts.slice(0, 2).map(ev => (
                      <div 
                        key={ev.id} 
                        onClick={() => abrirEdicao(ev)}
                        className={`text-[10px] p-1 rounded font-semibold truncate cursor-pointer ${
                          ev.status === 'faltou' ? 'bg-slate-200 text-slate-400 line-through' : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {format(new Date(ev.data_inicio), "HH:mm")} {ev.paciente?.nome?.split(" ")[0] || ev.nome_paciente_livre?.split(" ")[0]}
                      </div>
                    ))}
                    {listaEvts.length > 2 && <span className="text-[9px] text-muted-foreground text-center font-bold block">+{listaEvts.length - 2} mais</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PAINEL LATERAL (SHEET) PARA ATUALIZAÇÃO DO STATUS */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-5 space-y-4">
          <SheetHeader>
            <SheetTitle className="text-lg font-bold text-slate-800">Gerenciar Atendimento</SheetTitle>
          </SheetHeader>
          
          {selectedAtend && (
            <div className="bg-slate-50 p-3 rounded-xl border space-y-1 text-xs">
              <p className="font-bold text-sm text-slate-700">{selectedAtend.paciente?.nome || selectedAtend.nome_paciente_livre}</p>
              <p className="text-muted-foreground"><Clock className="w-3 h-3 inline mr-1" />{format(new Date(selectedAtend.data_inicio), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}</p>
              <p className="text-muted-foreground uppercase font-semibold text-[10px] tracking-wide text-blue-600 mt-1">Profissional: {selectedAtend.profissional?.nome || "Não definido"}</p>
            </div>
          )}

          <form onSubmit={handleSalvarStatus} className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label htmlFor="status" className="text-xs font-bold uppercase tracking-wider text-slate-500">Alterar Status da Sessão</Label>
              <Select value={statusForm} onValueChange={setStatusForm}>
                <SelectTrigger id="status" className="h-12 text-sm font-semibold">
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendado" className="font-medium text-blue-600">Agendado</SelectItem>
                  <SelectItem value="realizado" className="font-medium text-emerald-600">Realizado / Evoluído</SelectItem>
                  <SelectItem value="faltou" className="font-medium text-slate-500">Faltou (Enviar para Auditoria)</SelectItem>
                  <SelectItem value="cancelado" className="font-medium text-red-500">Cancelado / Desmarcado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* AVISO VISUAL DE BLOQUEIO SE O PACIENTE NÃO ESTIVER CADASTRADO */}
            {statusForm === "realizado" && !selectedAtend?.paciente_id && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800 space-y-1">
                <p className="font-bold">⚠️ Check-in Bloqueado:</p>
                <p>Este atendimento está sem paciente vinculado. Apenas marcar o nome na agenda não contabiliza o pacote. <strong>Edite o agendamento e vincule a ficha</strong> para liberar o check-in.</p>
              </div>
            )}

            {/* INFORMAÇÃO PARA FALTAS */}
            {statusForm === "faltou" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
                <p className="font-bold">💡 Informação Operacional:</p>
                <p>Marcar como <strong>Faltou</strong> colocará esta sessão em análise para os administradores. Nenhuma sessão será cobrada do paciente até a validação gerencial.</p>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-12 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50" 
              disabled={busy || (statusForm === "realizado" && !selectedAtend?.paciente_id)}
            >
              {busy ? "A atualizar..." : "Confirmar Alteração"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
