'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function SafetyObservationsRedirect() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  useEffect(() => {
    router.replace(`/projects/${projectId}/safety?tab=observations`)
  }, [projectId])

  return null
}
