import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * Centered card layout used for the login page.
 * Renders children in a vertically and horizontally centered container
 * with a subtle card background and shadow.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        {children}
      </div>
    </div>
  );
}
