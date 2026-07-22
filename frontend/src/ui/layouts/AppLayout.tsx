import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth-store";

/**
 * Main application layout with a sidebar, header bar, and a content outlet.
 *
 * - **Sidebar**: renders navigation links based on the user's role.
 * - **Header**: shows the current user and a logout button.
 * - **Content**: an `<Outlet />` for nested route components.
 */
export function AppLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const isAdmin = user?.role === "admin";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className="flex w-56 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-14 items-center border-b border-gray-200 px-4 font-semibold text-gray-800">
          OMNI PDMS
        </div>

        <nav className="flex-1 space-y-1 p-3">
          <Link
            to="/dashboard"
            className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Dashboard
          </Link>

          {isAdmin && (
            <Link
              to="/admin"
              className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Admin Panel
            </Link>
          )}
        </nav>
      </aside>

      {/* ── Main area ────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
          <span className="text-sm text-gray-500">
            Logged in as{" "}
            <span className="font-medium text-gray-800">
              {user?.username ?? "—"}
            </span>
          </span>

          <button
            onClick={handleLogout}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Logout
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
