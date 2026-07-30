import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function AppHeader() {
  const { roles, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Desconectado");
    navigate("/auth");
  };

  // Função para exibir o papel do usuário
  const getRoleLabel = () => {
    if (roles.includes("admin")) return "Admin";
    if (roles.includes("secretaria")) return "Secretária";
    if (roles.includes("fisio")) return "Fisioterapeuta";
    return "";
  };

  return (
    <header className="sticky top-0 z-30 bg-card/90 backdrop-blur border-b safe-top">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo e nome */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center">
            <img src="/logo.png" alt="Logo CRPPélvico" className="w-full h-full object-contain" />
          </div>
          <div className="font-bold text-foreground">CRPPélvico</div>
          {user && (
            <Badge variant="outline" className="ml-2 text-[10px]">
              {getRoleLabel()}
            </Badge>
          )}
        </div>

        {/* Botão de logout (aparece apenas se estiver logado) */}
        {user && (
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        )}
      </div>
    </header>
  );
}
