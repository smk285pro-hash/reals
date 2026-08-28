import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Audio Lab Studio 2026",
  description: "Phần mềm phân tích âm thanh, bóc tách nguồn âm AI & trích xuất hợp âm đa track",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="dark">
      <body className="bg-[#0a0a0f] text-zinc-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
