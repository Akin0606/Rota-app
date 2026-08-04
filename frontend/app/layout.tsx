import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rota",
  description: "Rota scheduling for pubs and restaurants",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
