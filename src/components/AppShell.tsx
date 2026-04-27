import { Outlet } from "react-router-dom";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";

export function AppShell() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 pt-4 pb-24">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
