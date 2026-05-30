'use client'
import { useState, useEffect } from 'react'
import { type Event, AGE_CATEGORY_LABELS } from '@/lib/supabase'
import { type State, type Step } from '@/components/register/types'
import SignaturePad from '@/components/register/SignaturePad'

import { formatEventDate } from '@/components/register/utils'

export default function CartaResponsiva({
  state, event, signature, setSignature,
  confirm, saving, goToStep,
}: {
  state: State
  event: Event | null
  signature: string | null
  setSignature: (s: string | null) => void
  confirm: () => Promise<void>
  saving: boolean
  goToStep: (s: Step) => void
}) {
  const coachName = state.coach.name || '______________________________'
  const academy = state.academy || '______________________________'
  const eventName = event?.name || '______________________________'
  const eventDate = event?.date ? formatEventDate(event.date) : '______________________________'
  const today = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  const categories = [...new Set(state.acts.filter(a => a.ageCategory).map(a => AGE_CATEGORY_LABELS[a.ageCategory!]))].join(', ') || '______________________________'

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }) }, [])

  return (
    <div className="space-y-4 py-2 px-0 sm:px-2 max-w-2xl mx-auto text-sm leading-relaxed text-[rgb(var(--c-text-strong))]">
      <h2 className="font-display text-2xl text-center uppercase tracking-wider text-[rgb(var(--c-primary))]">
        Carta Responsiva
      </h2>
      <h2 className="font-display text-2xl text-center uppercase tracking-wider text-[rgb(var(--c-primary))]">
        Y Acuerdo de Conformidad
      </h2>

      <div className="bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.4)] rounded-2xl p-5 space-y-3.5 text-[11px] sm:text-xs">
        <p>
          Yo, <strong className="text-[rgb(var(--c-primary))]">{coachName}</strong>, en mi calidad de representante legal, director y/o persona responsable del Colegio o Academia <strong>{academy}</strong>, declaro bajo protesta de decir verdad que cuento con las autorizaciones expresas, firmas y consentimientos por escrito de los padres o tutores legales de cada uno de los integrantes menores de edad registrados, otorgándome facultad amplia y suficiente para representarlos en el evento <strong>{eventName}</strong>, autorizar su participación y aceptar los términos del presente instrumento en su nombre.
        </p>
        <p>
          Manifiesto mi conformidad y aceptación absoluta de las bases, lineamientos, <strong>CONVOCATORIA y REGLAMENTO</strong> oficial de DANCE4EVER. Acepto que cualquier decisión del Comité Organizador, penalización o descalificación derivada del incumplimiento de dichas normativas por parte de cualquier miembro de mi delegación (alumnos, bailarines, coreógrafos, personal de apoyo o padres de familia acompañantes), será entera y exclusiva responsabilidad de mi equipo y de mi persona, deslindando a los organizadores de cualquier reclamo.
        </p>
        <p>
          Asimismo, otorgo a DANCE4EVER de manera irrevocable, perpetua y gratuita la <strong>cesión de derechos de uso de imagen, voz, fotografía y video</strong> de los participantes inscritos en los que pudieran aparecer durante el desarrollo del evento, con fines informativos, de difusión cultural, comerciales o promocionales, pudiendo ser reproducidos y distribuidos total o parcialmente en medios digitales, impresos y redes sociales oficiales.
        </p>
        <p>
          <strong>DECLARACIÓN DE RIESGOS Y COBERTURA MÉDICA:</strong> Reconozco y acepto que la danza y disciplinas afines implican un esfuerzo físico riguroso y conllevan riesgos inherentes de lesiones (esguinces, fracturas u otros accidentes). Declaro expresamente que todos los participantes cuentan con una póliza de seguro médico vigente (público o privado) y que DANCE4EVER únicamente brindará asistencia de primeros auxilios y paramédicos de emergencia en el recinto. Libero de toda responsabilidad civil, penal, administrativa o de cualquier otra índole a los Directivos, organizadores, patrocinadores, staff de DANCE4EVER y a los operadores del recinto sede ante cualquier percance que pudiera suscitarse durante el transcurso del evento.
        </p>
        <p>
          <strong>ACUERDO DE VALIDEZ DE FIRMA ELECTRÓNICA:</strong> Ambas partes reconocen que la firma digital/holográfica plasmada y capturada electrónicamente en este portal tiene pleno valor probatorio y efectos jurídicos equivalentes a una firma física autógrafa, de conformidad con lo establecido en el Artículo 89 del Código de Comercio y demás legislación aplicable en los Estados Unidos Mexicanos. Para la interpretación y cumplimiento de este instrumento, las partes se someten expresamente a las leyes aplicables y a la jurisdicción de los tribunales competentes de la Ciudad de México, renunciando a cualquier otro fuero que por razón de sus domicilios presentes o futuros pudiera corresponderles.
        </p>
      </div>

      <div className="bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.4)] rounded-2xl p-5 space-y-2.5 text-xs sm:text-sm">
        <div><strong>Nombre del equipo:</strong> {academy}</div>
        <div><strong>Competencia a la que asisten:</strong> {eventName}</div>
        <div><strong>Categorías:</strong> {categories}</div>
        <div><strong>Fecha del evento:</strong> {eventDate}</div>
        <div><strong>Fecha de firma:</strong> {today}</div>
        <div><strong>Nombre y Cargo del Responsable:</strong> {coachName} — Coach / Responsable Autorizado</div>
        <div>
          <strong className="block mb-1">Firma Digital del Responsable:</strong>
          <SignaturePad value={signature} onChange={setSignature} />
        </div>
      </div>

      <p className="text-center text-[10px] text-[rgb(var(--c-text)/0.5)]">
        Al hacer clic en CONFIRMAR REGISTRO aceptas los términos de esta carta responsiva.
      </p>
    </div>
  )
}
