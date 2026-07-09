import { NavLink } from "react-router-dom";
import { Home, Calendar, Stethoscope, MapPin, Menu, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export function BottomNav() {
  const { isAdmin, isSecretaria, isFisio } = useAuth();

  // Define os itens base (sempre nessa ordem)
  const allItems = [
    { to: "/", icon: Home, label: "Início", key: "home" },
    { to: "/agenda", icon: Calendar, label: "Agenda", key: "agenda" },
    { to: "/medicos", icon: Stethoscope, label: "Médicos", key: "medicos" },
    { to: "/explorar", icon: MapPin, label: "Explorar", key: "explorar" },
    { to: "/pacientes", icon: Users, label: "Pacientes", key: "pacientes" },
    { to: "/mais", icon: Menu, label: "Mais", key: "mais" },
  ];

  // Filtra com base no perfil
  let filteredItems = [];

  if (isAdmin) {
    // Admin vê todos, com "Mais" na última posição
    filteredItems = allItems;
  } else if (isSecretaria) {
    // Secretária vê: Início, Agenda, Pacientes e Mais
    filteredItems = allItems.filter(item => 
      ["home", "agenda", "pacientes", "mais"].includes(item.key)
    );
  } else if (isFisio) {
    // Fisioterapeuta vê: Início, Agenda e Pacientes (sem Mais)
    filteredItems = allItems.filter(item => 
      ["home", "agenda", "pacientes"].includes(item.key)
    );
  } else {
    // Fallback (caso nenhum perfil seja detectado) – mostra só o essencial
    filteredItems = allItems.filter(item => 
      ["home", "agenda"].includes(item.key)
    );
  }

  // Define o número de colunas dinamicamente
  const gridCols = filteredItems.length;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t shadow-bottom-nav safe-bottom">
      <ul
        className="max-w-2xl mx-auto"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        }}
      >
        {filteredItems.map(({ to, icon: Icon, label }) => (
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
