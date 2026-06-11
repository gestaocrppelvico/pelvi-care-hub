import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Link2, Search, User, Calendar, Type } from "lucide-react";
import { format, parseISO, subDays, addDays } from "date-fns";
import { toast } from "sonner";

export default function VinculoPacientes() {
  const navigate = useNavigate();
  const { isAdmin, isSecretaria } = useAuth();

  const [atendimentosOrfaos, setAtendimentosOrfaos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para o Modal de Vínculo
  const [modalAberto, setModalAberto] = useState(false);
  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState<any>(null);
  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [pacientesEncontrados, setPacientesEncontrados] = useState<any[]>([]);

  // Carrega os atendimentos que não possuem paciente_id associado
  const carregarAtendimentosOrfaos = async () => {
    setLoading(true);
    try {
      const hoje = new Date();
      // Limite inferior: 30 dias atrás
      const dataInicial = subDays(hoje, 30).toISOString();
      // Limite superior: 15 dias para frente
      const dataFinal = addDays(hoje, 15).toISOString();

      // ADICIONADO O 'titulo' NA BUSCA PARA PEGAR O NOME DO EVENTO DO CALENDAR
      const { data, error } = await supabase
        .from("atendimentos")
        .select("id, data_inicio, tipo, titulo, observacoes, profissional:profissionais(nome)")
        .is("paciente_id", null)
        .gte("data_inicio", dataInicial)
        .lte("data_inicio", dataFinal)
        .order("data_inicio", { ascending: false });

      if (error) throw error;
      setAtendimentosOrfaos(data || []);
    } catch (err: any) {
      toast.error("Erro ao carregar atendimentos pendentes.");
    } finally {
      setLoading(false);
    }
  };

  // Busca pacientes cadastrados conforme digita o nome
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

    const delayDebounce = setTimeout(() => {
      buscarPacientes();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [buscaPaciente]);

  useEffect(() => {
    if (isAdmin || isSecretaria) carregarAtendimentosOrfaos();
  }, [isAdmin, isSecretaria]);

  // Executa o vínculo definitivo no banco de dados
  const vincularPaciente = async (pacienteId: string, nomePaciente: string) => {
    if (!atendimentoSelecionado) return;

    try {
      const { error } = await supabase
        .from("atendimentos")
        .update({ paciente_id: pacienteId })
        .eq("id", atendimentoSelecionado.id);

      if (error) throw error;

      toast.success(`Atendimento vinculado com sucesso à ${nomePaciente}!`);
      setModalAberto(false);
      setAtendimentoSelecionado(null);
      setBuscaPaciente("");
      carregarAtendimentosOrfaos(); // Recarrega a lista leve
    } catch (err: any) {
      toast.error("Erro ao realizar vínculo: " + err.message);
    }
  };

  if (!isAdmin && !isSecretaria) {
    return <div className="p-6 text-center">Acesso restrito à administração.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Link2 className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold">Vincular Atendimentos da Agenda</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Aqui aparecem os agendamentos recentes da agenda que ainda não foram associados a um perfil de paciente do sistema. Vincule-os para liberar o CRM, histórico e prontuários.
      </p>

      {loading ? (
        <div className="text-center p-6 text-muted-foreground animate-pulse">Buscando agendamentos pendentes...</div>
      ) : atendimentosOrfaos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground border-dashed">
          🎉 Todos os atendimentos recentes da agenda já estão devidamente vinculados!
        </Card>
      ) : (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Pendentes de Identificação ({atendimentosOrfaos.length})
          </h3>
          
          {atendimentosOrfaos.map((atend) => (
            <Card key={atend.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm border-l-4 border-l-amber-500">
              <div className="space-y-1.5">
                
                {/* NOME DO EVENTO EM DESTAQUE AQUI */}
                <div className="text-base font-bold text-blue-700 flex items-center gap-1.5">
                  <Type className="w-4 h-4 text-blue-500" />
                  {atend.titulo || atend.observacoes || "Evento sem título"}
                </div>

                <div className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {format(parseISO(atend.data_inicio), "dd/MM/yyyy 'às' HH:mm")}
                </div>
                
                <div className="text-xs text-muted-foreground flex items-center gap-4">
                  <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> Fisioterapeuta: {atend.profissional?.nome || "Não informado"}</span>
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-medium">{atend.tipo}</span>
                </div>
              </div>

              <Button 
                size="sm" 
                onClick={() => { setAtendimentoSelecionado(atend); setModalAberto(true); }}
                className="bg-blue-600 hover:bg-blue-700 shrink-0 mt-2 sm:mt-0"
              >
                <Link2 className="w-4 h-4 mr-1.5" /> Vincular Paciente
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* MODAL DE BUSCA DO PACIENTE REAL */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Escolha o Paciente do Sistema</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="p-2 bg-blue-50 border border-blue-100 rounded text-xs text-blue-800">
              Vinculando o evento: <strong>{atendimentoSelecionado?.titulo || "Sem título"}</strong>
            </div>

            <div className="space-y-1.5">
              <Label>Digitar nome do paciente</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ex: Maria Silva..."
                  value={buscaPaciente}
                  onChange={(e) => setBuscaPaciente(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Resultados do cadastro</Label>
              {pacientesEncontrados.length === 0 && buscaPaciente.trim().length >= 2 && (
                <p className="text-xs text-amber-600 italic">Nenhum paciente cadastrado com este nome.</p>
              )}
              {buscaPaciente.trim().length < 2 && (
                <p className="text-xs text-muted-foreground italic">Digite pelo menos 2 letras para pesquisar.</p>
              )}

              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {pacientesEncontrados.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => vincularPaciente(p.id, p.nome)}
                    className="w-full p-2 text-left rounded-lg border hover:bg-blue-50/50 hover:border-blue-200 transition-colors flex items-center justify-between text-sm group"
                  >
                    <div>
                      <div className="font-medium text-slate-800 group-hover:text-blue-700">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">{p.telefone || "Sem telefone"}</div>
                    </div>
                    <Link2 className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
