import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * Centered card layout used for the login page.
 * Renders children in a vertically and horizontally centered container
 * with a subtle card background and shadow. Follows the app theme via
 * the `dark` class on the document root.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
        {children}
      </div>
    </div>
  );
}
