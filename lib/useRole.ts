import { useEffect, useState } from 'react'
import { getCurrentUser } from './auth'
import { getUserProfileByUserId } from '../db/queries'

export type UserRole = 'superadmin' | 'admin' | 'user' | 'guest'

export function useRole() {
  const [role, setRole] = useState<UserRole>('guest')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const user = await getCurrentUser()
        if (!user) { setRole('guest'); return }
        const profile = await getUserProfileByUserId(user.id)
        setRole((profile?.role as UserRole) ?? 'user')
      } catch {
        setRole('user')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return {
    role,
    loading,
    isSuperAdmin: role === 'superadmin',
    isAdmin: role === 'admin',
    isUser: role === 'user',
    canManageChords: role === 'superadmin',                          // artists, chord_lists, songs
    canManageContent: role === 'superadmin' || role === 'admin',     // lineups, files, announcements, versions
    canMessage: role !== 'guest',
    canEditProfile: role !== 'guest',
    canAddContacts: role !== 'guest',
  }
}