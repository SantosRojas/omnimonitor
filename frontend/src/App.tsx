import { useEffect } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "./ui/components/ErrorBoundary";
import { PrivateRoute } from "./ui/components/PrivateRoute";
import { AppLayout } from "./ui/layouts/AppLayout";
import { LoginContainer } from "./ui/containers/LoginContainer";
import ScadaDetailContainer from "./ui/containers/ScadaDetailContainer";
import { useAuthStore } from "./store/auth-store";
import AdminPanelContainer from "./ui/containers/AdminPanelContainer";
import MultiMachineDashboard from "./features/dashboard/MultiMachineDashboard";
import { startWsAdapter } from "./data/ws-adapter";
import ConnectionMonitor from "./features/connections/ConnectionMonitor";
import MachineHistory from "./features/history/MachineHistory";
import SignalConfig from "./features/signal-config/SignalConfig";
import UserProfile from "./features/profile/UserProfile";
import Settings from "./features/settings/Settings";
import type { ReactNode } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AdminGuard({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function RootRedirect() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;

  const user = useAuthStore((s) => s.user);
  const home = user?.role === "admin" ? "/admin" : "/dashboard";
  return <Navigate to={home} replace />;
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginContainer /> },

  {
    element: <PrivateRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },

          // Dashboard
          { path: "dashboard", element: <MultiMachineDashboard /> },
          { path: "dashboard/:id/scada", element: <ScadaDetailContainer /> },

          // Machine detail routes
          { path: "machines/:machineId/history", element: <MachineHistory /> },
          { path: "machines/:machineId/signals", element: <SignalConfig /> },
          { path: "machines/:machineId", element: <ScadaDetailContainer /> },

          // Global pages
          { path: "connections", element: <ConnectionMonitor /> },
          { path: "profile", element: <UserProfile /> },
          { path: "settings", element: <Settings /> },

          // Admin
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

  { path: "/", element: <RootRedirect /> },
]);

export function App() {
  // Single WebSocket connection + store router at the app root.
  // Every component reads from Zustand stores; the adapter keeps them in sync.
  useEffect(() => {
    const stop = startWsAdapter();
    return () => stop();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

export { queryClient };
