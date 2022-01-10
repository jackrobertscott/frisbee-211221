import marlowPng from '../../assets/marlowstreet.png'
import {css} from '@emotion/css'
import {createElement as $, FC, useState} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {useRouter} from '../Router/useRouter'
import {SecurityLogin} from './SecurityLogin'
import {SecurityForgot} from './SecurityForgot'
import {SecuritySignUp} from './SecuritySignUp'
import {useLocalState} from '../useLocalState'
import {Center} from '../Center'
import {SecurityStatus, TSecurityStatus} from './SecurityStatus'
import {hsla} from '../../utils/hsla'
import {go} from '../../utils/go'
import {SecurityVerify} from './SecurityVerify'
/**
 *
 */
export const Security: FC = () => {
  const [status, statusSet] = useState<TSecurityStatus>()
  const [savedEmail, savedEmailSet] = useLocalState('frisbee.savedEmail', '')
  const router = useRouter('/welcome', [
    {
      path: '/welcome',
      label: 'Welcome',
      message: 'Please provide your email address.',
      render: () =>
        $(SecurityStatus, {
          email: savedEmail,
          statusSet: (data) => {
            statusSet(data)
            if (data.status === 'unknown') go.to('/sign-up')
            else if (data.status === 'passwordless')
              go.to(`/verify?email=${encodeURIComponent(data.email)}`)
            else go.to('/login')
          },
        }),
    },
    {
      path: '/login',
      label: 'Login',
      message: 'Please sign in to your account.',
      render: () =>
        $(SecurityLogin, {
          email: status?.email ?? savedEmail,
          savedEmailSet,
        }),
    },
    {
      path: '/sign-up',
      label: 'Sign Up',
      message: 'Create an account to get started.',
      render: () =>
        $(SecuritySignUp, {
          email: status?.email,
          savedEmailSet,
        }),
    },
    {
      path: '/forgot-password',
      label: 'Forgot Password',
      message: 'A password recovery code will be sent to your email.',
      render: (_: any, query: Record<string, any>) =>
        $(SecurityForgot, {
          email: query.email,
        }),
    },
    {
      path: '/verify',
      label: 'Verify Email',
      message: 'Check you inbox for the code.',
      render: (_: any, query: Record<string, any>) =>
        $(SecurityVerify, {
          email: query.email,
        }),
    },
  ])
  return $(Center, {
    children: addkeys([
      $('div', {
        className: css({
          display: 'flex',
          justifyContent: 'center',
          marginBottom: theme.fib[6],
          marginRight: theme.fib[4],
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
          maxWidth: theme.fib[12],
          border: theme.border(),
          background: theme.bg.string(),
          position: 'relative',
        }),
        children: addkeys([
          $('div', {
            className: css({
              borderBottom: theme.border(),
              padding: theme.padify(theme.fib[5]),
            }),
            children: addkeys([
              $('div', {
                children: router.current?.label,
              }),
              $('div', {
                children: router.current?.message,
                className: css({
                  paddingTop: theme.fib[2],
                  color: theme.fontMinor.string(),
                }),
              }),
            ]),
          }),
          $('div', {
            children: router.render(),
            className: css({
              background: theme.bgMinor.string(),
            }),
          }),
        ]),
      }),
    ]),
  })
}
