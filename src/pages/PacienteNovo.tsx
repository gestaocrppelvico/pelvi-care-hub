import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(120),
  cpf: z.string().trim().max(20).optional().or(z.literal("")),
  data_nascimento: z.string().optional().or(z.literal("")),
  telefone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("E-mail inválido").max(255).optional().or(z.literal("")),
  endereco: z.string().trim().max(300).optional().or(z.literal("")),
  plano_saude: z.string().trim().max(80).optional().or(z.literal("")),
  numero_carteirinha: z.string().trim().max(60).optional().or(z.literal("")),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
});

export default function PacienteNovo() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  
  // Pegamos os valores da URL (caso venham da Agenda)
  const preNome = searchParams.get("nome") ?? "";
  const preTelefone = searchParams.get("telefone") ?? "";

  // Novos Estados para controlar a digitação e as sugestões
  const [nomeBusca, setNomeBusca] = useState(preNome);
  const [sugestoes, setSugestoes] = useState<{ id: string; nome: string; telefone: string | null }[]>([]);

  // ─── LÓGICA DE BUSCA DE DUPLICATAS (Debounce) ───
  useEffect(() => {
    // Cria um temporizador. Só executa se o usuário parar de digitar por 600ms
    const timeoutId = setTimeout(async () => {
      // Pega apenas o primeiro nome e remove letras 'h' ou 'H' para pegar erros de digitação comuns
      const primeiroNome = nomeBusca.trim().split(" ")[0].replace(/[hH]/g, "");

      // Só busca se tiver pelo menos 3 letras
      if (primeiroNome.length >= 3) {
        const { data, error } = await supabase
          .from("pacientes")
          .select("id, nome, telefone")
          .ilike("nome", `%${primeiroNome}%`) // Busca nomes que contenham essa parte
          .limit(3); // Traz no máximo 3 sugestões para não poluir a tela

        if (!error && data) {
          // Filtra para não mostrar caso o nome seja exatamente igual e o único na lista 
          // (evita mostrar sugestão se a pessoa já encontrou o que queria)
          setSugestoes(data);
        }
      } else {
        setSugestoes([]);
      }
    }, 600);

    // Limpa o temporizador se o usuário voltar a digitar antes dos 600ms
    return () => clearTimeout(timeoutId);
  }, [nomeBusca]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(fd));
    
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    
    setBusy(true);
    
    const payload = Object.fromEntries(
      Object.entries(parsed.data).map(([k, v]) => [k, v === "" ? null : v])
    ) as any;
    
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
          
          {/* CAMPO NOME MODIFICADO PARA BUSCA INTELIGENTE */}
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
            
            {/* ALERTA DE SUGESTÕES */}
            {sugestoes.length > 0 && (
              <div className="p-3 mt-2 bg-amber-50 border border-amber-200 rounded-md animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-1">
                  <AlertCircle className="w-4 h-4" />
                  <span>Atenção! Já existem pacientes com nomes parecidos:</span>
                </div>
                <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
                  {sugestoes.map(s => (
                    <li key={s.id}>
                      <strong>{s.nome}</strong> {s.telefone ? `- Tel: ${s.telefone}` : ''}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-amber-600 mt-2">
                  Se for a mesma pessoa, cancele este cadastro e busque na lista de pacientes.
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
            <Field label="Plano de saúde" name="plano_saude" />
            <Field label="Carteirinha" name="numero_carteirinha" />
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

// Componente auxiliar mantido intacto para os outros campos
function Field({ label, name, type = "text", required, defaultValue }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} defaultValue={defaultValue} />
    </div>
  );
}
