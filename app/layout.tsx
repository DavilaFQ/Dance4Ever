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
          @keyframes slow-pulse {
            0%, 100% { opacity: 0.95; filter: drop-shadow(0 0 2px rgba(239, 68, 68, 0.3)); }
            50% { opacity: 0.6; filter: drop-shadow(0 0 12px rgba(239, 68, 68, 0.8)); }
          }
          @keyframes terminal-glitch {
            0%, 94%, 98%, 100% { transform: scaleY(1) skewX(0deg); filter: brightness(1); }
            95% { transform: scaleY(1.4) skewX(12deg) scaleX(0.9); filter: brightness(1.8) red; }
            96% { transform: scaleY(0.7) skewX(-15deg) scaleX(1.1); filter: brightness(0.6); }
            97% { transform: scaleY(1.1) skewX(4deg); filter: brightness(1.2); }
          }
          .glitch-container {
            animation: terminal-glitch 5s infinite;
          }
          .sad-face {
            font-size: 130px;
            font-weight: 300;
            color: #ef4444;
            text-shadow: 0 0 20px rgba(239, 68, 68, 0.8);
            animation: slow-pulse 3s infinite ease-in-out;
            user-select: none;
          }
          .error-text {
            font-size: 13px;
            font-weight: bold;
            letter-spacing: 0.6em;
            color: #ef4444;
            text-shadow: 0 0 10px rgba(239, 68, 68, 0.6);
            animation: slow-pulse 3s infinite ease-in-out;
            user-select: none;
          }
        `}</style>
      </head>
      <body className="bg-black text-white min-h-screen flex flex-col items-center justify-center font-mono select-none" style={{ backgroundColor: 'black' }}>
        <div className="text-center glitch-container">
          {/* Carita triste con mayor separación (margin-bottom: 48px / pb-12) */}
          <div className="sad-face mb-12">:(</div>
          {/* Texto en rojo y espaciado */}
          <div className="error-text">
            page not found
          </div>
        </div>
      </body>
    </html>
  );
}
