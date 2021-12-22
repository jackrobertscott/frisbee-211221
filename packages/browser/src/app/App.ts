import {createElement as $, FC} from 'react'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {Security} from './Security/Security'
/**
 *
 */
export const App: FC = () => {
  const auth = useAuth()
  if (!auth.current) {
    return $(Security)
  }
  return $(Form, {
    children: $(FormButton, {
      label: 'Logout',
      click: () => auth.logout(),
    }),
  })
}
