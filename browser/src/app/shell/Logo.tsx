import pulPng from '../../assets/logopul.png'
import marlowPng from '../../assets/marlowstreet.png'
import {config} from '../../config'

/** The configured league's mark. Marlow's is a wide wordmark, so size sets height. */
export function Logo({size = 32}: {size?: number}) {
  if (config.leagueKey === 'marlow')
    return (
      <img
        className="fr-logo"
        src={marlowPng}
        alt=""
        height={size}
        style={{height: size, width: 'auto'}}
      />
    )
  return (
    <img
      className="fr-logo"
      src={pulPng}
      alt=""
      width={size}
      height={size}
    />
  )
}
