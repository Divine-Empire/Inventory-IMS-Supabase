"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { BrandMark } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const res = await login(username, password);
      if (res.success) {
        router.push("/dashboard");
      } else {
        setError(res.error || "Invalid username or password");
      }
    } catch (error: any) {
      setError(error.message || "An error occurred during login");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background" role="status">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          {isAuthenticated ? "Redirecting to dashboard..." : "Loading..."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="relative w-full max-w-sm overflow-hidden rounded-lg border bg-card p-6 shadow-sm sm:p-8">
          <div className="absolute inset-x-0 top-0 h-1 bg-brand-lime" aria-hidden />

          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <BrandMark className="h-16" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Divine Empire</h1>
              <p className="text-sm text-muted-foreground">Sign in to Inventory Management</p>
            </div>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                disabled={isSubmitting}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  disabled={isSubmitting}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
      </main>

      <footer className="flex h-10 shrink-0 items-center justify-center gap-1 border-t bg-card text-xs text-muted-foreground">
        <span>Powered by</span>
        <a
          href="https://www.botivate.in"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Botivate
        </a>
      </footer>
    </div>
  );
}
