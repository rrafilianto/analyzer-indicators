import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BTC Futures Indicator Research Engine",
  description: "Paper trading engine for testing BTC futures indicators",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`antialiased`}>
        {children}
      </body>
    </html>
  );
}
