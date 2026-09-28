"use client";

import type React from "react";
import { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  username: string;
  fullName: string;
  role: "admin" | "user";
  pageAccess?: string | null;
  locationAccess?: string | null;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem("ims-user");
      const savedAuth = localStorage.getItem("ims-authenticated");
      if (savedUser && savedAuth === "true") {
        setUser(JSON.parse(savedUser));
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error("Error checking authentication:", error);
      localStorage.removeItem("ims-user");
      localStorage.removeItem("ims-authenticated");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", username, password }),
      });
      const result = await response.json();

      if (result.success && result.user) {
        setUser(result.user);
        setIsAuthenticated(true);
        localStorage.setItem("ims-user", JSON.stringify(result.user));
        localStorage.setItem("ims-authenticated", "true");
        return { success: true };
      }
      return { success: false, error: result.error || "Invalid username or password" };
    } catch (error: any) {
      return { success: false, error: error.message || "Network connection error" };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem("ims-user");
    localStorage.removeItem("ims-authenticated");
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
