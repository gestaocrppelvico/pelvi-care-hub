import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, FileText, Plus, Printer, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Paciente {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  plano_saude: string | null;
  numero_carteirinha: string | null;
}

interface Modelo {
  id: string;
  nome: string;
  tipo: string;
  conteudo: string;
}

interface DocGerado {
  id: string;
  nome: string;
  tipo: string;
  conteudo_gerado: string | null;
  created_at: string;
}

function valorPorExtenso(valor: number): string {
  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const teens = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  if (valor === 0) return "zero reais";
  const inteiro = Math.floor(valor);
  const centavos = Math.round((valor - inteiro) * 100);

  function porExtenso(n: number): string {
    if (n === 0) return "";
    if (n === 100) return "cem";
    if (n < 10) return unidades[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) {
      const d = Math.floor(n / 10);
      const u = n % 10;
      return dezenas[d] + (u ? " e " + unidades[u] : "");
    }
    if (n < 1000) {
      const c = Math.floor(n / 100);
      const resto = n % 100;
      return centenas[c] + (resto ? " e " + porExtenso(resto) : "");
    }
    if (n < 1000000) {
      const mil = Math.floor(n / 1000);
      const resto = n % 1000;
      return (mil === 1 ? "mil" : porExtenso(mil) + " mil") + (resto ? (resto < 100 ? " e " : " ") + porExtenso(resto) : "");
    }
    return String(n);
  }

  let result = porExtenso(inteiro) + (inteiro === 1 ? " real" : " reais");
  if (centavos > 0) {
    result += " e " + porExtenso(centavos) + (centavos === 1 ? " centavo" : " centavos");
  }
  return result;
}

function substituirVariaveis(conteudo: string, paciente: Paciente, profNome: string, profEspecialidade: string, valorNum?: number): string {
  const hoje = new Date();
  const dataAtual = format(hoje, "dd/MM/yyyy");
  const dataExtenso = format(hoje, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const v = valorNum ?? 0;

  return conteudo
    .replace(/\{\{paciente_nome\}\}/g, paciente.nome)
    .replace(/\{\{paciente_cpf\}\}/g, paciente.cpf ?? "___.___.___-__")
    .replace(/\{\{paciente_telefone\}\}/g, paciente.telefone ?? "")
    .replace(/\{\{paciente_plano\}\}/g, paciente.plano_saude ?? "Particular")
    .replace(/\{\{paciente_carteirinha\}\}/g, paciente.numero_carteirinha ?? "")
    .replace(/\{\{profissional_nome\}\}/g, profNome)
    .replace(/\{\{profissional_especialidade\}\}/g, profEspecialidade)
    .replace(/\{\{data_atual\}\}/g, dataAtual)
    .replace(/\{\{data_extenso\}\}/g, dataExtenso)
    .replace(/\{\{valor\}\}/g, v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
    .replace(/\{\{valor_extenso\}\}/g, valorPorExtenso(v));
}

export default function PacienteDocumentos() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [docs, setDocs] = useState<DocGerado[]>([]);
  const [loading, setLoading] = useState(true);

  const [openGerar, setOpenGerar] = useState(false);
  const [modeloId, setModeloId] = useState("");
  const [valorInput, setValorInput] = useState("");
  const [conteudoPreview, setConteudoPreview] = useState("");

  const [openVisualizar, setOpenVisualizar] = useState(false);
  const [docVisualizado, setDocVisualizado] = useState<DocGerado | null>(null);

  // profissional logado
  const [profNome, setProfNome] = useState("");
  const [profEspecialidade, setProfEspecialidade] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: p }, { data: m }, { data: d }, { data: prof }] = await Promise.all([
        supabase.from("pacientes").select("id, nome, cpf, telefone, plano_saude, numero_carteirinha").eq("id", id).maybeSingle(),
        supabase.from("modelos_documentos").select("id, nome, tipo, conteudo").eq("ativo", true).order("tipo").order("nome"),
        supabase.from("documentos_pacientes").select("id, nome, tipo, conteudo_gerado, created_at").eq("paciente_id", id).order("created_at", { ascending: false }),
        supabase.from("profissionais").select("nome, especialidade"),
      ]);
      setPaciente(p as any);
      setModelos((m as any) ?? []);
      setDocs((d as any) ?? []);
      if (prof && prof.length > 0) {
        setProfNome(prof[0].nome);
        setProfEspecialidade(prof[0].especialidade ?? "");
      }
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!modeloId || !paciente) { setConteudoPreview(""); return; }
    const modelo = modelos.find((m) => m.id === modeloId);
    if (!modelo) return;
    const v = parseFloat(valorInput) || 0;
    setConteudoPreview(substituirVariaveis(modelo.conteudo, paciente, profNome, profEspecialidade, v));
  }, [modeloId, valorInput, paciente, profNome, profEspecialidade, modelos]);

  async function gerar() {
    if (!paciente || !modeloId) return;
    const modelo = modelos.find((m) => m.id === modeloId);
    if (!modelo) return;
    const { error } = await supabase.from("documentos_pacientes").insert({
      paciente_id: paciente.id,
      modelo_id: modelo.id,
      nome: modelo.nome,
      tipo: modelo.tipo,
      conteudo_gerado: conteudoPreview,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Documento gerado");
    setOpenGerar(false);
    setModeloId("");
    setValorInput("");
    // reload docs
    const { data: d } = await supabase.from("documentos_pacientes").select("id, nome, tipo, conteudo_gerado, created_at").eq("paciente_id", paciente.id).order("created_at", { ascending: false });
    setDocs((d as any) ?? []);
  }

  function imprimir() {
    if (!printRef.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Documento</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;white-space:pre-wrap;line-height:1.6;font-size:14px}@media print{body{padding:20px}}</style>
      </head><body>${printRef.current.innerHTML}</body></html>
    `);
    win.document.close();
    win.print();
  }

  if (loading) return <p className="text-muted-foreground text-center py-8">Carregando...</p>;
  if (!paciente) return <p className="text-muted-foreground text-center py-8">Paciente não encontrado.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-xl font-bold">Documentos</h1>
          <p className="text-xs text-muted-foreground">{paciente.nome}</p>
        </div>
      </div>

      <Button size="sm" onClick={() => setOpenGerar(true)} disabled={modelos.length === 0}>
        <Plus className="w-4 h-4 mr-1" /> Gerar documento
      </Button>

      {modelos.length === 0 && (
        <Card className="p-4 text-center text-sm text-muted-foreground">
          Nenhum modelo cadastrado. Vá em <strong>Mais → Documentos</strong> para criar modelos.
        </Card>
      )}

      {docs.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum documento gerado ainda.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <Card
              key={d.id}
              className="p-4 hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={() => { setDocVisualizado(d); setOpenVisualizar(true); }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">{d.nome}</span>
                  <Badge variant="secondary" className="capitalize text-[10px]">{d.tipo}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(d.created_at), "dd/MM/yy HH:mm")}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog gerar */}
      <Dialog open={openGerar} onOpenChange={setOpenGerar}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Gerar documento</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium">Modelo</label>
              <Select value={modeloId} onValueChange={setModeloId}>
                <SelectTrigger><SelectValue placeholder="Selecione um modelo" /></SelectTrigger>
                <SelectContent>
                  {modelos.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="capitalize">[{m.tipo}]</span> {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Valor (opcional, para recibos)</label>
              <Input
                type="number"
                step="0.01"
                value={valorInput}
                onChange={(e) => setValorInput(e.target.value)}
                placeholder="0,00"
              />
            </div>
            {conteudoPreview && (
              <div>
                <label className="text-sm font-medium">Pré-visualização</label>
                <div className="bg-muted rounded-lg p-4 text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {conteudoPreview}
                </div>
              </div>
            )}
            <Button className="w-full" onClick={gerar} disabled={!modeloId}>
              Gerar e salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog visualizar */}
      <Dialog open={openVisualizar} onOpenChange={setOpenVisualizar}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {docVisualizado?.nome}
              <Badge variant="secondary" className="capitalize text-[10px]">{docVisualizado?.tipo}</Badge>
            </DialogTitle>
          </DialogHeader>
          <div ref={printRef} className="bg-white text-black rounded-lg p-6 text-sm whitespace-pre-wrap leading-relaxed">
            {docVisualizado?.conteudo_gerado}
          </div>
          <Button onClick={imprimir} className="w-full">
            <Printer className="w-4 h-4 mr-1" /> Imprimir / PDF
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
