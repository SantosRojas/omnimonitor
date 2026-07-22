import { useState } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Settings,
  Users,
  GitCompareArrows,
  Activity,
  LogOut,
  Menu,
  X,
  User,
  Sun,
  Moon,
  Cable,
  ChevronsLeft,
  ChevronsRight,
  Network,
  Cpu,
} from "lucide-react";
import { Button } from "../primitives/button";
import { useAuthStore } from "../../store/auth-store";
import { useThemeStore } from "../../store/theme-store";
import { cn } from "../primitives";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/connections", icon: Cable, label: "Connections" },
  { to: "/profile", icon: User, label: "Profile" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const adminNavItems = [
  { to: "/admin/users", icon: Users, label: "Users" },
  { to: "/admin/signals", icon: Cpu, label: "Signals" },
  { to: "/admin/equivalences", icon: GitCompareArrows, label: "Equivalences" },
  { to: "/admin/machine-ips", icon: Network, label: "Machine IPs" },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const isAdmin = user?.role === "admin";

  const { theme, setTheme, toggle } = useThemeStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("omni-sidebar-collapsed") === "true",
  );

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("omni-sidebar-collapsed", String(next));
      return next;
    });
  }

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const isActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(to + "/");

  const linkClass = (to: string) =>
    cn(
      "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none",
      collapsed ? "justify-center px-2" : "gap-3",
      isActive(to)
        ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white",
    );

  const sidebarContent = (
    <div className="flex h-full flex-col gap-4">
      {/* Logo */}
      <div className={cn("flex items-center px-4 py-4", collapsed ? "justify-center px-0" : "gap-2")}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
          <Activity className="h-4 w-4" />
        </div>
        {!collapsed && (
          <span className="font-semibold tracking-tight text-neutral-900 dark:text-white">
            OMNI PDMS
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 space-y-1", collapsed ? "px-2" : "px-3")}>
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={linkClass(item.to)}
            onClick={() => setSidebarOpen(false)}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && item.label}
          </Link>
        ))}

        {isAdmin && (
          <>
            <div className="my-2 border-t border-neutral-200 dark:border-neutral-700" />
            {!collapsed && (
              <p className="px-3 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Administration
              </p>
            )}
            {adminNavItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={linkClass(item.to)}
                onClick={() => setSidebarOpen(false)}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* Bottom: user + theme + logout */}
      <div className="border-t border-neutral-200 p-3 dark:border-neutral-700">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3 px-3")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
            {user?.username?.charAt(0)?.toUpperCase() || "U"}
          </div>
          {!collapsed && (
            <div className="flex-1 truncate">
              <p className="text-sm font-medium text-neutral-900 dark:text-white">
                {user?.username || "User"}
              </p>
              <p className="text-xs capitalize text-neutral-500 dark:text-neutral-400">
                {user?.role}
              </p>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        {!collapsed && (
          <div className="mb-2 mt-3 flex rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-700">
            <button
              onClick={() => setTheme("light")}
              className={cn(
                "flex flex-1 items-center justify-center rounded-md px-2 py-1.5 text-xs transition-all",
                theme === "light"
                  ? "bg-neutral-100 text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white"
                  : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white",
              )}
              title="Light mode"
            >
              <Sun className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={cn(
                "flex flex-1 items-center justify-center rounded-md px-2 py-1.5 text-xs transition-all",
                theme === "dark"
                  ? "bg-neutral-100 text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white"
                  : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white",
              )}
              title="Dark mode"
            >
              <Moon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {collapsed && (
          <div className="mt-3 flex justify-center">
            <Button variant="ghost" size="icon" onClick={toggle} title={theme === "light" ? "Dark" : "Light"}>
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
          </div>
        )}

        <Button
          variant="ghost"
          className={cn(
            "mt-2 text-neutral-600 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400",
            collapsed ? "flex w-full justify-center px-0" : "w-full justify-start gap-3",
          )}
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && "Logout"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen">
      {/* Mobile hamburger */}
      <button
        className="fixed left-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900 md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "relative hidden shrink-0 border-r border-neutral-200 bg-white transition-all duration-200 dark:border-neutral-800 dark:bg-neutral-900 md:block",
          collapsed ? "w-16" : "w-64",
        )}
      >
        {sidebarContent}

        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 shadow-sm hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:text-white"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronsLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed left-0 top-0 z-50 h-full w-72 border-r border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-y-auto bg-neutral-50 p-6 dark:bg-neutral-950">
        <Outlet />
      </main>
    </div>
  );
}
