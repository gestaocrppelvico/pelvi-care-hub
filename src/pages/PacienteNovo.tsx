import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, AlertCircle, ExternalLink, Calendar } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(120),
  cpf: z.string().trim().max(20).optional().or(z.literal("")),
  data_nascimento: z.string().optional().or(z.literal("")),
  telefone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("E-mail inválido").max(255).optional().or(z.literal("")),
  endereco: z.string().trim().max(300).optional().or(z.literal("")),
  plano_saude: z.string().trim().max(80).optional().or(z.literal("")),
  numero_carteirinha: z.string().trim().max(60).optional().or(z.literal("")),
  // 🔥 REMOVI a possibilidade de string vazia – agora só aceita string ou undefined
  data_inicio_tratamento: z.string().optional(),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
});

export default function PacienteNovo() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  
  const preNome = searchParams.get("nome") ?? "";
  const preTelefone = searchParams.get("telefone") ?? "";

  const [nomeBusca, setNomeBusca] = useState(preNome);
  const [sugestoes, setSugestoes] = useState<{ id: string; nome: string; telefone: string | null }[]>([]);

  const [listaPlanos, setListaPlanos] = useState<{id: string, nome: string}[]>([]);
  const [planoSelecionado, setPlanoSelecionado] = useState<string>("nenhum");
  
  const [dataInicioTratamento, setDataInicioTratamento] = useState("");

  useEffect(() => {
    supabase.from("planos_saude").select("id, nome").eq("ativo", true).then(({ data }) => {
      if (data) setListaPlanos(data);
    });
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      const primeiroNome = nomeBusca.trim().split(" ")[0].replace(/[hH]/g, "");

      if (primeiroNome.length >= 3) {
        const { data, error } = await supabase
          .from("pacientes")
          .select("id, nome, telefone")
          .ilike("nome", `%${primeiroNome}%`)
          .limit(3); 

        if (!error && data) {
          setSugestoes(data);
        }
      } else {
        setSugestoes([]);
      }
    }, 600);

    return () => clearTimeout(timeoutId);
  }, [nomeBusca]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    
    const dadosFormulario = Object.fromEntries(fd) as Record<string, string>;
    dadosFormulario.plano_saude = planoSelecionado === "nenhum" ? "" : planoSelecionado;
    
    // 🔥 CONVERTE para DATE ou null
    let dataInicio = null;
    if (dataInicioTratamento && dataInicioTratamento.length === 7) { // YYYY-MM
      dataInicio = `${dataInicioTratamento}-01`;
    }
    dadosFormulario.data_inicio_tratamento = dataInicio as any; // coloca null ou string

    const parsed = schema.safeParse(dadosFormulario);
    
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    
    setBusy(true);
    
    // 🔥 REMOVE explicitamente campos que são null
    const payload = Object.fromEntries(
      Object.entries(parsed.data)
        .filter(([_, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => [k, v])
    ) as any;

    // Se data_inicio_tratamento for null, removemos do payload (não enviar)
    if (!payload.data_inicio_tratamento) {
      delete payload.data_inicio_tratamento;
    }

    const { error } = await supabase.from("pacientes").insert(payload);
    
    setBusy(false);
    
    if (error) {
      toast.error(error.message);
      return;
    }
    
    toast.success("Paciente cadastrado!");
    navigate("/pacientes");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-2xl font-bold">Novo paciente</h1>
      </div>

      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          
          <div className="space-y-2">
            <Label htmlFor="nome">Nome completo *</Label>
            <Input 
              id="nome" 
              name="nome" 
              required 
              value={nomeBusca} 
              onChange={(e) => setNomeBusca(e.target.value)} 
              placeholder="Ex: Talita Silva"
            />
            
            {sugestoes.length > 0 && (
              <div className="p-3 mt-2 bg-amber-50 border border-amber-200 rounded-md animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>Atenção! Já existem pacientes com nomes parecidos:</span>
                </div>
                
                <ul className="space-y-2">
                  {sugestoes.map(s => (
                    <li key={s.id} className="flex items-center justify-between bg-white/60 p-2 rounded border border-amber-100">
                      <span className="text-sm text-amber-900">
                        <strong>{s.nome}</strong> {s.telefone ? `- Tel: ${s.telefone}` : ''}
                      </span>
                      
                      <Button variant="outline" size="sm" className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-200" asChild>
                        <Link to={`/pacientes/${s.id}`}>
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Ver Ficha
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
                
                <p className="text-xs text-amber-600 mt-3 font-medium">
                  Se for a mesma pessoa, você pode acessar a ficha dela ou cancelar este cadastro.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="CPF" name="cpf" />
            <Field label="Nascimento" name="data_nascimento" type="date" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone" name="telefone" defaultValue={preTelefone} />
            <Field label="E-mail" name="email" type="email" />
          </div>
          <Field label="Endereço" name="endereco" />
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Plano de saúde</Label>
              <Select value={planoSelecionado} onValueChange={setPlanoSelecionado}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum / Particular</SelectItem>
                  {listaPlanos.map((p) => (
                    <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Field label="Carteirinha" name="numero_carteirinha" />
          </div>

          {/* CAMPO: INÍCIO DO TRATAMENTO */}
          <div className="space-y-2">
            <Label htmlFor="data_inicio_tratamento" className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" />
              Início do tratamento (mês/ano)
              <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              id="data_inicio_tratamento"
              type="month"
              value={dataInicioTratamento}
              onChange={(e) => setDataInicioTratamento(e.target.value)}
              className="w-full sm:w-64"
              placeholder="YYYY-MM"
            />
            <p className="text-xs text-muted-foreground">
              Preencha apenas se o paciente já iniciou o tratamento antes do cadastro no sistema.
              {planoSelecionado !== "nenhum" && (
                <span className="text-blue-600 font-medium"> Para pacientes de plano, este campo é especialmente importante.</span>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <Textarea id="obs" name="observacoes" rows={3} />
          </div>
          
          <Button type="submit" className="w-full h-12" disabled={busy}>
            {busy ? "Salvando..." : "Salvar paciente"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, name, type = "text", required, defaultValue }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} defaultValue={defaultValue} />
    </div>
  );
}
