import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("http://127.0.0.1"),
  title: "MegaDrive — Every drive. One calm workspace.",
  description: "Connect Google Drive accounts, understand your storage, and move files safely between them.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title: "MegaDrive", description: "Every drive. One calm workspace.", images: [{ url: "/og.png", width: 1733, height: 907 }] },
  twitter: { card: "summary_large_image", title: "MegaDrive", description: "Every drive. One calm workspace.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
