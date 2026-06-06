import {FormHelp} from '@browser/app/Form/FormHelp'
import {InputBoolean} from '@browser/app/Input/InputBoolean'
import {InputSelect} from '@browser/app/Input/InputSelect'
import {
  $SeasonDelete,
  $SeasonDeleteStatus,
  $SeasonUpdate,
} from '@browser/endpoints/Season'
import {theme} from '@browser/theme'
import {isSeasonGenderDivision} from '@shared/schemas/ioSeason'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {addkeys} from '../../utils/addkeys'
import {local} from '../../utils/local'
import {useAuth} from '../Auth/useAuth'
import {SEASON_STORAGE_KEY} from '../Auth/authStorage'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputString} from '../Input/InputString'
import {Modal} from '../Modal'
import {Poster} from '../Poster'
import {useToaster} from '../Toaster/useToaster'
import {TopBar, TopBarBadge} from '../TopBar'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'

export const SettingsSeason: FC = () => {
  const auth = useAuth()
  const toaster = useToaster()
  const $updateSeason = useEndpoint($SeasonUpdate)
  const $deleteStatus = useEndpoint($SeasonDeleteStatus)
  const [canDelete, canDeleteSet] = useState(false)
  const [deleting, deletingSet] = useState(false)
  const {finalResults, ...season} = auth.season!
  const form = useForm({
    ...season,
    genderDivision: season.genderDivision ?? 'mixed',
  })
  useEffect(() => {
    canDeleteSet(false)
    $deleteStatus
      .fetch({seasonId: season.id})
      .then((data) => canDeleteSet(data.canDelete))
  }, [season.id])
  const setGenderDivision = (value: string) => {
    if (isSeasonGenderDivision(value)) {
      form.patch({genderDivision: value})
    }
  }
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        children: addkeys([
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Name'}),
              $(InputString, {
                value: form.data.name,
                valueSet: form.link('name'),
                placeholder: 'e.g. Summer 2022',
              }),
            ]),
          }),
          $(FormColumn, {
            children: addkeys([
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Hide From Dashboard'}),
                  $(InputBoolean, {
                    value: form.data.isHidden,
                    valueSet: form.link('isHidden'),
                  }),
                ]),
              }),
              $(FormHelp, {
                children:
                  'The season will not be shown in the dashboard dropdown menu.',
              }),
            ]),
          }),
          $(FormColumn, {
            children: addkeys([
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Sign Up Open'}),
                  $(InputBoolean, {
                    value: form.data.signUpOpen,
                    valueSet: form.link('signUpOpen'),
                  }),
                ]),
              }),
              $(FormHelp, {
                children: 'Teams and players can sign up while this is active.',
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {
                label: 'Season Type',
              }),
              $(InputSelect, {
                value: form.data.genderDivision,
                valueSet: setGenderDivision,
                options: [
                  {
                    key: 'mixed',
                    label: 'Mixed',
                  },
                  {
                    key: 'men',
                    label: "Men's",
                  },
                  {
                    key: 'women',
                    label: "Women's",
                  },
                ],
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {
                label: 'Scoring System',
              }),
              $(FormLabel, {
                grow: true,
                label: form.data.useOfficialScoring ? 'Official' : 'Simple',
                background: theme.bgMinor,
              }),
            ]),
          }),
          $(FormBadge, {
            disabled: $updateSeason.loading,
            label: $updateSeason.loading ? 'Loading' : 'Save',
            click: () =>
              $updateSeason
                .fetch({...form.data, seasonId: season.id})
                .then((data) => {
                  auth.seasonSet(data, true)
                  toaster.notify('Season updated.')
                }),
          }),
          canDelete &&
            $(FormBadge, {
              label: 'Delete Season',
              background: theme.bgAdminButton,
              click: () => deletingSet(true),
            }),
        ]),
      }),
      deleting &&
        $(SeasonDeleteConfirmation, {
          seasonId: season.id,
          seasonName: season.name,
          close: () => deletingSet(false),
        }),
    ]),
  })
}

const SeasonDeleteConfirmation: FC<{
  seasonId: string
  seasonName: string
  close: () => void
}> = ({seasonId, seasonName, close}) => {
  const toaster = useToaster()
  const $deleteSeason = useEndpoint($SeasonDelete)
  const form = useForm({password: ''})
  const submit = () => {
    $deleteSeason.fetch({seasonId, password: form.data.password}).then(() => {
      toaster.notify('Season deleted.')
      local.remove(SEASON_STORAGE_KEY)
      window.location.href = '/'
    })
  }
  return $(Modal, {
    width: theme.fib[13],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Delete Season',
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: close,
          }),
        ]),
      }),
      $(Form, {
        background: theme.bgMinor,
        children: addkeys([
          $(Poster, {
            icon: 'exclamation-triangle',
            title: seasonName,
            description:
              'This will permanently delete the season and its fixtures, teams, members, posts, and comments.',
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Password'}),
              $(InputString, {
                value: form.data.password,
                valueSet: form.link('password'),
                type: 'password',
                enter: submit,
                autofocus: true,
                disabled: $deleteSeason.loading,
              }),
            ]),
          }),
          $(FormBadge, {
            disabled: $deleteSeason.loading,
            label: $deleteSeason.loading ? 'Deleting...' : 'Delete Season',
            background: theme.bgAdminButton,
            click: submit,
          }),
          $(FormBadge, {
            label: 'Cancel',
            click: close,
          }),
        ]),
      }),
    ]),
  })
}
