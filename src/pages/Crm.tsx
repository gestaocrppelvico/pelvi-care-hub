import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addDays, format, startOfDay, endOfDay, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { MessageCircle, Settings2, Cake, Clock, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { aplicarTemplate, abrirWhatsapp } from "@/lib/crm";
import { useAuth } from "@/hooks/useAuth";

interface Template { tipo: string; nome: string; conteudo: string }

interface AtendAmanha {
  id: string;
  data_inicio: string;
  nome_paciente_livre: string | null;
  telefone_contato: string | null;
  paciente: { id: string; nome: string; telefone: string | null } | null;
  profissional: { nome: string } | null;
}

interface PacienteInativo {
  id: string;
  nome: string;
  telefone: string | null;
  ultima: string | null;
  dias: number;
}

interface Aniversariante {
  id: string;
  nome: string;
  telefone: string | null;
  data_nascimento: string;
}

export default function Crm() {
  const { isAdmin, isSecretaria } = useAuth();
  const [templates, setTemplates] = useState<Record<string, Template>>({});
  const [diasInativo, setDiasInativo] = useState(45);
  const [amanha, setAmanha] = useState<AtendAmanha[]>([]);
  const [inativos, setInativos] = useState<PacienteInativo[]>([]);
  const [niver, setNiver] = useState<Aniversariante[]>([]);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    const tomorrow = addDays(new Date(), 1);
    const today = new Date();
    const todayMonthDay = format(today, "MM-dd");

    const [tpl, atAmanha, pacientes, atendsHist] = await Promise.all([
      supabase.from("crm_templates").select("tipo, nome, conteudo").eq("ativo", true),
      
      supabase
        .from("atendimentos")
        .select(`
          id, 
          data_inicio, 
          nome_paciente_livre, 
          telefone_contato, 
          paciente:pacientes(id, nome, telefone), 
          profissional:profissionais(nome)
        `)
        .gte("data_inicio", startOfDay(tomorrow).toISOString())
        .lte("data_inicio", endOfDay(tomorrow).toISOString())
        .in("status", ["agendado"]),
        
      supabase
        .from("pacientes")
        .select("id, nome, telefone, data_nascimento")
        .eq("ativo", true),
        
      supabase
        .from("atendimentos")
        .select("paciente_id, data_inicio, status")
        .not("paciente_id", "is", null)
        .order("data_inicio", { ascending: false })
        .limit(50000), 
    ]);

    const tplMap: Record<string, Template> = {};
    (tpl.data ?? []).forEach((t: any) => { tplMap[t.tipo] = t; });
    setTemplates(tplMap);
    setAmanha((atAmanha.data as any) ?? []);

    const ultPorPac = new Map<string, string>();
    (atendsHist.data ?? []).forEach((a: any) => {
      const statusDaSessao = (a.status || "").toLowerCase();
      const ehSessaoInvalida = ["cancelado", "falta", "ausente", "remarcado"].includes(statusDaSessao);
      
      if (!ehSessaoInvalida && a.paciente_id && !ultPorPac.has(a.paciente_id)) {
        ultPorPac.set(a.paciente_id, a.data_inicio);
      }
    });

    const inat: PacienteInativo[] = [];
    const niverList: Aniversariante[] = [];
    (pacientes.data ?? []).forEach((p) => {
      const ult = ultPorPac.get(p.id) ?? null;
      const dias = ult ? differenceInDays(today, new Date(ult)) : 9999;
      
      if (dias >= diasInativo) {
        inat.push({ id: p.id, nome: p.nome, telefone: p.telefone, ultima: ult, dias });
      }
      if (p.data_nascimento && p.data_nascimento.slice(5) === todayMonthDay) {
        niverList.push({ id: p.id, nome: p.nome, telefone: p.telefone, data_nascimento: p.data_nascimento });
      }
    });
    inat.sort((a, b) => b.dias - a.dias);
    setInativos(inat);
    setNiver(niverList);
    setLoading(false);
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [diasInativo]);

  async function logEnvio(paciente_id: string, tipo: string, mensagem: string) {
    await supabase.from("crm_envios").insert({ paciente_id, tipo, mensagem });
  }

  function getNomePaciente(a: AtendAmanha) {
    return a.paciente?.nome || a.nome_paciente_livre || "Paciente não identificado";
  }

  function getTelefonePaciente(a: AtendAmanha) {
    return a.paciente?.telefone || a.telefone_contato || null;
  }

  function enviarLembrete(a: AtendAmanha) {
    const nome = getNomePaciente(a);
    const telefone = getTelefonePaciente(a);

    if (!telefone) {
      toast.error("Paciente sem telefone disponível (Atualize na Agenda)");
      return;
    }

    const tpl = templates["lembrete"]?.conteudo ?? "Olá {paciente}, lembrete da sua sessão amanhã às {hora}.";
    const msg = aplicarTemplate(tpl, {
      paciente: nome.split(" ")[0],
      data: format(new Date(a.data_inicio), "dd/MM", { locale: ptBR }),
      hora: format(new Date(a.data_inicio), "HH:mm"),
      profissional: a.profissional?.nome ?? "",
    });

    if (!abrirWhatsapp(telefone, msg, isSecretaria)) {
      toast.error("Erro ao abrir o WhatsApp");
      return;
    }
    
    if (a.paciente?.id) {
      logEnvio(a.paciente.id, "lembrete", msg);
    }
    toast.success("WhatsApp aberto");
  }

  function enviarRetorno(p: PacienteInativo) {
    const tpl = templates["retorno"]?.conteudo ?? "Olá {paciente}, sentimos sua falta!";
    const msg = aplicarTemplate(tpl, {
      paciente: p.nome.split(" ")[0],
      dias_sem_atendimento: p.dias,
    });
    if (!abrirWhatsapp(p.telefone, msg, isSecretaria)) { toast.error("Paciente sem telefone"); return; }
    logEnvio(p.id, "retorno", msg);
    toast.success("WhatsApp aberto");
  }

  function enviarNiver(p: Aniversariante) {
    const tpl = templates["aniversario"]?.conteudo ?? "Feliz aniversário, {paciente}!";
    const msg = aplicarTemplate(tpl, { paciente: p.nome.split(" ")[0] });
    if (!abrirWhatsapp(p.telefone, msg, isSecretaria)) { toast.error("Paciente sem telefone"); return; }
    logEnvio(p.id, "aniversario", msg);
    toast.success("WhatsApp aberto");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-primary" /> CRM
        </h1>
        {isAdmin && (
          <Button asChild size="sm" variant="outline">
            <Link to="/crm/templates"><Settings2 className="w-4 h-4 mr-1" /> Templates</Link>
          </Button>
        )}
      </div>

      <Tabs defaultValue="lembretes" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="lembretes" className="text-xs">
            <Clock className="w-4 h-4 mr-1" /> Amanhã
            {amanha.length > 0 && <Badge className="ml-1 h-5">{amanha.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="inativos" className="text-xs">
            <UserX className="w-4 h-4 mr-1" /> Inativos
            {inativos.length > 0 && <Badge className="ml-1 h-5" variant="destructive">{inativos.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="niver" className="text-xs">
            <Cake className="w-4 h-4 mr-1" /> Aniversário
            {niver.length > 0 && <Badge className="ml-1 h-5">{niver.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Lembretes 24h */}
        <TabsContent value="lembretes" className="space-y-2 mt-4">
          {loading ? <p className="text-center text-muted-foreground py-6">Carregando...</p> :
           amanha.length === 0 ? <Card className="p-6 text-center text-muted-foreground">Nenhum atendimento amanhã.</Card> :
           amanha.map((a) => (
             <Card key={a.id} className="p-4 flex items-center gap-3">
               <div className="flex-1 min-w-0">
                 <div className="font-semibold truncate">
                   {/* Lógica do Link para Paciente ou Texto Normal */}
                   {a.paciente?.id ? (
                     <Link to={`/pacientes/${a.paciente.id}`} className="text-blue-600 hover:text-blue-800 hover:underline transition-colors">
                       {getNomePaciente(a)}
                     </Link>
                   ) : (
                     <span className="text-slate-800">{getNomePaciente(a)}</span>
                   )}
                 </div>
                 <div className="text-xs text-muted-foreground mt-0.5">
                   {format(new Date(a.data_inicio), "EEE, dd/MM 'às' HH:mm", { locale: ptBR })} · {a.profissional?.nome || "Profissional não definido"}
                 </div>
               </div>
               <Button size="sm" onClick={() => enviarLembrete(a)} disabled={!getTelefonePaciente(a)}>
                 <MessageCircle className="w-4 h-4" />
               </Button>
             </Card>
           ))}
        </TabsContent>

        {/* Pacientes inativos */}
        <TabsContent value="inativos" className="space-y-3 mt-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="diasInat" className="text-xs">Sem sessão há (dias)</Label>
              <Input id="diasInat" type="number" min={7} max={365} value={diasInativo}
                onChange={(e) => setDiasInativo(Number(e.target.value) || 45)} className="h-10" />
            </div>
          </div>
          {loading ? <p className="text-center text-muted-foreground py-6">Carregando...</p> :
           inativos.length === 0 ? <Card className="p-6 text-center text-muted-foreground">Nenhum paciente inativo neste período.</Card> :
           inativos.map((p) => (
             <Card key={p.id} className="p-4 flex items-center gap-3">
               <div className="flex-1 min-w-0">
                 <div className="font-semibold truncate">
                   <Link to={`/pacientes/${p.id}`} className="text-blue-600 hover:text-blue-800 hover:underline transition-colors">
                     {p.nome}
                   </Link>
                 </div>
                 <div className="text-xs text-muted-foreground mt-0.5">
                   {p.ultima ? `Última sessão ${format(new Date(p.ultima), "dd/MM/yyyy")} (${p.dias} dias)` : "Nunca atendido"}
                 </div>
               </div>
               <Button size="sm" onClick={() => enviarRetorno(p)} disabled={!p.telefone}>
                 <MessageCircle className="w-4 h-4" />
               </Button>
             </Card>
           ))}
        </TabsContent>

        {/* Aniversariantes */}
        <TabsContent value="niver" className="space-y-2 mt-4">
          {loading ? <p className="text-center text-muted-foreground py-6">Carregando...</p> :
           niver.length === 0 ? <Card className="p-6 text-center text-muted-foreground">Nenhum aniversariante hoje.</Card> :
           niver.map((p) => (
             <Card key={p.id} className="p-4 flex items-center gap-3">
               <Cake className="w-5 h-5 text-primary shrink-0" />
               <div className="flex-1 min-w-0">
                 <div className="font-semibold truncate">
                   <Link to={`/pacientes/${p.id}`} className="text-blue-600 hover:text-blue-800 hover:underline transition-colors">
                     {p.nome}
                   </Link>
                 </div>
                 <div className="text-xs text-muted-foreground mt-0.5">🎉 Hoje!</div>
               </div>
               <Button size="sm" onClick={() => enviarNiver(p)} disabled={!p.telefone}>
                 <MessageCircle className="w-4 h-4" />
               </Button>
             </Card>
           ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
