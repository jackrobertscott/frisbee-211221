import {createElement as $, FC} from 'react'
import {FormBadge, TFormBadge} from './FormBadge'
/**
 *
 */
export const FormLabel: FC<TFormBadge> = ({...props}) => {
  return $(FormBadge, {
    ...props,
    style: {
      textAlign: 'left',
      justifyContent: 'flex-start',
      ...props.style,
    },
  })
}
