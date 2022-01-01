import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {useRouter} from '../Router/useRouter'
import {SecurityLogin} from './SecurityLogin'
import {SecurityForgot} from './SecurityForgot'
import {SecuritySignUp} from './SecuritySignUp'
import {useLocalState} from '../useLocalState'
import {Center} from '../Center'
/**
 *
 */
export const Security: FC = () => {
  const [savedEmail, savedEmailSet] = useLocalState('frisbee.savedEmail', '')
  const router = useRouter('/login', [
    {
      path: '/login',
      label: 'Login',
      message: 'Please sign in to your account.',
      render: () =>
        $(SecurityLogin, {
          savedEmail,
          savedEmailSet,
        }),
    },
    {
      path: '/sign-up',
      label: 'Sign Up',
      message: 'Create an account to get started.',
      render: () =>
        $(SecuritySignUp, {
          savedEmailSet,
        }),
    },
    {
      path: '/forgot-password',
      label: 'Forgot Password',
      message: 'Reset your password.',
      render: () => $(SecurityForgot),
    },
  ])
  return $(Center, {
    children: $('div', {
      className: css({
        width: 377,
        border: theme.border,
        background: theme.bgColor,
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
                color: theme.minorColor,
              }),
            }),
          ]),
        }),
        $('div', {
          children: router.render(),
          className: css({
            background: theme.bgMinorColor,
          }),
        }),
      ]),
    }),
  })
}
