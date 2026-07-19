'use client'
import { usePathname } from 'next/navigation'
import { NAV_LINKS, isActive, ProfileAvatar } from '@/components/Navbar'
import Link from 'next/link'

/** Nav pill + profile avatar shared by every section's top bar (Bacheca, Guide, Resoconti, Diario) —
 * kept as one component so they stay pixel-for-pixel identical instead of drifting apart. */
export default function HubNavBar() {
  const path = usePathname()

  return (
    <div className="flex items-center gap-2">
      <div className="pointer-events-auto flex-1 flex items-center justify-around bg-forest-900/90 backdrop-blur-md rounded-full px-2.5 py-2 shadow-lg max-w-sm">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, path ?? '')
          return (
            <Link key={href} href={href} className={`flex flex-col items-center gap-1 px-2 sm:px-3 py-1 ${active ? 'text-white' : 'text-forest-300'}`}>
              <Icon className="w-5 h-5" strokeWidth={2} />
              <span className="text-[10px] font-bold leading-none whitespace-nowrap">{label}</span>
            </Link>
          )
        })}
      </div>

      <div className="pointer-events-auto shrink-0 rounded-full ring-2 ring-black/30">
        <ProfileAvatar size={36} iconSize={16} />
      </div>
    </div>
  )
}
