import Image from 'next/image'

export default function Home() {
  return (
    <div className="min-h-[100dvh] bg-black flex flex-col items-center justify-center p-6 select-none relative overflow-hidden">
      {/* Sutil resplandor radial de fondo */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_0%,transparent_60%)] pointer-events-none" />

      {/* Logotipo de marca centrado */}
      <div className="relative z-10 opacity-90 transition-opacity hover:opacity-100 duration-300">
        <Image src="/logo.png" alt="Dance4ever" width={280} height={200} priority className="h-auto w-auto animate-fade-in" />
      </div>
    </div>
  )
}

