'use client'

import { useEffect } from "react"
import Link from 'next/link'
import { setLinkComponent, ClientContext } from '@servicestack/react'
import { client, init } from "@/lib/api/gateway"
import { useAppStore } from "@/lib/stores/useAppStore"

// Adapter component to convert react-router 'to' prop to Next.js 'href' prop
const NextLink = ({ to, ...props }: any) => <Link href={to || props.href} {...props} />

setLinkComponent(NextLink)

export default function Providers({ children }: { children: React.ReactNode }) {
  const initialize = useAppStore((state) => state.initialize)

  useEffect(() => {
    (async () => {
      await init()
      await initialize()
    })()
  }, [initialize])

  return (
    <ClientContext.Provider value={client}>
      {children}
    </ClientContext.Provider>
  )
}
