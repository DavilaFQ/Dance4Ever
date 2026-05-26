import Image from 'next/image'

export default function MaintenancePage() {
  return (
    <div className="min-h-[100dvh] bg-black flex flex-col items-center justify-center gap-8 p-6 select-none">
      <Image src="/logo.png" alt="Dance4ever" width={240} height={180} priority />

      <div className="text-center space-y-3 max-w-sm">
        <h1 className="font-display text-3xl sm:text-4xl tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 via-purple-400 to-amber-400 uppercase font-black">
          Próximamente
        </h1>
        <p className="text-gray-400 text-sm leading-relaxed">
          Estamos preparando algo increíble. La plataforma estará disponible muy pronto.
        </p>
      </div>

      <div className="flex flex-col items-center gap-2 mt-4">
        <div className="w-16 h-[2px] bg-gradient-to-r from-fuchsia-500 via-purple-500 to-amber-500 rounded-full" />
        <p className="text-gray-600 text-[10px] tracking-[0.3em] uppercase font-medium">
          Dance4ever
        </p>
      </div>
    </div>
  )
}
