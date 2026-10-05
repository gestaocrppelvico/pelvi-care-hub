import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Image as ImageIcon, Download, Eye, Trash2, Paperclip } from "lucide-react";
import { format } from "date-fns";

interface Anexo {
  id: string;
  dbId: string;
  tipo: "pedido_medico" | "guia_autorizada" | "arquivo_pedido_guia";
  nome: string;
  url: string;
  origem: string;
  data: string;
  table: "solicitacoes_guia" | "autorizacoes";
  column: "foto_pedido_url" | "arquivo_pedido_url" | "arquivo_guia_url";
}

export function PacienteAnexos({ pacienteId }: { pacienteId: string }) {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    try {
      const [sols, auts] = await Promise.all([
        supabase
          .from("solicitacoes_guia")
          .select("id, foto_pedido_url, plano, created_at")
          .eq("paciente_id", pacienteId)
          .not("foto_pedido_url", "is", null),
        supabase
          .from("autorizacoes")
          .select("id, arquivo_pedido_url, arquivo_guia_url, plano, created_at")
          .eq("paciente_id", pacienteId),
      ]);

      const lista: Anexo[] = [];

      (sols.data ?? []).forEach((s: any) => {
        if (s.foto_pedido_url) {
          lista.push({
            id: `${s.id}-pedido`,
            dbId: s.id,
            tipo: "pedido_medico",
            nome: `Pedido médico — ${s.plano || "—"}`,
            url: s.foto_pedido_url,
            origem: "Solicitação de guia",
            data: s.created_at,
            table: "solicitacoes_guia",
            column: "foto_pedido_url",
          });
        }
      });

      (auts.data ?? []).forEach((a: any) => {
        if (a.arquivo_pedido_url) {
          lista.push({
            id: `${a.id}-arq-pedido`,
            dbId: a.id,
            tipo: "arquivo_pedido_guia",
            nome: `Pedido de guia — ${a.plano}`,
            url: a.arquivo_pedido_url,
            origem: "Autorização",
            data: a.created_at,
            table: "autorizacoes",
            column: "arquivo_pedido_url",
          });
        }
        if (a.arquivo_guia_url) {
          lista.push({
            id: `${a.id}-arq-guia`,
            dbId: a.id,
            tipo: "guia_autorizada",
            nome: `Guia autorizada — ${a.plano}`,
            url: a.arquivo_guia_url,
            origem: "Autorização",
            data: a.created_at,
            table: "autorizacoes",
            column: "arquivo_guia_url",
          });
        }
      });

      lista.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
      setAnexos(lista);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar anexos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [pacienteId]);

  async function excluirAnexo(anexo: Anexo) {
    if (!confirm(`Excluir "${anexo.nome}"?\n\nEssa ação não pode ser desfeita.`)) return;

    try {
      // 1. Extrair bucket + path da URL pública
      const marker = "/storage/v1/object/public/";
      const idx = anexo.url.indexOf(marker);
      if (idx === -1) {
        toast.error("Não foi possível localizar o arquivo no storage");
        return;
      }
      const rest = anexo.url.substring(idx + marker.length);
      const parts = rest.split("/");
      const bucket = parts[0];
      const path = parts.slice(1).join("/");

      // 2. Remover do storage
      const { error: errStorage } = await supabase.storage
        .from(bucket)
        .remove([path]);
      if (errStorage) throw errStorage;

      // 3. Limpar a coluna no banco
      const { error: errDb } = await supabase
        .from(anexo.table)
        .update({ [anexo.column]: null } as any)
        .eq("id", anexo.dbId);
      if (errDb) throw errDb;

      toast.success("Anexo excluído");
      carregar();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  }

  function ehPDF(url: string) {
    return url.toLowerCase().includes(".pdf");
  }

  async function baixarAnexo(anexo: Anexo) {
    try {
      const res = await fetch(anexo.url);
      const blob = await res.blob();
      const ext = anexo.url.split(".").pop()?.split("?")[0] || "pdf";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${anexo.nome.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-")}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast.success("Download iniciado");
    } catch {
      toast.error("Erro ao baixar arquivo");
    }
  }

  if (loading) {
    return (
      <p className="text-center text-xs text-muted-foreground py-8">
        Carregando anexos...
      </p>
    );
  }

  if (anexos.length === 0) {
    return (
      <Card className="p-10 text-center">
        <Paperclip className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Nenhum anexo registrado.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {anexos.map((a) => (
        <Card key={a.id} className="p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center shrink-0">
            {ehPDF(a.url) ? (
              <FileText className="w-5 h-5 text-rose-500" />
            ) : (
              <ImageIcon className="w-5 h-5 text-indigo-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm truncate">{a.nome}</div>
            <div className="text-[11px] text-muted-foreground flex gap-2 items-center mt-0.5">
              <Badge variant="outline" className="text-[9px] h-4">
                {a.origem}
              </Badge>
              <span>{format(new Date(a.data), "dd/MM/yyyy")}</span>
              <span className="uppercase text-[9px] font-semibold">
                {ehPDF(a.url) ? "PDF" : "Imagem"}
              </span>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => window.open(a.url, "_blank")}
              title="Ver"
            >
              <Eye className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => baixarAnexo(a)}
              title="Baixar"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700"
              onClick={() => excluirAnexo(a)}
              title="Excluir"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
