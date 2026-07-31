import { useAuth } from "@/hooks/useAuth";
import { Home, Calendar, Users, DollarSign, MessageSquare, Settings } from "lucide-react";

export type NavItem = {
  label: string;
  icon: React.ElementType;
  href: string;
};

export function useNavItems(): NavItem[] {
  const { isAdmin, isSecretaria, isFisio } = useAuth();

  const baseItems: NavItem[] = [
    { label: "Início", icon: Home, href: "/dashboard" },
    { label: "Agenda", icon: Calendar, href: "/agenda" },
  ];

  const patientItem: NavItem = { label: "Pacientes", icon: Users, href: "/pacientes" };
  const financeiroItem: NavItem = { label: "Financeiro", icon: DollarSign, href: "/financeiro" };
  const crmItem: NavItem = { label: "CRM", icon: MessageSquare, href: "/crm" };
  const configItem: NavItem = { label: "Configurações", icon: Settings, href: "/configuracoes" };

  if (isAdmin) {
    return [...baseItems, patientItem, financeiroItem, crmItem, configItem];
  }
  if (isSecretaria) {
    return [...baseItems, patientItem, financeiroItem, crmItem];
  }
  if (isFisio) {
    return [...baseItems, patientItem];
  }
  return baseItems; // fallback (usuário sem perfil definido)
}
