import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Budget App",
  description: "A personal budgeting app powered by Plaid",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved (or system) theme before paint to avoid a light-mode flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 md:px-6">
            <Nav />
            <main className="flex-1 py-6">{children}</main>
            <footer className="py-6 text-center text-xs text-ink-muted">
              Budget App · local sandbox · data stays on this machine
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
