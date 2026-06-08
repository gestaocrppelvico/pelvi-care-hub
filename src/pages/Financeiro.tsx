import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from
"@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger,
SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from
"@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Package, Settings, CheckCircle2, Activity, Undo2,
Pencil } from "lucide-react";
import { toast } from "sonner";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth,
isWithinInterval, parseISO } from "date-fns";
interface RepasseRow {
id: string;
atendimento_id: string;
profissional_id: string;
valor_atendimento: number;
valor_repasse: number;
status: string;
created_at: string;
profissional?: { id: string; nome: string; cor_agenda: string };
atendimento?: { tipo: string; paciente?: { nome: string } };
}

export default function Financeiro() {
const { isAdmin, isSecretaria, isFisio } = useAuth();
const podeGerenciar = isAdmin || isSecretaria;
const [repasses, setRepasses] = useState<RepasseRow[]>([]);
const [loading, setLoading] = useState(true);
const [filtroProfissional, setFiltroProfissional] =
useState<string>("todos");
const [filtroPeriodo, setFiltroPeriodo] =
useState<string>("semana");
const [editando, setEditando] = useState<RepasseRow |
null>(null);
const [valorAtendimento, setValorAtendimento] = useState("");
const [valorRepasse, setValorRepasse] = useState("");
async function carregar() {
setLoading(true);
const { data } = await supabase
.from("repasses_atendimento")
.select(`*, profissional:profissionais(id, nome, cor_agenda),
atendimento:atendimentos(tipo, paciente:pacientes(nome))`)
.order("created_at", { ascending: false })
.limit(500);
setRepasses((data as any[]) ?? []);
setLoading(false);
}
useEffect(() => { carregar(); }, []);
const profissionaisFiltro = useMemo(() => {
const lista = new Map();
repasses.forEach(r => { if (r.profissional)
lista.set(r.profissional.id, r.profissional.nome); });
return Array.from(lista.entries()).map(([id, nome]) => ({ id,
nome }));
}, [repasses]);
const repassesFiltrados = useMemo(() => {
let filtrados = repasses;

if (filtroProfissional !== "todos") filtrados =
filtrados.filter(r => r.profissional_id === filtroProfissional);
if (filtroPeriodo !== "todos") {
const hoje = new Date();
let start, end;
if (filtroPeriodo === "semana") { start = startOfWeek(hoje, {
weekStartsOn: 1 }); end = endOfWeek(hoje, { weekStartsOn: 1 }); }
else { start = startOfMonth(hoje); end = endOfMonth(hoje); }
filtrados = filtrados.filter(r =>
isWithinInterval(parseISO(r.created_at), { start, end }));
}
return filtrados;
}, [repasses, filtroProfissional, filtroPeriodo]);
const pendentes = repassesFiltrados.filter((r) => r.status ===
"pendente");
const conferidos = repassesFiltrados.filter((r) => r.status ===
"pago");
const totalPendente = pendentes.reduce((s, r) => s +
Number(r.valor_repasse), 0);
const totalConferido = conferidos.reduce((s, r) => s +
Number(r.valor_repasse), 0);
const totalReceitas = repassesFiltrados.reduce((s, r) => s +
Number(r.valor_atendimento), 0);
async function atualizarStatus(id: string, status: string) {
const { error } = await
supabase.from("repasses_atendimento").update({ status }).eq("id",
id);
if (error) { toast.error(error.message); return; }
toast.success(`Repasse alterado para ${status}`);
carregar();
}
async function conferirVisiveis() {
if (pendentes.length === 0) return;
if (!confirm(`Confirmar todos os ${pendentes.length} repasses
visíveis?`)) return;

const ids = pendentes.map(r => r.id);
const { error } = await
supabase.from("repasses_atendimento").update({ status: "pago"
}).in("id", ids);
if (error) { toast.error("Erro: " + error.message); return; }
toast.success("Todos conferidos!");
carregar();
}
async function salvarEdicao() {
if (!editando) return;
const { error } = await supabase.from("repasses_atendimento")
.update({ valor_atendimento: parseFloat(valorAtendimento),
valor_repasse: parseFloat(valorRepasse) })
.eq("id", editando.id);
if (error) { toast.error(error.message); return; }
toast.success("Valores atualizados!");
setEditando(null);
carregar();
}
function formatBRL(v: number) { return v.toLocaleString("pt-BR",
{ style: "currency", currency: "BRL" }); }
//
------------------------------------------------------------------
// BLOQUEIO EXATO ANTES DO RETURN PRINCIPAL
if (isFisio && !isAdmin && !isSecretaria) {
return (
<div className="p-8 text-center mt-10 space-y-4">
<h2 className="text-xl font-bold text-slate-700">Acesso

Restrito</h2>

<p className="text-muted-foreground">Seu resumo financeiro
agora está disponível na sua página de Início (Dashboard).</p>
</div>
);
}
//
------------------------------------------------------------------

return (
<div className="space-y-4">
<div className="flex items-center gap-2"><Wallet
className="w-6 h-6 text-primary" /><h1 className="text-2xl
font-bold">Financeiro</h1></div>
<div className="grid grid-cols-1 md:grid-cols-3 gap-2">
<Link to="/financeiro/servicos"><Card className="p-3 flex

items-center gap-2 hover:bg-accent transition-colors
h-full"><Package className="w-5 h-5 text-primary" /><div
className="font-medium text-sm">Serviços e
Pacotes</div></Card></Link>

{isAdmin && <Link to="/financeiro/repasses"><Card
className="p-3 flex items-center gap-2 hover:bg-accent
transition-colors h-full"><Settings className="w-5 h-5
text-primary" /><div className="font-medium text-sm">Regras de
Repasse</div></Card></Link>}

<Link to="/financeiro/relatorios"><Card className="p-3 flex
items-center gap-2 hover:bg-emerald-50 transition-colors h-full
border-emerald-200"><Activity className="w-5 h-5 text-emerald-600"
/><div className="font-medium text-sm
text-emerald-800">Relatórios</div></Card></Link>
</div>
<div className="flex flex-col sm:flex-row gap-3 p-3
bg-muted/50 rounded-lg border">
<Select value={filtroPeriodo}

onValueChange={setFiltroPeriodo}><SelectTrigger className="w-full
sm:w-[180px]"><SelectValue
/></SelectTrigger><SelectContent><SelectItem value="semana">Esta
Semana</SelectItem><SelectItem value="mes">Este
Mês</SelectItem><SelectItem
value="todos">Tudo</SelectItem></SelectContent></Select>

<Select value={filtroProfissional}

onValueChange={setFiltroProfissional}><SelectTrigger
className="w-full sm:w-[180px]"><SelectValue
placeholder="Profissional"
/></SelectTrigger><SelectContent><SelectItem

value="todos">Todos</SelectItem>{profissionaisFiltro.map(p =>
<SelectItem key={p.id}
value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select>
</div>
<div className="grid grid-cols-3 gap-2">
<Card className="p-3"><div className="text-xs

text-muted-foreground">Receita</div><div
className="font-bold">{formatBRL(totalReceitas)}</div></Card>

<Card className="p-3"><div className="text-xs

text-muted-foreground">Pendentes</div><div className="font-bold
text-amber-600">{formatBRL(totalPendente)}</div></Card>
<Card className="p-3"><div className="text-xs

text-muted-foreground">Conferidos</div><div className="font-bold
text-emerald-600">{formatBRL(totalConferido)}</div></Card>
</div>
<Tabs defaultValue="pendentes">
<TabsList className="w-full"><TabsTrigger value="pendentes"

className="flex-1">Pendentes
({pendentes.length})</TabsTrigger><TabsTrigger value="conferidos"
className="flex-1">Conferidos
({conferidos.length})</TabsTrigger></TabsList>

<TabsContent value="pendentes" className="space-y-3 mt-3">
{podeGerenciar && pendentes.length > 0 && <Button

onClick={conferirVisiveis} className="w-full
bg-emerald-600">Conferir {pendentes.length} visíveis</Button>}

{pendentes.map((r) => (
<Card key={r.id} className="p-4 flex items-center

gap-4">

<div className="flex-1"><div

className="font-semibold">{r.profissional?.nome}</div><div
className="text-xs text-muted-foreground">Pcte:
{r.atendimento?.paciente?.nome}</div><div className="font-bold
text-amber-600">{formatBRL(Number(r.valor_repasse))}</div></div>
<div className="flex gap-2"><Button size="sm"

variant="ghost" onClick={() => { setEditando(r);
setValorAtendimento(String(r.valor_atendimento));
setValorRepasse(String(r.valor_repasse)); }}><Pencil className="w-4

h-4" /></Button><Button size="sm" variant="outline" onClick={() =>
atualizarStatus(r.id, "pago")}><CheckCircle2 className="w-4 h-4"
/></Button></div>
</Card>
))}
</TabsContent>
<TabsContent value="conferidos" className="space-y-3 mt-3">
{conferidos.map((r) => (
<Card key={r.id} className="p-4 flex items-center gap-4

opacity-70"><div className="flex-1"><div
className="font-semibold">{r.profissional?.nome}</div><div
className="font-bold
text-emerald-600">{formatBRL(Number(r.valor_repasse))}</div></div><
Button size="sm" variant="ghost" onClick={() =>
atualizarStatus(r.id, "pendente")}><Undo2 className="w-4 h-4"
/></Button></Card>
))}
</TabsContent>
</Tabs>
<Dialog open={!!editando} onOpenChange={() =>
setEditando(null)}>

<DialogContent><DialogHeader><DialogTitle>Editar

Valores</DialogTitle></DialogHeader><div
className="space-y-4"><Label>Valor Atendimento</Label><Input
value={valorAtendimento} onChange={(e) =>
setValorAtendimento(e.target.value)} /><Label>Valor
Repasse</Label><Input value={valorRepasse} onChange={(e) =>
setValorRepasse(e.target.value)} /><Button onClick={salvarEdicao}
className="w-full">Salvar</Button></div></DialogContent>
</Dialog>
</div>
);
}
