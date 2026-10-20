import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Notificacao {
  id: string;
  profissional_id: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  lida: boolean;
  created_at: string;
}

export function useNotificacoes(profissionalId: string | null) {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);

  async function carregar() {
    if (!profissionalId) return;
    const { data } = await supabase
      .from("notificacoes")
      .select("*")
      .eq("profissional_id", profissionalId)
      .order("created_at", { ascending: false })
      .limit(50);
    
    if (data) {
      setNotificacoes(data as Notificacao[]);
      setNaoLidas(data.filter((n) => !n.lida).length);
    }
  }

  async function marcarComoLida(id: string) {
    await supabase.from("notificacoes").update({ lida: true }).eq("id", id);
    await carregar();
  }

  async function marcarTodasComoLidas() {
    if (!profissionalId) return;
    await supabase.from("notificacoes").update({ lida: true }).eq("profissional_id", profissionalId);
    await carregar();
  }

  useEffect(() => {
    carregar();
    if (!profissionalId) return;

    // Escuta novas notificações em tempo real
    const channel = supabase
      .channel("notificacoes-" + profissionalId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes",
          filter: `profissional_id=eq.${profissionalId}`,
        },
        (payload) => {
          const nova = payload.new as Notificacao;
          toast.info(nova.titulo, { description: nova.mensagem || "" });
          carregar();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profissionalId]);

  return { notificacoes, naoLidas, marcarComoLida, marcarTodasComoLidas, recarregar: carregar };
}
