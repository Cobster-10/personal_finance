import "@fontsource/gloria-hallelujah";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sketch Finance",
  description: "A hand-drawn personal finance dashboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
