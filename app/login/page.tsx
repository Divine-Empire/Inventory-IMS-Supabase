"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { User, Lock, Eye, EyeOff, Boxes } from "lucide-react";

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{isAuthenticated ? "Redirecting to dashboard..." : "Loading..."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-white overflow-hidden">
      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 pb-14 sm:pb-16">
        <div className="w-[92%] sm:w-full max-w-[340px] sm:max-w-md bg-white border border-gray-100 rounded-2xl shadow-xl p-4 sm:p-8 space-y-3.5 sm:space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-600 to-indigo-600" />

          <div className="flex flex-col items-center space-y-2.5 sm:space-y-4">
            <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Boxes className="w-8 h-8 sm:w-12 sm:h-12 text-white" />
            </div>
            <div className="text-center space-y-0.5">
              <h1 className="text-xl sm:text-3xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                Inventory Management
              </h1>
              <p className="text-xs sm:text-sm text-gray-500">Stock, Sales &amp; Purchase Control System</p>
            </div>
          </div>

          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs sm:text-sm text-center font-medium">
              {error}
            </div>
          )}

          <form className="space-y-2.5 sm:space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <label htmlFor="username" className="text-[11px] sm:text-sm font-semibold text-gray-700">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-gray-400" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  disabled={isSubmitting}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-9 pr-4 py-1.5 sm:py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-xs sm:text-sm"
                  placeholder="Enter username"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="text-[11px] sm:text-sm font-semibold text-gray-700">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  disabled={isSubmitting}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-9 pr-12 py-1.5 sm:py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-xs sm:text-sm"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5 sm:h-5 sm:w-5" /> : <Eye className="h-3.5 w-3.5 sm:h-5 sm:w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-1.5 sm:py-2.5 px-4 text-xs sm:text-base font-bold text-white rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 shadow-md shadow-indigo-500/20 transition-all ${
                isSubmitting ? "opacity-70 cursor-not-allowed" : ""
              }`}
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Signing in...</span>
                </div>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>
      </div>

      <footer className="w-full fixed bottom-0 left-0 right-0 z-50 py-3 md:py-2 border-t border-sky-200 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-[13px] md:text-sm font-bold md:font-medium text-sky-700">
            Powered By{" "}
            <a
              href="https://www.botivate.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-700 md:text-sky-600 hover:text-sky-800 font-black md:font-bold hover:underline transition-all"
            >
              Botivate
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
