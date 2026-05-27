import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

export function AppHeader() {
  const { roles } = useAuth();
  
  return (
    <header className="sticky top-0 z-30 bg-card/90 backdrop-blur border-b safe-top">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* LOGO PERSONALIZADA */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center">
            <img 
              src="/logo.png" 
              alt="Logo CRPPélvico" 
              className="w-full h-full object-contain"
            />
          </div>
          <span className="font-bold text-foreground">CRPPélvico</span>
        </div>

        <div className="flex items-center gap-2">
          {roles.map((r) => (
            <Badge key={r} variant="secondary" className="capitalize text-[10px]">
              {r}
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sair"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
