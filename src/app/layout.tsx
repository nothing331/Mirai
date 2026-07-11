import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local Edit — Image Editor",
  description: "Select a region and recolor it without changing the rest of the image.",
};

/** Supplies document metadata and global styling for every application route. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
