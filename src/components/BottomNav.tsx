import { NavLink, useNavigate } from "react-router-dom";
import { Home, Calendar, Stethoscope, MapPin, Menu, Users, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function BottomNav() {
  const { isAdmin, isSecretaria, isFisio } = useAuth();
  const navigate = useNavigate();

  // Define os itens base (sempre nessa ordem)
  const allItems = [
    { to: "/dashboard", icon: Home, label: "Início", key: "home" }, // <-- mudou de "/" para "/dashboard"
    { to: "/agenda", icon: Calendar, label: "Agenda", key: "agenda" },
    { to: "/medicos", icon: Stethoscope, label: "Médicos", key: "medicos" },
    { to: "/explorar", icon: MapPin, label: "Explorar", key: "explorar" },
    { to: "/pacientes", icon: Users, label: "Pacientes", key: "pacientes" },
    { to: "/mais", icon: Menu, label: "Mais", key: "mais" },
  ];

  // Filtra com base no perfil
  let filteredItems = [];

  if (isAdmin) {
    filteredItems = allItems;
  } else if (isSecretaria) {
    filteredItems = allItems.filter(item => 
      ["home", "agenda", "pacientes", "mais"].includes(item.key)
    );
  } else if (isFisio) {
    filteredItems = allItems.filter(item => 
      ["home", "agenda", "pacientes"].includes(item.key)
    );
  } else {
    filteredItems = allItems.filter(item => 
      ["home", "agenda"].includes(item.key)
    );
  }

  // Adiciona botão de logout no final (só se tiver mais de 1 item)
  const itemsComLogout = [...filteredItems];
  if (filteredItems.length > 0) {
    // Substitui "Mais" por "Sair" (ou adiciona um item extra)
    const maisIndex = itemsComLogout.findIndex(item => item.key === "mais");
    if (maisIndex !== -1) {
      itemsComLogout[maisIndex] = {
        to: "#",
        icon: LogOut,
        label: "Sair",
        key: "logout",
        onClick: async () => {
          await supabase.auth.signOut();
          toast.success("Deslogado com sucesso");
          navigate("/auth");
        }
      };
    }
  }

  const gridCols = itemsComLogout.length;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t shadow-bottom-nav safe-bottom">
      <ul
        className="max-w-2xl mx-auto"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        }}
      >
        {itemsComLogout.map(({ to, icon: Icon, label, key, onClick }) => (
          <li key={key}>
            {onClick ? (
              <button
                onClick={onClick}
                className="flex flex-col items-center justify-center gap-1 py-2.5 text-xs transition-colors w-full text-muted-foreground hover:text-foreground"
              >
                <Icon className="w-6 h-6" />
                <span>{label}</span>
              </button>
            ) : (
              <NavLink
                to={to}
                end={to === "/dashboard"}
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
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
