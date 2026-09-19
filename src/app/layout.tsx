import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Djeli'S Messaging API - Passerelle SMS Multi-fournisseurs",
  description:
    "Plateforme centrale et résiliente d'envoi SMS multi-fournisseurs pour les applications TAKO, Sigi, Siraba et Comy_stock.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
