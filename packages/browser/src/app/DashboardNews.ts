import {css} from '@emotion/css'
import {createElement as $, FC, useState} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {Form} from './Form/Form'
/**
 *
 */
export const DashboardNews: FC = () => {
  return $(Form, {
    children: addkeys([
      $(_NewsPost, {
        title: 'Game 1 Wrap Up',
        content: _EXAMPLE_MESSAGE,
      }),
      $(_NewsPost, {
        title: 'Game 1 Wrap Up',
        content: _EXAMPLE_MESSAGE,
      }),
      $(_NewsPost, {
        title: 'Game 1 Wrap Up',
        content: _EXAMPLE_MESSAGE,
      }),
    ]),
  })
}
/**
 *
 */
const _NewsPost: FC<{
  title: string
  content: string
}> = ({title, content}) => {
  const [open, openSet] = useState(false)
  return $('div', {
    className: css({
      border: theme.border,
    }),
    children: addkeys([
      $('div', {
        className: css({
          padding: theme.padify(theme.formPadding),
          '& > *:not(:last-child)': {
            marginBottom: theme.formPadding,
          },
        }),
        children: addkeys([
          $('div', {
            children: title,
            className: css({
              fontSize: 21,
            }),
          }),
          $('div', {
            children: open
              ? content
              : content.slice(0, 233).concat(content.length > 233 ? '...' : ''),
            className: css({
              color: theme.labelColor,
              whiteSpace: 'pre-line',
            }),
          }),
        ]),
      }),
      $('div', {
        children: '0 Comments',
        onClick: () => openSet((i) => !i),
        className: css({
          borderTop: theme.border,
          background: theme.bgMinorColor,
          padding: theme.padify(theme.formPadding),
        }),
      }),
    ]),
  })
}
/**
 *
 */
const _EXAMPLE_MESSAGE = `
Howdy frisbee folks. Here are some teams I've put together for tomorrow's muck-around. Don’t worry if your name or someone you know isn’t on this, it’s only pulled from my poll. We’re fully expecting to have more people turn up than we know what to do with, so we’ll try divide everyone up as evenly as possible. Hopefully these teams are balanced but we’ll find out tomorrow. Just please bring a light and dark shirt to play in.

The format will be 3, 30-minute games across 5 slightly smaller fields so we can have as many games running at once as possible. There’ll also be some mini games running on the side like longest huck with some sweet prizes up for grabs.

Additionally, we’re blatantly stealing my favourite part of Santa’s hat, the extra points rule. Each team will need to discuss amongst themselves before each game to decide what their extra points rule will be. For example, throwing a score with your non-dominant hand, or a hammer, or you’ve got to hold someone’s hand while throwing, or catch between your legs and so on. If you then score while performing one of the rules, it’s worth two points. If you score while doing both rules, it’ll be worth 4 points.
`.trim()
