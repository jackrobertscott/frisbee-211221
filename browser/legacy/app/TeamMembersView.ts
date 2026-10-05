import {authPoint} from '@shared/auth/authAccess'
import {TMember} from '@shared/schemas/ioMember'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserPublic} from '@shared/schemas/ioUser'
import {TUserGender} from '@shared/schemas/ioUserGender'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {
  $MemberAcceptOrDecline,
  $MemberCreate,
  $MemberListOfTeam,
  $MemberLookupByEmail,
  $MemberRemove,
  $MemberSetCaptain,
} from '../endpoints/Member'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {GENDER_OPTIONS} from '../utils/constants'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputSelect} from './Input/InputSelect'
import {InputString} from './Input/InputString'
import {Modal} from './Modal'
import {Question} from './Question'
import {Spinner} from './Spinner'
import {useToaster} from './Toaster/useToaster'
import {TopBar, TopBarBadge} from './TopBar'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'

export const TeamMembersView: FC<{team: TTeam}> = ({team}) => {
  const auth = useAuth()
  const toaster = useToaster()
  const $memberList = useEndpoint($MemberListOfTeam)
  const $memberRemove = useEndpoint($MemberRemove)
  const $memberRespond = useEndpoint($MemberAcceptOrDecline)
  const $memberPromote = useEndpoint($MemberSetCaptain)
  const [state, stateSet] = useState<{
    current?: TMember
    members: TMember[]
    users: TUserPublic[]
  }>()
  const [creating, creatingSet] = useState(false)
  const [pendingId, pendingIdSet] = useState<string>()
  const [removeId, removeIdSet] = useState<string>()
  const [promoteId, promoteIdSet] = useState<string>()
  const canManage =
    auth.can(authPoint.memberManage) &&
    (state?.current?.captain || auth.isAdmin())
  const reload = () => $memberList.fetch(team.id).then(stateSet)
  useEffect(() => {
    reload()
  }, [])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        children: addkeys([
          $(FormBadge, {
            label: 'Add Member',
            click: () => canManage && creatingSet(true),
            disabled: !canManage,
          }),
          $(Fragment, {
            children:
              state === undefined
                ? $(Spinner)
                : !state.members.length
                  ? $(FormBadge, {
                      label: 'No Members Yet',
                      font: theme.fontMinor,
                    })
                  : $(FormColumn, {
                      children: state.members.map((member) => {
                        const user = state.users.find(
                          (i) => i.id === member.userId,
                        )
                        return $(FormRow, {
                          key: member.id,
                          children: addkeys([
                            $(FormLabel, {
                              grow: true,
                              label: user
                                ? `${user.firstName} ${user.lastName}`
                                : '[unknown]',
                            }),
                            member.captain
                              ? $(FormBadge, {
                                  label: 'Captain',
                                })
                              : canManage &&
                                !member.pending &&
                                $(FormBadge, {
                                  icon: 'hand-holding-medical',
                                  click: () => promoteIdSet(member.id),
                                }),
                            canManage &&
                              member.pending &&
                              $(FormBadge, {
                                icon: 'bell',
                                label: 'Pending',
                                click: () => pendingIdSet(member.id),
                              }),
                            canManage &&
                              $(FormBadge, {
                                icon: 'trash-alt',
                                click: () => removeIdSet(member.id),
                              }),
                          ]),
                        })
                      }),
                    }),
          }),
          $(Fragment, {
            children:
              state?.current &&
              state?.members.some((i) => i.id === state.current?.id) &&
              $(FormBadge, {
                label: 'Leave Team',
                click: () => state.current && removeIdSet(state.current.id),
              }),
          }),
        ]),
      }),
      $(Fragment, {
        children:
          pendingId &&
          $(Question, {
            title: 'Membership Request',
            description: 'Please accept or deny the membership.',
            close: () => pendingIdSet(undefined),
            options: [
              {
                label: 'Decline',
                click: () =>
                  $memberRespond
                    .fetch({memberId: pendingId, accept: false})
                    .then(() => {
                      reload()
                      toaster.notify('Membership request declined.')
                      pendingIdSet(undefined)
                    }),
              },
              {
                label: 'Accept',
                click: () =>
                  $memberRespond
                    .fetch({memberId: pendingId, accept: true})
                    .then(() => {
                      reload()
                      toaster.notify('Membership request accepted.')
                      pendingIdSet(undefined)
                    }),
              },
            ],
          }),
      }),
      $(Fragment, {
        children:
          removeId &&
          $(Question, {
            title: 'Remove Membership',
            description: `Are you sure you wish to remove ${
              removeId === state?.current?.id ? 'yourself' : 'this person'
            } from the team?`,
            close: () => removeIdSet(undefined),
            options: [
              {
                label: 'Cancel',
                click: () => removeIdSet(undefined),
              },
              {
                label: 'Remove',
                click: () =>
                  $memberRemove.fetch(removeId).then(() => {
                    toaster.notify('Member removed from team.')
                    if (removeId === state?.current?.id) auth.teamSet(undefined)
                    else {
                      reload()
                      removeIdSet(undefined)
                    }
                  }),
              },
            ],
          }),
      }),
      $(Fragment, {
        children:
          promoteId &&
          $(Question, {
            title: 'Set As Captain',
            description:
              'Are you sure you wish to set this person as the team captain?',
            close: () => promoteIdSet(undefined),
            options: [
              {
                label: 'Cancel',
                click: () => promoteIdSet(undefined),
              },
              {
                label: 'Confirm',
                click: () =>
                  $memberPromote.fetch(promoteId).then(() => {
                    reload()
                    toaster.notify('Captain of team changed.')
                    promoteIdSet(undefined)
                  }),
              },
            ],
          }),
      }),
      $(Fragment, {
        children:
          creating &&
          $(_TeamMembersViewCreate, {
            team,
            close: () => creatingSet(false),
            memberSet: () => {
              reload()
              creatingSet(false)
            },
          }),
      }),
    ]),
  })
}

const _TeamMembersViewCreate: FC<{
  team: TTeam
  close: () => void
  memberSet: (member: TMember) => void
}> = ({team, close, memberSet}) => {
  const $memberCreate = useEndpoint($MemberCreate)
  const $memberLookupByEmail = useEndpoint($MemberLookupByEmail)
  const toaster = useToaster()
  const form = useForm({
    email: '',
    firstName: '',
    lastName: '',
    gender: undefined as undefined | TUserGender,
  })
  const [step, stepSet] = useState<'email' | 'details'>('email')
  return $(Modal, {
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Add Member',
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
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Email'}),
              $(InputString, {
                value: form.data.email,
                valueSet: form.link('email'),
                autofocus: true,
              }),
            ]),
          }),
          step === 'details' &&
            $(Fragment, {
              children: addkeys([
                $(FormRow, {
                  children: addkeys([
                    $(FormLabel, {label: 'First Name'}),
                    $(InputString, {
                      value: form.data.firstName,
                      valueSet: form.link('firstName'),
                      autofocus: true,
                    }),
                  ]),
                }),
                $(FormRow, {
                  children: addkeys([
                    $(FormLabel, {label: 'Last Name'}),
                    $(InputString, {
                      value: form.data.lastName,
                      valueSet: form.link('lastName'),
                    }),
                  ]),
                }),
                $(FormRow, {
                  children: addkeys([
                    $(FormLabel, {label: 'Gender'}),
                    $(InputSelect<TUserGender>, {
                      value: form.data.gender,
                      valueSet: form.link('gender'),
                      options: GENDER_OPTIONS,
                    }),
                  ]),
                }),
              ]),
            }),
          step === 'email'
            ? $(FormBadge, {
                disabled: $memberLookupByEmail.loading || $memberCreate.loading,
                label:
                  $memberLookupByEmail.loading || $memberCreate.loading
                    ? 'Loading'
                    : 'Continue',
                click: () =>
                  $memberLookupByEmail
                    .fetch({
                      teamId: team.id,
                      email: form.data.email,
                    })
                    .then((result) => {
                      if (!result.exists) {
                        stepSet('details')
                        return
                      }
                      return $memberCreate
                        .fetch({
                          teamId: team.id,
                          email: form.data.email,
                        })
                        .then((member) => {
                          toaster.notify(
                            result.user
                              ? `${result.user.firstName} ${result.user.lastName} added to team.`
                              : 'Member added to team.',
                          )
                          memberSet(member)
                        })
                    }),
              })
            : $(FormBadge, {
                disabled: $memberCreate.loading,
                label: $memberCreate.loading ? 'Loading' : 'Submit',
                click: () =>
                  $memberCreate
                    .fetch({
                      ...form.data,
                      teamId: team.id,
                      gender: form.data.gender!,
                    })
                    .then((member) => {
                      toaster.notify('Member created and added to team.')
                      memberSet(member)
                    }),
              }),
        ]),
      }),
    ]),
  })
}
