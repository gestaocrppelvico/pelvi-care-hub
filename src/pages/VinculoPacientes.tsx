import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Link2, Search, User, Calendar, Type, Filter, ArrowDownUp, ListChecks } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";

export default function VinculoPacientes() {
  const navigate = useNavigate();
  const { isAdmin, isSecretaria } = useAuth();

  const [atendimentosOrfaos, setAtendimentosOrfaos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros e Ordenação
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroProf, setFiltroProf] = useState("todos");
  const [ordem, setOrdem] = useState("asc");

  // Estados para o Modal de Vínculo Individual
  const [modalAberto, setModalAberto] = useState(false);
  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState<any>(null);
  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [pacientesEncontrados, setPacientesEncontrados] = useState<any[]>([]);

  // Estados para o Modal de Vínculo em Lote
  const [modalBulkAberto, setModalBulkAberto] = useState(false);
  const [bulkInfo, setBulkInfo] = useState({ pacienteId: "", pacienteNome: "", matches: [] as any[] });

  // 🔥 Carrega apenas os atendimentos órfãos do mês corrente
  const carregarAtendimentosOrfaos = async () => {
    setLoading(true);
    try {
      const hoje = new Date();
      const inicioMes = startOfMonth(hoje).toISOString();
      const fimMes = endOfMonth(hoje).toISOString();

      const { data, error } = await supabase
        .from("atendimentos")
        .select("*, profissional:profissionais(nome)")
        .is("paciente_id", null)
        .gte("data_inicio", inicioMes)
        .lte("data_inicio", fimMes);

      if (error) throw error;
      
      setAtendimentosOrfaos(data || []);
    } catch (err: any) {
      toast.error("Erro ao carregar atendimentos pendentes.");
    } finally {
      setLoading(false);
    }
  };

  // Debounce para busca de paciente
  useEffect(() => {
    const buscarPacientes = async () => {
      if (buscaPaciente.trim().length < 2) {
        setPacientesEncontrados([]);
        return;
      }
      try {
        const { data } = await supabase
          .from("pacientes")
          .select("id, nome, telefone")
          .ilike("nome", `%${buscaPaciente}%`)
          .limit(5);
        setPacientesEncontrados(data || []);
      } catch (err) {
        console.error(err);
      }
    };

    const delayDebounce = setTimeout(() => buscarPacientes(), 300);
    return () => clearTimeout(delayDebounce);
  }, [buscaPaciente]);

  useEffect(() => {
    if (isAdmin || isSecretaria) carregarAtendimentosOrfaos();
  }, [isAdmin, isSecretaria]);

  const getNomeEvento = (atend: any) => {
    return atend.nome_paciente_livre || atend.observacoes || "Evento não identificado";
  };

  // Lógica de filtragem e ordenação
  const listaFiltrada = useMemo(() => {
    return atendimentosOrfaos
      .filter(a => {
        const nome = getNomeEvento(a).toLowerCase();
        const prof = (a.profissional?.nome || "").toLowerCase();
        const passaTexto = nome.includes(filtroTexto.toLowerCase());
        const passaProf = filtroProf === "todos" || prof === filtroProf;
        return passaTexto && passaProf;
      })
      .sort((a, b) => {
        const tA = new Date(a.data_inicio).getTime();
        const tB = new Date(b.data_inicio).getTime();
        return ordem === "asc" ? tA - tB : tB - tA;
      });
  }, [atendimentosOrfaos, filtroTexto, filtroProf, ordem]);

  const profissionaisUnicos = useMemo(() => {
    const nomes = atendimentosOrfaos.map(a => a.profissional?.nome).filter(Boolean);
    return Array.from(new Set(nomes));
  }, [atendimentosOrfaos]);

  // Lógica de vinculação
  const handleSelecionarPaciente = (pacienteId: string, pacienteNome: string) => {
    if (!atendimentoSelecionado) return;

    const nomeAlvo = getNomeEvento(atendimentoSelecionado).trim().toLowerCase();
    
    const matches = atendimentosOrfaos.filter(a => 
      a.id !== atendimentoSelecionado.id && 
      getNomeEvento(a).trim().toLowerCase() === nomeAlvo
    );

    if (matches.length > 0) {
      setBulkInfo({ pacienteId, pacienteNome, matches });
      setModalAberto(false);
      setModalBulkAberto(true);
    } else {
      efetivarVinculo(pacienteId, pacienteNome, [atendimentoSelecionado.id]);
    }
  };

  const efetivarVinculo = async (pacienteId: string, nomePaciente: string, idsParaVincular: string[]) => {
    try {
      const { error } = await supabase
        .from("atendimentos")
        .update({ paciente_id: pacienteId })
        .in("id", idsParaVincular);

      if (error) throw error;

      toast.success(idsParaVincular.length > 1 
        ? `${idsParaVincular.length} atendimentos vinculados a ${nomePaciente}!` 
        : `Atendimento vinculado a ${nomePaciente}!`
      );
      
      setModalAberto(false);
      setModalBulkAberto(false);
      setAtendimentoSelecionado(null);
      setBuscaPaciente("");
      carregarAtendimentosOrfaos(); 
    } catch (err: any) {
      toast.error("Erro ao realizar vínculo: " + err.message);
    }
  };

  if (!isAdmin && !isSecretaria) return <div className="p-6 text-center">Acesso restrito à administração.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Link2 className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold">Auditoria de Agenda</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Vincule os agendamentos "órfãos" vindos do Google Calendar aos cadastros oficiais dos pacientes para liberar prontuários e financeiro.
      </p>

      {/* BARRA DE FILTROS */}
      <Card className="p-3 bg-slate-50/50 flex flex-col md:flex-row gap-3 shadow-sm border-blue-100">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nome do evento..." 
            className="pl-9 bg-white" 
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          <div className="w-[180px]">
            <Select value={filtroProf} onValueChange={setFiltroProf}>
              <SelectTrigger className="bg-white text-xs h-10">
                <Filter className="w-3.5 h-3.5 mr-1.5" /> <SelectValue placeholder="Profissional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as agendas</SelectItem>
                {profissionaisUnicos.map(p => (
                  <SelectItem key={p} value={p.toLowerCase()}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="w-[160px]">
            <Select value={ordem} onValueChange={setOrdem}>
              <SelectTrigger className="bg-white text-xs h-10">
                <ArrowDownUp className="w-3.5 h-3.5 mr-1.5" /> <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Mais Antigos/Próximos</SelectItem>
                <SelectItem value="desc">Mais Recentes/Futuros</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="text-center p-10 text-muted-foreground animate-pulse">Buscando pendências...</div>
      ) : atendimentosOrfaos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground border-dashed">
          🎉 Nenhum atendimento órfão no mês corrente!
        </Card>
      ) : (
        <div className="space-y-2 mt-2">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">
              {listaFiltrada.length} Pendentes neste mês
            </h3>
          </div>
          
          {listaFiltrada.length === 0 && (
            <div className="text-center p-6 text-sm text-muted-foreground">Nenhum resultado para os filtros atuais.</div>
          )}

          {listaFiltrada.map((atend) => (
            <Card key={atend.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm border-l-4 border-l-amber-500 hover:border-l-blue-500 transition-colors">
              <div className="space-y-1.5">
                <div className="text-base font-bold text-blue-700 flex items-center gap-1.5">
                  <Type className="w-4 h-4 text-blue-500" />
                  {getNomeEvento(atend)}
                </div>

                <div className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {format(parseISO(atend.data_inicio), "dd/MM/yyyy 'às' HH:mm")}
                </div>
                
                <div className="text-xs text-muted-foreground flex items-center gap-4">
                  <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {atend.profissional?.nome || "Sem profissional"}</span>
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-medium">{atend.tipo || "Não definido"}</span>
                </div>
              </div>

              <Button 
                size="sm" 
                onClick={() => { setAtendimentoSelecionado(atend); setModalAberto(true); }}
                className="bg-blue-600 hover:bg-blue-700 shrink-0 mt-2 sm:mt-0"
              >
                <Link2 className="w-4 h-4 mr-1.5" /> Vincular
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* MODAIS (mantidos iguais) */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Escolha o Paciente do Sistema</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="p-2 bg-blue-50 border border-blue-100 rounded text-xs text-blue-800">
              Alvo: <strong>{atendimentoSelecionado ? getNomeEvento(atendimentoSelecionado) : ""}</strong>
            </div>

            <div className="space-y-1.5">
              <Label>Digitar nome do paciente</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Ex: Maria Silva..." value={buscaPaciente} onChange={(e) => setBuscaPaciente(e.target.value)} className="pl-9" autoFocus />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Resultados do cadastro</Label>
              {pacientesEncontrados.length === 0 && buscaPaciente.trim().length >= 2 && (
                <p className="text-xs text-amber-600 italic">Nenhum paciente cadastrado com este nome.</p>
              )}

              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {pacientesEncontrados.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelecionarPaciente(p.id, p.nome)}
                    className="w-full p-2 text-left rounded-lg border hover:bg-blue-50/50 hover:border-blue-200 transition-colors flex items-center justify-between text-sm group"
                  >
                    <div>
                      <div className="font-medium text-slate-800 group-hover:text-blue-700">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">{p.telefone || "Sem telefone"}</div>
                    </div>
                    <Link2 className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modalBulkAberto} onOpenChange={setModalBulkAberto}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <ListChecks className="w-5 h-5" /> Múltiplas Sessões Encontradas!
            </DialogTitle>
            <DialogDescription className="pt-2">
              O sistema encontrou <strong>{bulkInfo.matches.length}</strong> outros agendamentos pendentes com o mesmo nome na agenda.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-2 space-y-3">
            <p className="text-sm text-slate-600">
              Deseja vincular <strong>todas as {bulkInfo.matches.length + 1} sessões</strong> ao cadastro de <strong>{bulkInfo.pacienteNome}</strong> de uma só vez?
            </p>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button 
              variant="outline" 
              onClick={() => efetivarVinculo(bulkInfo.pacienteId, bulkInfo.pacienteNome, [atendimentoSelecionado.id])}
            >
              Não, vincular só esta
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                const todosIds = [atendimentoSelecionado.id, ...bulkInfo.matches.map(m => m.id)];
                efetivarVinculo(bulkInfo.pacienteId, bulkInfo.pacienteNome, todosIds);
              }}
            >
              Sim, vincular todas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
