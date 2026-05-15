import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Togetherly",
  description: "Find shared family free time across school and activity calendars."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
