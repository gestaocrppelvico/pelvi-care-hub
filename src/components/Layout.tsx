import { Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        <main className="flex-1 p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
