import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PlanosConfig from "@/pages/PlanosConfig"; // <- caminho corrigido
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";

export default function Configuracoes() {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="container max-w-4xl mx-auto py-6 space-y-6">
      <h1 className="text-2xl font-bold">Configurações da Clínica</h1>

      <Tabs defaultValue="planos" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="planos">Planos de Saúde</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
        </TabsList>

        <TabsContent value="geral">
          <Card>
            <CardHeader>
              <CardTitle>Configurações Gerais</CardTitle>
              <CardDescription>
                Em breve: dados da clínica, horários, etc.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Página em construção.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="planos">
          <Card>
            <CardHeader>
              <CardTitle>Planos de Saúde</CardTitle>
              <CardDescription>
                Cadastre, edite ou remova os planos de saúde atendidos pela clínica.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PlanosConfig />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usuarios">
          <Card>
            <CardHeader>
              <CardTitle>Gestão de Usuários</CardTitle>
              <CardDescription>
                Em breve: gerenciar perfis e permissões.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Página em construção.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="servicos">
          <Card>
            <CardHeader>
              <CardTitle>Serviços</CardTitle>
              <CardDescription>
                Em breve: cadastro de serviços/procedimentos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Página em construção.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
