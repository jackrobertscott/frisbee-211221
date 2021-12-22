import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {useRouter} from '../Router/useRouter'
import {SecurityLogin} from './SecurityLogin'
import {SecurityReset} from './SecurityReset'
import {SecuritySignUp} from './SecuritySignUp'
/**
 *
 */
export const Security: FC = () => {
  const router = useRouter('/login', [
    {
      path: '/login',
      label: 'Login',
      message: 'Please sign in to your account.',
      render: () => $(SecurityLogin),
    },
    {
      path: '/sign-up',
      label: 'Sign Up',
      message: 'Create an account to get started.',
      render: () => $(SecuritySignUp),
    },
    {
      path: '/forgot-password',
      label: 'Forgot Password',
      message: 'Reset your password.',
      render: () => $(SecurityReset),
    },
  ])
  return $('div', {
    className: css({
      padding: 13,
      width: '100%',
      height: '100%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      // todo: make sure scroll works on short screens...
    }),
    children: $('div', {
      className: css({
        width: 377,
        border: theme.border,
      }),
      children: addkeys([
        $('div', {
          className: css({
            borderBottom: theme.border,
            padding: theme.padify(theme.formPadding),
          }),
          children: addkeys([
            $('div', {
              children: router.current?.label,
            }),
            $('div', {
              children: router.current?.message,
              className: css({
                paddingTop: 5,
                opacity: 0.5,
              }),
            }),
          ]),
        }),
        router.render(),
      ]),
    }),
  })
}
