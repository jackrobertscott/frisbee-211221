import {createElement as $, FC} from 'react'
import {useAuth} from './Auth/useAuth'
import {Center} from './Center'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {useRouter} from './Router/useRouter'
/**
 *
 */
export const Dashboard: FC = () => {
  const auth = useAuth()
  const router = useRouter('/home', [
    {
      path: '/home',
      render: () =>
        $(Form, {
          children: $(FormButton, {
            label: 'Logout',
            click: () => auth.logout(),
          }),
        }),
    },
  ])
  return $(Center, {
    children: router.render(),
  })
}
