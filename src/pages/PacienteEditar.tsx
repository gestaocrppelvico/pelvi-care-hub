import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2, MapPin, UserSquare2, Calendar } from "lucide-react";
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
  medico_solicitante_id: z.string().optional().or(z.literal("")),
  plano_saude: z.string().trim().max(80).optional().or(z.literal("")),
  numero_carteirinha: z.string().trim().max(60).optional().or(z.literal("")),
  data_inicio_tratamento: z.string().optional(),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
});

export default function PacienteEditar() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Record<string, string>>({});
  
  const [cepApoio, setCepApoio] = useState("");
  const [listaPlanos, setListaPlanos] = useState<{id: string, nome: string}[]>([]);
  const [listaMedicos, setListaMedicos] = useState<{id: string, nome: string}[]>([]);
  
  const [dataInicioTratamento, setDataInicioTratamento] = useState("");

  useEffect(() => {
    supabase.from("planos_saude").select("id, nome").eq("ativo", true).then(({ data }) => {
      if (data) setListaPlanos(data);
    });
    supabase.from("medicos").select("id, nome").then(({ data }) => {
      if (data) setListaMedicos(data);
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    supabase.from("pacientes").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      if (data) {
        setForm({
          nome: data.nome ?? "",
          cpf: data.cpf ?? "",
          data_nascimento: data.data_nascimento ?? "",
          telefone: data.telefone ?? "",
          email: data.email ?? "",
          endereco: data.endereco ?? "",
          medico_solicitante_id: data.medico_solicitante_id ?? "",
          plano_saude: data.plano_saude ?? "",
          numero_carteirinha: data.numero_carteirinha ?? "",
          observacoes: data.observacoes ?? "",
        });
        if (data.data_inicio_tratamento) {
          const dateStr = data.data_inicio_tratamento.split("T")[0];
          const [year, month] = dateStr.split("-");
          setDataInicioTratamento(`${year}-${month}`);
        }
      }
      setLoading(false);
    });
  }, [id]);

  const handleCepChange = async (cepDigitado: string) => {
    setCepApoio(cepDigitado);
    const cepLimpo = cepDigitado.replace(/\D/g, "");
    if (cepLimpo.length === 8) {
      toast.info("Buscando CEP...");
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setForm(prev => ({
            ...prev,
            endereco: `${data.logradouro}, Bairro: ${data.bairro}, ${data.localidade} - ${data.uf}, N° `
          }));
          toast.success("Endereço preenchido! Insira o número.");
        } else {
          toast.error("CEP não encontrado.");
        }
      } catch (err) {
        toast.error("Erro ao conectar com a base de CEPs.");
      }
    }
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // 🔥 CONVERTE data_inicio_tratamento para DATE (YYYY-MM-01) ou undefined (se vazio)
    let dataInicio = undefined;
    if (dataInicioTratamento && dataInicioTratamento.length === 7) {
      dataInicio = `${dataInicioTratamento}-01`;
    }
    
    // Prepara o objeto para validação
    const dadosParaValidar = {
      ...form,
      data_inicio_tratamento: dataInicio, // pode ser undefined
    };

    const parsed = schema.safeParse(dadosParaValidar);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    
    setBusy(true);
    
    // 🔥 FILTRA valores vazios e undefined
    const payload = Object.fromEntries(
      Object.entries(parsed.data)
        .filter(([_, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => [k, v])
    ) as any;

    const { error } = await supabase.from("pacientes").update(payload).eq("id", id!);
    setBusy(false);
    
    if (error) { toast.error(error.message); return; }
    toast.success("Ficha do paciente atualizada!");
    navigate(`/pacientes/${id}`);
  }

  async function onDelete() {
    if (!confirm("Deseja realmente excluir este paciente?")) return;
    const { error } = await supabase.from("pacientes").delete().eq("id", id!);
    if (error) { toast.error(error.message); return; }
    toast.success("Paciente excluído!");
    navigate("/pacientes");
  }

  if (loading) return <p className="text-muted-foreground text-center py-8">A carregar dados...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-2xl font-bold">Ficha do Paciente</h1>
      </div>
      
      <Card className="p-4 border-t-4 border-t-blue-600">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nome completo *" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
          
          <div className="grid grid-cols-2 gap-3">
            <Field label="CPF" value={form.cpf} onChange={(v) => setForm({ ...form, cpf: v })} />
            <Field label="Nascimento" value={form.data_nascimento} onChange={(v) => setForm({ ...form, data_nascimento: v })} type="date" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} />
            <Field label="E-mail" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><UserSquare2 className="w-4 h-4 text-slate-500" /> Médico Solicitante</Label>
              <Select 
                value={form.medico_solicitante_id || "nenhum"} 
                onValueChange={(v) => setForm({ ...form, medico_solicitante_id: v === "nenhum" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o médico..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum médico</SelectItem>
                  {listaMedicos.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border">
            <div className="md:col-span-1">
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-blue-600" /> CEP</Label>
                <Input 
                  placeholder="00000-000" 
                  value={cepApoio} 
                  onChange={(e) => handleCepChange(e.target.value)} 
                />
              </div>
            </div>
            <div className="md:col-span-3">
              <Field label="Endereço Completo" value={form.endereco} onChange={(v) => setForm({ ...form, endereco: v })} />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Plano de saúde</Label>
              <Select 
                value={form.plano_saude || "nenhum"} 
                onValueChange={(v) => setForm({ ...form, plano_saude: v === "nenhum" ? "" : v })}
              >
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
            
            <Field label="Carteirinha" value={form.numero_carteirinha} onChange={(v) => setForm({ ...form, numero_carteirinha: v })} />
          </div>

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
              Preencha apenas se o paciente iniciou o tratamento antes do cadastro no sistema.
              {form.plano_saude && form.plano_saude !== "" && (
                <span className="text-blue-600 font-medium"> Para pacientes de plano, este campo é especialmente importante.</span>
              )}
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>Observações Clínicas / Internas</Label>
            <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>
          
          <Button type="submit" className="w-full h-12 bg-blue-600 hover:bg-blue-700" disabled={busy}>
            {busy ? "A salvar..." : "Salvar alterações"}
          </Button>
        </form>
      </Card>
      
      <Button variant="destructive" className="w-full" onClick={onDelete}>
        <Trash2 className="w-4 h-4 mr-2" /> Excluir paciente permanentemente
      </Button>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "" }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
