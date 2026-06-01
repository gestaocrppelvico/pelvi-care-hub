import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  format, addDays, addWeeks, addMonths, startOfDay, endOfDay,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameMonth,
  differenceInMinutes, eachDayOfInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { abrirWhatsapp } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Clock, FileText, RefreshCw, CheckCircle,
  ChevronLeft, ChevronRight, MessageCircle, ClipboardList, Trash2, Search
} from "lucide-react";

/* ───── types ───── */
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
  profissional: { nome: string; cor_agenda: string } | null;
  profissional_id: string;
  google_event_id: string | null;
}

interface PacoteCatalogo {
  id: string;
  nome: string;
  numero_sessoes: number;
  preco_total: number;
}

interface ServicoCatalogo {
  id: string;
  nome: string;
  preco: number;
}

type ViewMode = "day" | "week" | "month";

const statusLabel: Record<string, string> = {
  agendado: "Agendado",
  em_andamento: "Em andamento",
  realizado: "Realizado",
  cancelado: "Cancelado",
  faltou: "Faltou",
  faltou_sem_aviso: "Faltou s/ aviso",
};
const statusColor: Record<string, string> = {
  agendado: "secondary",
  em_andamento: "default",
  realizado: "default",
  cancelado: "destructive",
  faltou: "destructive",
  faltou_sem_aviso: "destructive",
};

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);

function displayName(a: Atendimento) { return a.paciente?.nome ?? a.nome_paciente_livre ?? "—"; }
function eventColor(a: Atendimento) { return a.profissional?.cor_agenda ?? "#9CA3AF"; }
function statusBadge(a: Atendimento) { return statusLabel[a.status] ?? a.status; }
function statusBadgeBg(a: Atendimento): string {
  const map: Record<string, string> = {
    agendado: "bg-gray-400/80", em_andamento: "bg-blue-500/80", realizado: "bg-green-500/80",
    cancelado: "bg-red-500/80", faltou: "bg-red-400/80", faltou_sem_aviso: "bg-orange-500/80",
  };
  return map[a.status] ?? "bg-gray-400/80";
}

export default function Agenda() {
  const { isSecretaria, isAdmin, isFisio, user } = useAuth();
  const podeGerenciar = isAdmin || isSecretaria;
  const [myProfissionalId, setMyProfissionalId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profissionais").select("id").eq("user_id", user.id).maybeSingle().then(({ data }) => setMyProfissionalId(data?.id ?? null));
  }, [user]);

  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [list, setList] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Atendimento | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [modoCadastroRapido, setModoCadastroRapido] = useState(false);
  const [termoBusca, setTermoBusca] = useState("");
  const [telefoneBusca, setTelefoneBusca] = useState("");
  const [sugestoesPacientes, setSugestoesPacientes] = useState<any[]>([]);
  const [pacienteSelecionado, setPacienteSelecionado] = useState<any | null>(null);
  const [pacotesAtivosPaciente, setPacotesAtivosPaciente] = useState<any[]>([]);
  const [usarPacoteExistenteId, setUsarPacoteExistenteId] = useState<string>("");
  const [tipoAtendimentoRascunho, setTipoAtendimentoRascunho] = useState<"Plano" | "Particular">("Particular");
  const [itemTipo, setItemTipo] = useState<"servico" | "pacote">("servico");
  const [listaPacotes, setListaPacotes] = useState<PacoteCatalogo[]>([]);
  const [listaServicos, setListaServicos] = useState<ServicoCatalogo[]>([]);
  const [idItemSelecionado, setIdItemSelecionado] = useState<string>("");
  const [qtdSessoesAuto, setQtdSessoesAuto] = useState<string>("1");
  const [valorTotalAuto, setValorTotalAuto] = useState<string>("");

  const pollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (selected && modoCadastroRapido) {
      setTermoBusca(selected.nome_paciente_livre || "");
      setTelefoneBusca(selected.telefone_contato || "");
    }
  }, [selected, modoCadastroRapido]);

  useEffect(() => {
    if (termoBusca.length >= 3 && !pacienteSelecionado) {
      const delay = setTimeout(async () => {
        const { data } = await supabase.from('pacientes').select('id, nome, telefone').ilike('nome', `%${termoBusca}%`).limit(5);
        setSugestoesPacientes(data || []);
      }, 300);
      return () => clearTimeout(delay);
    } else { setSugestoesPacientes([]); }
  }, [termoBusca, pacienteSelecionado]);

  async function buscarPacotesAtivos(pacienteId: string) {
    const { data } = await supabase.from('paciente_pacotes').select('id, sessoes_restantes, pacotes(nome), servicos(nome)').eq('paciente_id', pacienteId).gt('sessoes_restantes', 0).order('created_at', { ascending: false });
    setPacotesAtivosPaciente(data || []);
    setUsarPacoteExistenteId(data && data.length > 0 ? data[0].id : "");
  }

  const range = useMemo(() => {
    if (view === "day") return { start: startOfDay(anchor), end: endOfDay(anchor) };
    if (view === "week") { const s = startOfWeek(anchor, { weekStartsOn: 1 }); return { start: startOfDay(s), end: endOfDay(addDays(s, 6)) }; }
    return { start: startOfDay(startOfMonth(anchor)), end: endOfDay(endOfMonth(anchor)) };
  }, [view, anchor]);

  const carregarCatalogos = useCallback(async () => {
    const [{ data: pacotesData }, { data: servicosData }] = await Promise.all([
      supabase.from("pacotes").select("id, nome, numero_sessoes, preco_total").eq("ativo", true),
      supabase.from("servicos").select("id, nome, preco").eq("ativo", true)
    ]);
    setListaPacotes((pacotesData as any[]) ?? []);
    setListaServicos((servicosData as any[]) ?? []);
  }, []);

  useEffect(() => { carregarCatalogos(); }, [carregarCatalogos]);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase.from("atendimentos").select("id, data_inicio, data_fim, status, tipo, paciente_id, nome_paciente_livre, telefone_contato, profissional_id, google_event_id, paciente:pacientes(nome, telefone), profissional:profissionais(nome, cor_agenda)").gte("data_inicio", range.start.toISOString()).lte("data_inicio", range.end.toISOString()).not("status", "in", '("cancelado","faltou","faltou_sem_aviso")').order("data_inicio");
    setList((data as any[]) ?? []);
    if (!silent) setLoading(false);
  }, [range]);

  useEffect(() => { reload(); }, [reload]);

  const syncNow = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true);
    const body: Record<string, unknown> = { timeMin: addDays(range.start, -1).toISOString(), timeMax: addDays(range.end, 1).toISOString() };
    if (isFisio && !isAdmin && !isSecretaria && myProfissionalId) body.profissional_id = myProfissionalId;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gcal-pull`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, body: JSON.stringify(body) });
    } catch (e) { console.error(e); }
    await reload(silent);
    if (!silent) { setSyncing(false); toast.success("Agenda atualizada!"); }
  }, [isFisio, isAdmin, isSecretaria, myProfissionalId, reload, range]);

  useEffect(() => { syncNow(true); pollRef.current = setInterval(() => syncNow(true), 5 * 60 * 1000); return () => clearInterval(pollRef.current); }, [syncNow]);

  function nav(dir: -1 | 1) { setAnchor((prev) => view === "day" ? addDays(prev, dir) : view === "week" ? addWeeks(prev, dir) : addMonths(prev, dir)); }
  function goToday() { setAnchor(new Date()); }

  async function mudarStatus(id: string, novoStatus: string) {
    await supabase.from("atendimentos").update({ status: novoStatus as any }).eq("id", id);
    setSelected(null); reload();
  }

  async function fazerCheckin(a: Atendimento) {
    if (!confirm("Confirmar check-in?")) return;
    await supabase.from("atendimentos").update({ status: "realizado" as any }).eq("id", a.id);
    setSelected(null); reload();
  }

  function handleCatalogoSelectChange(id: string) {
    setIdItemSelecionado(id);
    if (itemTipo === "servico") {
      const s = listaServicos.find(x => x.id === id);
      if (s) { setQtdSessoesAuto("1"); setValorTotalAuto(s.preco.toString()); }
    } else {
      const p = listaPacotes.find(x => x.id === id);
      if (p) { setQtdSessoesAuto(p.numero_sessoes.toString()); setValorTotalAuto(p.preco_total.toString()); }
    }
  }

  async function salvarCadastroRapido(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    try {
      let pId = pacienteSelecionado?.id;
      if (!pId) {
        const { data: nP } = await supabase.from("pacientes").insert({ nome: termoBusca, telefone: telefoneBusca || null }).select().single();
        pId = nP.id;
      }
      let ptId = usarPacoteExistenteId;
      if (!ptId) {
        const { data: nPt } = await supabase.from("paciente_pacotes").insert({ paciente_id: pId, sessoes_totais: parseInt(qtdSessoesAuto), sessoes_restantes: parseInt(qtdSessoesAuto), preco_pago: parseFloat(valorTotalAuto), status_pagamento: "pendente", pacote_id: itemTipo === "pacote" ? idItemSelecionado : null, servico_id: itemTipo === "servico" ? idItemSelecionado : null }).select().single();
        ptId = nPt.id;
      }
      await supabase.from("atendimentos").update({ paciente_id: pId, paciente_pacote_id: ptId, status: "realizado", tipo: tipoAtendimentoRascunho }).eq("id", selected.id);
      setModoCadastroRapido(false); setSelected(null); reload();
    } catch (e) { toast.error("Erro ao salvar"); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Agenda</h1>
        <Button variant="outline" size="sm" onClick={() => syncNow()} disabled={syncing}><RefreshCw className="w-4 h-4 mr-1" /> Atualizar</Button>
      </div>
      {/* ... (resto do JSX omitido aqui para garantir o fechamento das chaves) ... */}
    </div>
  );
}
