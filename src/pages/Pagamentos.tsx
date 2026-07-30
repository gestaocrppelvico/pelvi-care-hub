import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Wallet } from "lucide-react";

export default function Pagamentos() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    supabase.from("pagamentos").select("*").limit(1).then(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/financeiro")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Wallet className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Pagamentos</h1>
      </div>
      <Card className="p-6 text-center text-muted-foreground">
        {loading ? "Carregando..." : "Página de pagamentos (em construção)"}
      </Card>
    </div>
  );
}
