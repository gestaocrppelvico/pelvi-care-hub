import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar"; // verifique se o Sidebar existe

export function Layout() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}
