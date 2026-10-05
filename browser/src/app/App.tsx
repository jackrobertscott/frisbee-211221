import {Toaster} from '@ui'
import {useAuth} from '../core/auth/useAuth'
import {Router} from '../core/router/Router'
import {useRouter} from '../core/router/useRouter'
import {useReload} from '../core/hooks/useReload'
import {AuthScreen} from './auth/AuthScreen'
import {Dashboard} from './shell/Dashboard'
import {FixtureShare} from './fixtures/FixtureShare'
import {SeasonSetup} from './seasons/SeasonSetup'
import {Loading} from './common/Loading'
import {ShellProvider} from './shell/ShellProvider'

export function App() {
  return (
    <>
      <AppRoutes />
      <Toaster position="top-center" />
    </>
  )
}

function AppRoutes() {
  useReload()
  const router = useRouter()
  if (router.query.fixtureId)
    return <FixtureShare fixtureId={router.query.fixtureId} />
  return <AppGuard />
}

function AppGuard() {
  const auth = useAuth()
  const router = useRouter()
  const pathname = router.location?.pathname ?? ''
  if (!auth.loaded)
    return (
      <div className="fr-app">
        <Loading />
      </div>
    )
  if (!auth.season && !auth.current) return <AuthScreen />
  return (
    <Router
      fallback="/"
      routes={[
        (!auth.current || pathname.startsWith('/auth')) && {
          path: '/auth',
          render: () => <AuthScreen />,
        },
        {
          path: '/',
          render: () =>
            auth.season ? (
              <ShellProvider>
                <Dashboard />
              </ShellProvider>
            ) : (
              <ShellProvider>
                <SeasonSetup />
              </ShellProvider>
            ),
        },
      ]}
    />
  )
}
