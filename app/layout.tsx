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
      <head>
        <style>{`
          @keyframes glitch {
            0% { transform: translate(0) }
            20% { transform: translate(-2px, 2px) }
            40% { transform: translate(-2px, -2px) }
            60% { transform: translate(2px, 2px) }
            80% { transform: translate(2px, -2px) }
            100% { transform: translate(0) }
          }
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          .glitch-text {
            animation: glitch 1s infinite steps(2);
            text-shadow: -2px 0 #ff00c1, 2px 0 #00fff0;
          }
          .blink-text {
            animation: blink 2.5s infinite;
          }
        `}</style>
      </head>
      <body className="bg-black text-white min-h-screen flex flex-col items-center justify-center font-mono select-none" style={{ backgroundColor: 'black' }}>
        <div className="text-center space-y-4">
          <div className="text-8xl font-bold glitch-text select-none">:(</div>
          <div className="text-xs tracking-[0.4em] uppercase text-neutral-500 blink-text">
            Página no disponible
          </div>
        </div>
      </body>
    </html>
  );
}
