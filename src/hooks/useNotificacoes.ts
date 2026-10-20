import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Notificacao {
  id: string;
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
      setNaoLidas(data.filter((n: any) => !n.lida).length);
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

  // 🔥 Registra o Service Worker + push
  async function ativarPush() {
    if (!profissionalId) {
      toast.error("Você precisa estar logado como profissional");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Seu navegador não suporta notificações push");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permissão negada. Verifique as configurações do navegador.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const publicKey = "COLE_AQUI_A_CHAVE_VAPID_PUBLICA";
      if (!publicKey || publicKey.startsWith("COLE")) {
        toast.error("Configure a chave VAPID primeiro (ver instruções)");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as any,
      });

      const subJson = subscription.toJSON();

      await supabase.from("push_subscriptions").upsert({
        profissional_id: profissionalId,
        endpoint: subJson.endpoint!,
        p256dh: subJson.keys!.p256dh,
        auth: subJson.keys!.auth,
      }, { onConflict: "endpoint" });

      toast.success("Notificações ativadas neste dispositivo!");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao ativar notificações: " + err.message);
    }
  }

  useEffect(() => {
    carregar();
    if (!profissionalId) return;

    // Realtime: escuta novas notificações
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

  return { notificacoes, naoLidas, marcarComoLida, marcarTodasComoLidas, ativarPush, recarregar: carregar };
}

// 🔥 Helper para converter VAPID key
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
