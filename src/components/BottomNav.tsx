import { NavLink } from "react-router-dom";
import { Home, Calendar, Stethoscope, MapPin, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", icon: Home, label: "Início" },
  { to: "/agenda", icon: Calendar, label: "Agenda" },
  { to: "/medicos", icon: Stethoscope, label: "Médicos" },
  { to: "/explorar", icon: MapPin, label: "Explorar" },
  { to: "/mais", icon: Menu, label: "Mais" },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t shadow-bottom-nav safe-bottom">
      <ul className="grid grid-cols-5 max-w-2xl mx-auto">
        {items.map(({ to, icon: Icon, label }) => (
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
