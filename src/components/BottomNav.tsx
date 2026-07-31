import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useNavItems } from "./NavItems";

export function BottomNav() {
  const items = useNavItems();

  if (items.length === 0) {
    return null;
  }

  const gridCols = items.length;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t shadow-bottom-nav safe-bottom">
      <ul
        className="max-w-2xl mx-auto"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        }}
      >
        {items.map(({ href, icon: Icon, label }) => (
          <li key={href}>
            <NavLink
              to={href}
              end={href === "/dashboard"}
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
