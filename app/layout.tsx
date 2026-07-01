import type { Metadata, Viewport } from "next";
import { Geist, Bebas_Neue } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const bebas = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Dance4ever",
  description: "Programa de Dance4ever",
  appleWebApp: {
    capable: true,
    title: "Dance4ever",
    statusBarStyle: "black",
  },
  icons: {
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout() {
  return (
    <html lang="es">
      <body className="bg-black" style={{ backgroundColor: 'black' }} />
    </html>
  );
}
