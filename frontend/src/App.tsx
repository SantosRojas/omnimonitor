import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivateRoute } from "./ui/components/PrivateRoute";
import { AppLayout } from "./ui/layouts/AppLayout";
import { LoginContainer } from "./ui/containers/LoginContainer";
import DashboardContainer from "./ui/containers/DashboardContainer";
import ScadaDetailContainer from "./ui/containers/ScadaDetailContainer";
import { useAuthStore } from "./store/auth-store";
import AdminPanelContainer from "./ui/containers/AdminPanelContainer";
import type { ReactNode } from "react";

/* ── Query client ───────────────────────────────────────────── */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,        // 10 s before a background refetch
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/* ── Role guard wrapper for admin‑only routes ───────────────── */

function AdminGuard({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

/* ── Root redirect ──────────────────────────────────────────── */

function RootRedirect() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;

  const user = useAuthStore((s) => s.user);
  const home = user?.role === "admin" ? "/admin" : "/dashboard";
  return <Navigate to={home} replace />;
}

/* ── Router definition ──────────────────────────────────────── */

const router = createBrowserRouter([
  // Public
  { path: "/login", element: <LoginContainer /> },

  // Protected — any authenticated role
  {
    element: <PrivateRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "dashboard", element: <DashboardContainer /> },
          {
            path: "dashboard/:id/scada",
            element: <ScadaDetailContainer />,
          },
          {
            path: "admin/*",
            element: (
              <AdminGuard>
                <AdminPanelContainer />
              </AdminGuard>
            ),
          },
        ],
      },
    ],
  },

  // Root — redirect based on auth state
  { path: "/", element: <RootRedirect /> },
]);

/* ── App root component ─────────────────────────────────────── */

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export { queryClient };
