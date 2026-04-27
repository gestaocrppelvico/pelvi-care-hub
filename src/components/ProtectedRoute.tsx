import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type AppRole } from "@/hooks/useAuth";

export function ProtectedRoute({
  children,
  requireRoles,
}: {
  children: React.ReactNode;
  requireRoles?: AppRole[];
}) {
  const { user, roles, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;

  if (requireRoles && requireRoles.length > 0) {
    const allowed = requireRoles.some((r) => roles.includes(r));
    if (!allowed) return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
