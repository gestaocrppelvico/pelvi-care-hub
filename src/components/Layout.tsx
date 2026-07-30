import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { AppHeader } from "./AppHeader";

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AppHeader />
      <main className="flex-1 p-4 pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
