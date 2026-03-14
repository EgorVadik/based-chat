import { api } from '@based-chat/backend/convex/_generated/api'
import { Button } from '@based-chat/ui/components/button'
import { Input } from '@based-chat/ui/components/input'
import { cn } from '@based-chat/ui/lib/utils'
import { useMutation } from 'convex/react'
import {
  AlertTriangle,
  Laptop,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  X,
  LoaderCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { authClient } from '@/lib/auth-client'

// ─── User-Agent Parsing ──────────────────────────────────────────────

type DeviceInfo = {
  type: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  os: string
  browser: string
}

function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  if (!ua) {
    return { type: 'unknown', os: 'Unknown', browser: 'Unknown' }
  }

  // Detect OS
  let os = 'Unknown'
  if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'macOS'
  else if (/Linux/i.test(ua) && !/Android/i.test(ua)) os = 'Linux'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'
  else if (/CrOS/i.test(ua)) os = 'Chrome OS'

  // Detect browser
  let browser = 'Unknown'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera'
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome'
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/Arc\//i.test(ua)) browser = 'Arc'

  // Detect device type
  let type: DeviceInfo['type'] = 'desktop'
  if (/iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    type = 'tablet'
  } else if (/iPhone|iPod|Android.*Mobile|webOS|BlackBerry/i.test(ua)) {
    type = 'mobile'
  }

  return { type, os, browser }
}

function getDeviceIcon(type: DeviceInfo['type']) {
  switch (type) {
    case 'mobile':
      return Smartphone
    case 'tablet':
      return Tablet
    case 'desktop':
      return Monitor
    default:
      return Laptop
  }
}

// ─── Session Types ───────────────────────────────────────────────────

type Session = {
  id: string
  token: string
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
  ipAddress?: string | null
  userAgent?: string | null
}

// ─── Component ───────────────────────────────────────────────────────

export default function SecurityTab() {
  const deleteAccount = useMutation(
    (api.auth as { deleteAccount: any }).deleteAccount,
  )

  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionToken, setCurrentSessionToken] = useState<string | null>(
    null,
  )
  const [isLoadingSessions, setIsLoadingSessions] = useState(true)
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(
    null,
  )

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  // Fetch sessions
  useEffect(() => {
    let cancelled = false

    async function fetchSessions() {
      try {
        const result = await authClient.listSessions()

        if (cancelled) return

        if (result.data) {
          setSessions(result.data)
        }

        // Get current session
        const sessionResult = await authClient.getSession()
        if (!cancelled && sessionResult.data) {
          setCurrentSessionToken(sessionResult.data.session.token)
        }
      } catch {
        if (!cancelled) {
          toast.error('Failed to load sessions.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSessions(false)
        }
      }
    }

    fetchSessions()

    return () => {
      cancelled = true
    }
  }, [])

  const handleRevokeSession = async (session: Session) => {
    setRevokingSessionId(session.id)

    try {
      await authClient.revokeSession({
        token: session.token,
      })

      setSessions((prev) => prev.filter((s) => s.id !== session.id))
      toast.success('Session revoked.')
    } catch {
      toast.error('Failed to revoke session.')
    } finally {
      setRevokingSessionId(null)
    }
  }

  const handleRevokeOtherSessions = async () => {
    try {
      await authClient.revokeOtherSessions()

      setSessions((prev) => prev.filter((s) => s.token === currentSessionToken))
      toast.success('All other sessions revoked.')
    } catch {
      toast.error('Failed to revoke sessions.')
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'delete my account' || isDeleting) return

    setIsDeleting(true)

    try {
      // Delete all user data from Convex
      await deleteAccount({ confirmation: deleteConfirmText })

      // Delete the auth user via better-auth
      await authClient.deleteUser()

      toast.success('Account deleted.')

      // Sign out and redirect
      await authClient.signOut()
      window.location.href = '/sign-in'
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete account.',
      )
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className='space-y-10'>
      {/* Header */}
      <div>
        <h2 className='text-xl font-semibold tracking-tight'>Security</h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          Manage your active sessions and account security.
        </p>
      </div>

      {/* ── Active Sessions ─────────────────────────────────────── */}
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <div>
            <h3 className='text-sm font-medium'>Active Devices</h3>
            <p className='mt-0.5 text-xs text-muted-foreground'>
              These devices are currently signed into your account.
            </p>
          </div>
          {sessions.length > 1 && (
            <Button
              variant='outline'
              size='xs'
              onClick={handleRevokeOtherSessions}
            >
              Revoke all others
            </Button>
          )}
        </div>

        <div className='overflow-hidden rounded-lg border border-border/50'>
          <div className='divide-y divide-border/30'>
            {isLoadingSessions && (
              <div className='flex items-center justify-center py-10'>
                <LoaderCircle className='size-4 animate-spin text-muted-foreground/50' />
              </div>
            )}

            {!isLoadingSessions && sessions.length === 0 && (
              <div className='py-10 text-center'>
                <p className='text-xs text-muted-foreground/50'>
                  No active sessions found.
                </p>
              </div>
            )}

            {!isLoadingSessions &&
              sessions.map((session) => {
                const device = parseUserAgent(session.userAgent)
                const DeviceIcon = getDeviceIcon(device.type)
                const isCurrent = session.token === currentSessionToken
                const isRevoking = revokingSessionId === session.id

                return (
                  <div
                    key={session.id}
                    className={cn(
                      'group flex items-center gap-3.5 px-4 py-3.5 transition-colors',
                      isCurrent && 'bg-primary/3',
                    )}
                  >
                    {/* Device icon */}
                    <div
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-lg',
                        isCurrent
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted/40 text-muted-foreground',
                      )}
                    >
                      <DeviceIcon className='size-4' />
                    </div>

                    {/* Info */}
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center gap-2'>
                        <p className='text-xs font-medium truncate'>
                          {device.browser} on {device.os}
                        </p>
                        {isCurrent && (
                          <span className='shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary uppercase tracking-wider'>
                            Current
                          </span>
                        )}
                      </div>
                      <div className='mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/60'>
                        {session.ipAddress && (
                          <span className='flex items-center gap-1'>
                            <Globe className='size-2.5' />
                            {session.ipAddress}
                          </span>
                        )}
                        <span>
                          Last active{' '}
                          {new Date(session.updatedAt).toLocaleDateString(
                            'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            },
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Revoke button (not for current session) */}
                    {!isCurrent && (
                      <button
                        onClick={() => handleRevokeSession(session)}
                        disabled={isRevoking}
                        className='shrink-0 cursor-pointer rounded p-1 text-muted-foreground/20 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all disabled:cursor-not-allowed disabled:opacity-50'
                        type='button'
                      >
                        {isRevoking ? (
                          <LoaderCircle className='size-3.5 animate-spin' />
                        ) : (
                          <X className='size-3.5' />
                        )}
                      </button>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      {/* ── Danger Zone ─────────────────────────────────────────── */}
      <div className='space-y-4'>
        <div className='rounded-xl border border-destructive/20 bg-destructive/3'>
          <div className='px-5 py-4'>
            <div className='flex items-center gap-2'>
              <AlertTriangle className='size-4 text-destructive' />
              <h3 className='text-sm font-medium text-destructive'>
                Danger Zone
              </h3>
            </div>
            <p className='mt-1.5 text-xs text-muted-foreground'>
              Permanently delete your account and all associated data. This
              includes all threads, messages, attachments, model preferences,
              and profile information. This action cannot be undone.
            </p>

            {!showDeleteConfirm ? (
              <div className='mt-4'>
                <Button
                  variant='destructive'
                  size='sm'
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete account
                </Button>
              </div>
            ) : (
              <div className='mt-4 space-y-3 rounded-lg border border-destructive/20 bg-background p-4'>
                <p className='text-xs text-muted-foreground'>
                  To confirm, type{' '}
                  <span className='font-mono font-medium text-destructive'>
                    delete my account
                  </span>{' '}
                  below:
                </p>
                <Input
                  placeholder='delete my account'
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className='h-9 rounded-lg border-destructive/30 bg-muted/20 font-mono text-xs focus-visible:border-destructive/50 focus-visible:ring-destructive/20'
                  autoFocus
                />
                <div className='flex items-center gap-2'>
                  <Button
                    variant='destructive'
                    size='sm'
                    disabled={
                      deleteConfirmText !== 'delete my account' || isDeleting
                    }
                    onClick={handleDeleteAccount}
                  >
                    {isDeleting ? (
                      <>
                        <LoaderCircle className='size-3 animate-spin' />
                        Deleting...
                      </>
                    ) : (
                      'Permanently delete account'
                    )}
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => {
                      setShowDeleteConfirm(false)
                      setDeleteConfirmText('')
                    }}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
