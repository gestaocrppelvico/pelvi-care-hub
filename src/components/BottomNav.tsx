import { NavLink } from "react-router-dom";
import { Home, Calendar, Stethoscope, MapPin, Menu, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export function BottomNav() {
  const { isAdmin, isSecretaria, isFisio } = useAuth();

  // Define os itens fixos (sempre visíveis)
  const fixedItems = [
    { to: "/", icon: Home, label: "Início" },
    { to: "/agenda", icon: Calendar, label: "Agenda" },
    { to: "/medicos", icon: Stethoscope, label: "Médicos" },
    { to: "/explorar", icon: MapPin, label: "Explorar" },
    { to: "/mais", icon: Menu, label: "Mais" },
  ];

  // Define os itens condicionais (aparecem conforme permissão)
  const conditionalItems = [];

  // Pacientes – visível para admin, secretária e fisioterapeutas
  if (isAdmin || isSecretaria || isFisio) {
    conditionalItems.push({ to: "/pacientes", icon: Users, label: "Pacientes" });
  }

  // Junta tudo: primeiro os fixos, depois os condicionais
  const allItems = [...fixedItems, ...conditionalItems];

  // Define o número de colunas dinamicamente
  const gridCols = allItems.length <= 5 ? 5 : allItems.length;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t shadow-bottom-nav safe-bottom">
      <ul
        className="max-w-2xl mx-auto"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        }}
      >
        {allItems.map(({ to, icon: Icon, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-xs transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn("w-6 h-6", isActive && "stroke-[2.5]")} />
                  <span className={cn(isActive && "font-semibold")}>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
