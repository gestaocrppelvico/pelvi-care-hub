import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Clock, CheckCircle, Filter, Save } from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface AtendimentoPendente {
  id: string;
  data_inicio: string;
  paciente_id: string;
  profissional_id: string;
  paciente_nome: string;
  paciente_telefone: string | null;
  profissional_nome: string;
  profissional_cor: string | null;
}

export default function EvolucoesPendentes() {
  const navigate = useNavigate();
  const { user, isAdmin, isSecretaria, isFisio } = useAuth();

  const [pendentes, setPendentes] = useState<AtendimentoPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [meuProfId, setMeuProfId] = useState<string | null>(null);
  const [profissionais, setProfissionais] = useState<{ id: string; nome: string; cor_agenda: string | null }[]>([]);
  const [filtroProfissional, setFiltroProfissional] = useState<string>("");

  const [modalAberto, setModalAberto] = useState(false);
  const [atendimentoAtual, setAtendimentoAtual] = useState<AtendimentoPendente | null>(null);
  const [form, setForm] = useState({
    evolucao: "",
    conduta: "",
    escala_dor: "",
    alta_medica: false,
  });
  const [salvando, setSalvando] = useState(false);
  const [evolvidosIds, setEvolvidosIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function init() {
      if (!user) return;
      const { data: prof } = await supabase
        .from("profissionais")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      setMeuProfId(prof?.id ?? null);

      if (isAdmin || isSecretaria) {
        const { data: profs } = await supabase
          .from("profissionais")
          .select("id, nome, cor_agenda")
          .eq("ativo", true)
          .order("nome");
        setProfissionais(profs ?? []);
      }
    }
    init();
  }, [user, isAdmin, isSecretaria]);

  useEffect(() => {
    if (meuProfId !== null || isAdmin || isSecretaria) {
      carregar(meuProfId);
    }
  }, [meuProfId, filtroProfissional, isAdmin, isSecretaria]);

  async function carregar(meuId: string | null) {
    setLoading(true);
    try {
      const limite = new Date();
      limite.setHours(limite.getHours() - 48);

      let query = supabase
        .from("atendimentos")
        .select(`
          id, data_inicio, paciente_id, profissional_id,
          paciente:pacientes(nome, telefone),
          profissional:profissionais(nome, cor_agenda)
        `)
        .eq("status", "realizado")
        .lt("data_inicio", limite.toISOString())
        .order("data_inicio", { ascending: true });

      if (isFisio && !isAdmin && !isSecretaria && meuId) {
        query = query.eq("profissional_id", meuId);
      } else if (filtroProfissional) {
        query = query.eq("profissional_id", filtroProfissional);
      }

      const { data: atendimentos, error } = await query;
      if (error) throw error;

      const idsAtend = (atendimentos ?? []).map((a: any) => a.id);
      let comEvolucao: Set<string> = new Set();

      if (idsAtend.length > 0) {
        const { data: pronts } = await supabase
          .from("prontuarios")
          .select("atendimento_id")
          .eq("tipo", "evolucao")
          .in("atendimento_id", idsAtend);
        comEvolucao = new Set((pronts ?? []).map((p: any) => p.atendimento_id).filter(Boolean));
      }

      const semEvolucao = (atendimentos ?? []).filter((a: any) => !comEvolucao.has(a.id));

      const lista: AtendimentoPendente[] = semEvolucao.map((a: any) => ({
        id: a.id,
        data_inicio: a.data_inicio,
        paciente_id: a.paciente_id,
        profissional_id: a.profissional_id,
        paciente_nome: a.paciente?.nome ?? "—",
        paciente_telefone: a.paciente?.telefone ?? null,
        profissional_nome: a.profissional?.nome ?? "—",
        profissional_cor: a.profissional?.cor_agenda ?? null,
      }));

      setPendentes(lista);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao carregar evoluções pendentes");
    } finally {
      setLoading(false);
    }
  }

  function abrirModal(at: AtendimentoPendente) {
    setAtendimentoAtual(at);
    setForm({ evolucao: "", conduta: "", escala_dor: "", alta_medica: false });
    setModalAberto(true);
  }

  async function salvarEvolucao() {
    if (!atendimentoAtual) return;
    if (!form.evolucao.trim()) {
      toast.error("Preencha a evolução");
      return;
    }
    setSalvando(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      const { error } = await supabase.from("prontuarios").insert({
        paciente_id: atendimentoAtual.paciente_id,
        profissional_id: atendimentoAtual.profissional_id,
        atendimento_id: atendimentoAtual.id,
        tipo: "evolucao",
        evolucao_livre: form.evolucao.trim(),
        conduta: form.conduta.trim() || null,
        escala_dor: form.escala_dor ? parseInt(form.escala_dor) : null,
        alta_medica: form.alta_medica,
        data_sessao: atendimentoAtual.data_inicio,
      });

      if (error) throw error;

      setEvolvidosIds(prev => new Set([...prev, atendimentoAtual.id]));
      toast.success("Evolução registrada!");
      setModalAberto(false);

      const idEvolvido = atendimentoAtual.id;
      setTimeout(() => {
        setPendentes(prev => prev.filter(p => p.id !== idEvolvido));
        setEvolvidosIds(prev => {
          const novo = new Set(prev);
          novo.delete(idEvolvido);
          return novo;
        });
      }, 2000);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Evoluções Pendentes</h1>
          <p className="text-xs text-muted-foreground">
            Sessões realizadas há mais de 48h sem evolução registrada
          </p>
        </div>
      </div>

      {(isAdmin || isSecretaria) && profissionais.length > 0 && (
        <Card className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Profissional:</span>
            <Button
              size="sm"
              variant={filtroProfissional === "" ? "default" : "ghost"}
              onClick={() => setFiltroProfissional("")}
              className="h-7 text-xs"
            >
              Todas
            </Button>
            {profissionais.map(p => {
              const ativo = filtroProfissional === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setFiltroProfissional(ativo ? "" : p.id)}
                  className={`h-7 text-xs px-3 rounded-full font-medium border transition-all ${
                    ativo ? "ring-2 ring-offset-1" : "opacity-70 hover:opacity-100"
                  }`}
                  style={{
                    backgroundColor: (p.cor_agenda || "#94a3b8") + (ativo ? "30" : "15"),
                    borderColor: p.cor_agenda || "#94a3b8",
                    color: p.cor_agenda || "#64748b",
                  }}
                >
                  {p.nome.split(" ")[0]}
                </button>
              );
            })}
            <Badge variant="outline" className="ml-auto text-[10px] h-6">
              {pendentes.length} pendente{pendentes.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-10 text-muted-foreground animate-pulse">Carregando...</div>
      ) : pendentes.length === 0 ? (
        <Card className="p-10 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">Tudo em dia! 🎉</p>
          <p className="text-xs text-muted-foreground mt-1">Nenhuma evolução pendente.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {pendentes.map(at => {
            const cor = at.profissional_cor || "#94a3b8";
            const diasAtraso = differenceInDays(new Date(), new Date(at.data_inicio));
            const evolvido = evolvidosIds.has(at.id);

            return (
              <div
                key={at.id}
                className={`rounded-lg border-l-4 shadow-sm bg-white transition-all ${
                  evolvido ? "opacity-40 border-l-emerald-500" : ""
                }`}
                style={!evolvido ? { borderLeftColor: cor } : {}}
              >
                <div className="p-3" style={!evolvido ? { backgroundColor: cor + "10" } : {}}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-800 text-sm truncate">
                        {at.paciente_nome}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
                        <div>
                          <Clock className="w-3 h-3 inline mr-1" />
                          Sessão: {format(new Date(at.data_inicio), "dd/MM/yyyy 'às' HH:mm")}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: cor }}
                          />
                          <span>{at.profissional_nome}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge className={
                        diasAtraso >= 5
                          ? "bg-rose-100 text-rose-700 border border-rose-300 text-[10px] font-bold"
                          : diasAtraso >= 3
                          ? "bg-orange-100 text-orange-700 border border-orange-300 text-[10px] font-bold"
                          : "bg-amber-100 text-amber-700 border border-amber-300 text-[10px] font-bold"
                      }>
                        ⏱️ {diasAtraso}d
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-3">
                    {evolvido ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300 text-[11px] w-full justify-center py-1.5">
                        <CheckCircle className="w-3 h-3 mr-1" /> Evolução registrada
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => abrirModal(at)}
                        className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700"
                      >
                        Evoluir agora →
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Evolução</DialogTitle>
          </DialogHeader>
          {atendimentoAtual && (
            <div className="space-y-4 pt-2">
              <div className="text-xs bg-slate-50 border rounded p-3 space-y-1">
                <div><span className="font-medium">Paciente:</span> {atendimentoAtual.paciente_nome}</div>
                <div><span className="font-medium">Sessão:</span> {format(new Date(atendimentoAtual.data_inicio), "dd/MM/yyyy 'às' HH:mm")}</div>
                <div><span className="font-medium">Profissional:</span> {atendimentoAtual.profissional_nome}</div>
              </div>

              <div className="space-y-1.5">
                <Label>Evolução *</Label>
                <Textarea
                  value={form.evolucao}
                  onChange={(e) => setForm({ ...form, evolucao: e.target.value })}
                  rows={5}
                  placeholder="Descreva a evolução da sessão..."
                />
              </div>

              <div className="space-y-1.5">
                <Label>Conduta</Label>
                <Textarea
                  value={form.conduta}
                  onChange={(e) => setForm({ ...form, conduta: e.target.value })}
                  rows={3}
                  placeholder="Condutas e orientações..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Escala de dor (0-10)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={form.escala_dor}
                    onChange={(e) => setForm({ ...form, escala_dor: e.target.value })}
                    placeholder="Ex: 5"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={form.alta_medica}
                      onChange={(e) => setForm({ ...form, alta_medica: e.target.checked })}
                      className="accent-purple-600 w-4 h-4"
                    />
                    <span className="font-medium text-purple-700">🏁 Alta fisio</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setModalAberto(false)}
                  disabled={salvando}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={salvarEvolucao}
                  disabled={salvando}
                >
                  <Save className="w-4 h-4 mr-1" />
                  {salvando ? "Salvando..." : "Salvar Evolução"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
