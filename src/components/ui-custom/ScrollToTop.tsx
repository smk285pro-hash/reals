'use client'

import { ArrowUp } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

export function ScrollToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <Button
      className="fixed bottom-20 right-4 z-40 h-10 w-10 rounded-full bg-[#272727] text-[#aaa] shadow-lg hover:bg-[#3a3a3a] hover:text-white md:bottom-6"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <ArrowUp className="h-5 w-5" />
    </Button>
  )
}
