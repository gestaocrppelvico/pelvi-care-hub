import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Phone, Calendar, Pencil, ShoppingBag, FileText, Activity, Wallet, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Importações dos sub-componentes
import PacienteFinanceiro from "./PacienteFinanceiro";
import PacienteAutorizacoes from "./PacienteAutorizacoes";

export default function PacienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isSecretaria } = useAuth();
  const podeGerenciar = isAdmin || isSecretaria;

  const [pac, setPac] = useState(null);
  const [pront, setPront] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados Novo Lançamento
  const [itemTipo, setItemTipo] = useState<"servico" | "pacote">("servico");
  const [listaServicos, setListaServicos] = useState([]);
  const [listaPacotes, setListaPacotes] = useState([]);
  const [idItemSelecionado, setIdItemSelecionado] = useState("");
  const [qtdSessoes, setQtdSessoes] = useState(1);
  const [precoFinal, setPrecoFinal] = useState("");

  const carregarDados = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: p } = await supabase.from("pacientes").select("*").eq("id", id).maybeSingle();
      setPac(p);
      const { data: pr } = await supabase.from("prontuarios").select("*, atendimento:atendimentos(data_inicio, profissional:profissionais(nome))").eq("paciente_id", id).order("created_at", { ascending: false });
      setPront(pr || []);
      
      const [{ data: s }, { data: pks }] = await Promise.all([
        supabase.from("servicos").select("id, nome, preco").eq("ativo", true),
        supabase.from("pacotes").select("id, nome, numero_sessoes, preco_total").eq("ativo", true)
      ]);
      setListaServicos(s || []);
      setListaPacotes(pks || []);
    } catch (e) { toast.error("Erro ao carregar"); } finally { setLoading(false); }
  };

  useEffect(() => { carregarDados(); }, [id]);

  const handleItemChange = (val: string) => {
    setIdItemSelecionado(val);
    if (itemTipo === "servico") {
      const it = listaServicos.find(s => s.id === val);
      if (it) { setQtdSessoes(1); setPrecoFinal(it.preco.toString()); }
    } else {
      const it = listaPacotes.find(p => p.id === val);
      if (it) { setQtdSessoes(it.numero_sessoes); setPrecoFinal(it.preco_total.toString()); }
    }
  };

  const lancar = async (e: any) => {
    e.preventDefault();
    try {
      if (itemTipo === "pacote") {
        await supabase.from("paciente_pacotes").insert({ paciente_id: id, pacote_id: idItemSelecionado, sessoes_totais: qtdSessoes, sessoes_restantes: qtdSessoes, preco_pago: precoFinal });
      } else {
        await supabase.from("paciente_servicos").insert({ paciente_id: id, servico_id: idItemSelecionado });
        await supabase.from("paciente_pacotes").insert({ paciente_id: id, servico_id: idItemSelecionado, sessoes_totais: 1, sessoes_restantes: 1, preco_pago: precoFinal });
      }
      toast.success("Lançado com sucesso!");
      setIdItemSelecionado("");
    } catch (err: any) { toast.error(err.message); }
  };

  if (loading) return 
Carregando...
;

  return (
    

      

        

           navigate("/pacientes")}>
          

            
{pac?.nome}

            
{pac?.telefone}

          
        

        
           Editar
        
      


      
        
          Histórico
          Prontuário
          Serviços
          Financeiro
          Autorizações
        

        
           
            
Lançar Novo Item

            
               setItemTipo(v as any)}>
                
                
                  Serviço Avulso
                  Pacote
                
              
              
                
                
                  {itemTipo === "servico" ? listaServicos.map(s => {s.nome}) : listaPacotes.map(p => {p.nome})}
                
              
               setPrecoFinal(e.target.value)} placeholder="Valor R$" />
              Confirmar Lançamento
            
          
        
        
        {/* Adicione as outras TabsContent aqui conforme necessário */}
      
    

  );
}


