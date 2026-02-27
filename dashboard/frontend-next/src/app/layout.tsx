import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ErrorBoundary from "@/components/ErrorBoundary";
import QueryProvider from "@/components/QueryProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PDM Dashboard - Predictive Maintenance",
  description: "Blockchain-based Predictive Maintenance Dashboard with AI-powered machine failure prediction",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Global Background Patterns */}
        <div className="fixed inset-0 -z-10 pointer-events-none opacity-10 bg-cubic-light dark:hidden" />
        <div className="fixed inset-0 -z-10 pointer-events-none opacity-5 hidden dark:block bg-[radial-gradient(#2d8b8b_1px,transparent_1px)] [background-size:16px_16px]" />

        <QueryProvider>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </QueryProvider>
      </body>
    </html>
  );
}
