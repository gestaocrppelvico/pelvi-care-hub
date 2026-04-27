import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Pacientes from "./pages/Pacientes";
import PacienteNovo from "./pages/PacienteNovo";
import Medicos from "./pages/Medicos";
import MedicoNovo from "./pages/MedicoNovo";
import Agenda from "./pages/Agenda";
import AtendimentoNovo from "./pages/AtendimentoNovo";
import Mais from "./pages/Mais";
import Explorar from "./pages/Explorar";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/agenda/novo" element={<AtendimentoNovo />} />
            <Route path="/pacientes" element={<Pacientes />} />
            <Route path="/pacientes/novo" element={<PacienteNovo />} />
            <Route path="/medicos" element={<Medicos />} />
            <Route path="/medicos/novo" element={<MedicoNovo />} />
            <Route path="/explorar" element={<Explorar />} />
            <Route path="/mais" element={<Mais />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
