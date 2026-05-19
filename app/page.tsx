import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <div className="min-h-[100dvh] bg-black flex flex-col items-center justify-center gap-8 p-6">
      <Image src="/logo.png" alt="Dance4ever" width={280} height={200} priority />
      <p className="text-gray-400 text-center">Programa en tiempo real</p>
      <Link href="/staff" className="bg-yellow-400 text-black w-64 text-center font-display text-2xl tracking-[0.3em] py-4 rounded-xl active:bg-yellow-300">
        STAFF
      </Link>
      <p className="text-center text-gray-500 text-xs max-w-xs">
        Los coaches acceden escaneando el QR del evento desde el panel de Staff
      </p>
    </div>
  )
}
