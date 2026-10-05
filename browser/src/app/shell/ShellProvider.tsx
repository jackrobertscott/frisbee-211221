import {authPoint} from '@shared/auth/authAccess'
import {toast} from '@ui'
import {createContext, type ReactNode, useContext, useMemo, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {navigate} from '../../core/router/navigate'

/** App-level dialogs that any page can open. */
export type TOverlay =
  | {kind: 'report'}
  | {kind: 'settings'; tab?: string}
  | {kind: 'join'}
  | {kind: 'logout'}
  | {kind: 'seasonCreate'}
  | null

interface TShell {
  overlay: TOverlay
  open: (overlay: TOverlay) => void
  close: () => void
  /** Starts the score report flow, routing visitors to sign in or join a team first. */
  reportScore: () => void
  /** Bumped after app-level mutations (e.g. a report submitted) so pages can re-fetch. */
  version: number
  invalidate: () => void
}

const ShellContext = createContext<TShell | null>(null)

export const useShell = () => {
  const shell = useContext(ShellContext)
  if (!shell) throw new Error('useShell must be used inside <ShellProvider>')
  return shell
}

export function ShellProvider({children}: {children: ReactNode}) {
  const auth = useAuth()
  const [overlay, overlaySet] = useState<TOverlay>(null)
  const [version, versionSet] = useState(0)
  const value = useMemo<TShell>(
    () => ({
      overlay,
      open: overlaySet,
      close: () => overlaySet(null),
      version,
      invalidate: () => versionSet((v) => v + 1),
      reportScore: () => {
        if (!auth.current) {
          toast('Please sign in to submit a score report.')
          navigate('/auth')
          return
        }
        if (!auth.can(authPoint.reportWrite)) {
          toast('Please join a team to submit a score report.')
          overlaySet({kind: 'join'})
          return
        }
        overlaySet({kind: 'report'})
      },
    }),
    [overlay, version, auth],
  )
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}
