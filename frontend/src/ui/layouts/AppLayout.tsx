import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/auth-store";
import { Button } from "../primitives/button";
import { cn } from "../primitives";

const navItems = [
  { to: "/dashboard", label: "Dashboard", roles: ["user", "admin"] },
  { to: "/connections", label: "Connections", roles: ["user", "admin"] },
  { to: "/profile", label: "Profile", roles: ["user", "admin"] },
  { to: "/settings", label: "Settings", roles: ["user", "admin"] },
  { to: "/admin", label: "Admin Panel", roles: ["admin"] },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const isAdmin = user?.role === "admin";

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex h-14 items-center border-b border-neutral-200 px-4 font-semibold text-neutral-900 dark:border-neutral-800 dark:text-white">
          <Link to="/dashboard" className="hover:opacity-80">OMNI PDMS</Link>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems
            .filter((item) => item.roles.includes(user?.role ?? "user"))
            .map((item) => {
              const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
                      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
        </nav>

        {isAdmin && (
          <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
            <Link
              to="/machines"
              className="block rounded-md px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
            >
              Machines
            </Link>
          </div>
        )}
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-6 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            Logged in as{" "}
            <span className="font-medium text-neutral-900 dark:text-white">
              {user?.username ?? "—"}
            </span>
          </span>

          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
