import marlowPng from '../../assets/marlowstreet.png'
import {css} from '@emotion/css'
import {createElement as $, FC, useState} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {SecurityLogin} from './SecurityLogin'
import {SecurityForgot} from './SecurityForgot'
import {SecuritySignUp} from './SecuritySignUp'
import {useLocalState} from '../useLocalState'
import {Center} from '../Center'
import {SecurityStatus, TSecurityStatus} from './SecurityStatus'
import {hsla} from '../../utils/hsla'
import {go} from '../../utils/go'
import {SecurityVerify} from './SecurityVerify'
import {Router} from '../Router/Router'
import {useRouter} from '../Router/useRouter'
/**
 *
 */
export const Security: FC = () => {
  const [status, statusSet] = useState<TSecurityStatus>()
  const [savedEmail, savedEmailSet] = useLocalState('frisbee.savedEmail', '')
  const router = useRouter()
  return $('div', {
    className: css({
      width: '100%',
      height: '100%',
      display: 'flex',
      padding: theme.fib[6],
      [theme.ltMedia(theme.fib[12])]: {
        padding: 0,
        border: theme.border(),
      },
    }),
    children: $(Center, {
      children: addkeys([
        $('div', {
          className: css({
            display: 'flex',
            justifyContent: 'center',
            marginBottom: theme.fib[6],
            marginRight: theme.fib[4],
            [theme.ltMedia(theme.fib[12])]: {
              marginBottom: theme.fib[5],
              marginTop: theme.fib[6],
            },
          }),
          children: $('div', {
            className: css({
              position: 'relative',
            }),
            children: addkeys([
              $('img', {
                src: marlowPng,
                className: css({
                  width: theme.fib[11],
                  position: 'relative',
                  zIndex: 10,
                }),
              }),
              $('div', {
                className: css({
                  width: theme.fib[5],
                  height: theme.fib[10],
                  background: hsla.string(0, 0, 0),
                  borderRadius: 3,
                  position: 'absolute',
                  right: 24,
                  top: -5,
                }),
              }),
            ]),
          }),
        }),
        $('div', {
          className: css({
            maxWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            width: theme.fib[12],
            border: theme.border(),
            background: theme.bg.string(),
            [theme.ltMedia(theme.fib[12])]: {
              border: 'none',
              borderTop: theme.border(),
              flexGrow: 1,
            },
          }),
          children: $(Router, {
            fallback: '/welcome',
            routes: [
              {
                path: '/welcome',
                label: 'Welcome',
                description: 'Please provide your email address.',
                render: () =>
                  $(SecurityStatus, {
                    email: savedEmail,
                    statusSet: (data) => {
                      statusSet(data)
                      if (data.status === 'good') go.to('/login')
                      else if (data.status === 'unknown') go.to('/sign-up')
                      else {
                        const url =
                          `/verify?email=${encodeURIComponent(data.email)}` +
                          `&status=${encodeURIComponent(data.status)}`
                        go.to(url)
                      }
                    },
                  }),
              },
              {
                path: '/login',
                label: 'Login',
                description: 'Please sign in to your account.',
                render: () =>
                  $(SecurityLogin, {
                    email: status?.email ?? savedEmail,
                    savedEmailSet,
                  }),
              },
              {
                path: '/sign-up',
                label: 'Sign Up',
                description: 'Create an account to get started.',
                render: () =>
                  $(SecuritySignUp, {
                    email: status?.email,
                    savedEmailSet,
                  }),
              },
              {
                path: '/forgot-password',
                label: 'Forgot Password',
                description:
                  'A password recovery code will be sent to your email.',
                render: () =>
                  $(SecurityForgot, {
                    ...router.query,
                  }),
              },
              {
                path: '/verify',
                label: 'Verify Email',
                description: 'Check you inbox for the code.',
                render: () =>
                  $(SecurityVerify, {
                    ...router.query,
                  }),
              },
            ],
            render: (children, context) =>
              addkeys([
                $('div', {
                  className: css({
                    borderBottom: theme.border(),
                    padding: theme.padify(theme.fib[5]),
                  }),
                  children: addkeys([
                    $('div', {
                      children: context.current?.label,
                    }),
                    $('div', {
                      children: context.current?.description,
                      className: css({
                        paddingTop: theme.fib[2],
                        color: theme.fontMinor.string(),
                      }),
                    }),
                  ]),
                }),
                $('div', {
                  children,
                  className: css({
                    background: theme.bgMinor.string(),
                    flexGrow: 1,
                  }),
                }),
              ]),
          }),
        }),
      ]),
    }),
  })
}
