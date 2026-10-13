import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Inventory Management System",
  description: "IMS — aligned with Purchase-FMS-Supabase and OTP_Supabase",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            classNames: {
              error: "!border-danger/25 !bg-danger-soft !text-danger",
              success: "!border-success/25 !bg-success-soft !text-success",
              warning: "!border-warning/25 !bg-warning-soft !text-warning",
              info: "!border-info/25 !bg-info-soft !text-info",
            },
          }}
        />
      </body>
    </html>
  );
}
