'use client'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { canGoBackInApp, popNavigation } from '@/lib/navigationHistory'

interface Props {
  fallbackHref: string
  label: string
  className?: string
}

export default function BackButton({ fallbackHref, label, className }: Props) {
  const router = useRouter()

  const handleClick = () => {
    if (canGoBackInApp()) {
      popNavigation()
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }

  return (
    <button onClick={handleClick} className={className}>
      <ArrowLeft className="w-4 h-4" />
      <span>{label}</span>
    </button>
  )
}
