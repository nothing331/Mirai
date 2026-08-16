import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mirai — Image Editor",
  description: "A non-destructive workspace for precise local and generative image editing.",
};

/** Supplies document metadata and global styling for every application route. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
