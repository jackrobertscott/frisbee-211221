import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {
  $MemberAcceptOrDecline,
  $MemberListOfTeam,
  $MemberRemove,
  $MemberSetCaptain,
} from '../../endpoints/Member'
import {TMember} from '../../schemas/Member'
import {TUser} from '../../schemas/User'
import {addkeys} from '../../utils/addkeys'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {Question} from '../Question'
import {Spinner} from '../Spinner'
import {useToaster} from '../Toaster/useToaster'
import {useEndpoint} from '../useEndpoint'
/**
 *
 */
export const SettingsMembers: FC = () => {
  const auth = useAuth()
  const toaster = useToaster()
  const $memberList = useEndpoint($MemberListOfTeam)
  const $memberRemove = useEndpoint($MemberRemove)
  const $memberRespond = useEndpoint($MemberAcceptOrDecline)
  const $memberPromote = useEndpoint($MemberSetCaptain)
  const [state, stateSet] =
    useState<{current: TMember; members: TMember[]; users: TUser[]}>()
  const [memberPendingId, memberPendingIdSet] = useState<string>()
  const [memberRemoveId, memberRemoveIdSet] = useState<string>()
  const [memberPromoteId, memberPromoteIdSet] = useState<string>()
  const reload = () =>
    auth.current?.team && $memberList.fetch(auth.current.team.id).then(stateSet)
  useEffect(() => {
    reload()
  }, [])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        children:
          state === undefined
            ? $(Spinner)
            : $(FormColumn, {
                children: state.members.map((member) => {
                  const user = state.users.find((i) => i.id === member.userId)
                  if (!user) return null
                  return $(FormRow, {
                    key: member.id,
                    children: addkeys([
                      $(FormLabel, {
                        label: `${user.firstName} ${user.lastName}`,
                        grow: true,
                      }),
                      member.captain
                        ? $(FormBadge, {
                            label: 'Captain',
                          })
                        : state.current.captain &&
                          !member.pending &&
                          $(FormBadge, {
                            icon: 'hand-holding-medical',
                            click: () => memberPromoteIdSet(member.id),
                          }),
                      state.current.captain &&
                        member.pending &&
                        $(FormBadge, {
                          icon: 'bell',
                          label: 'Pending',
                          click: () => memberPendingIdSet(member.id),
                        }),
                      state.current.captain &&
                        !member.captain &&
                        $(FormBadge, {
                          icon: 'trash-alt',
                          click: () => memberRemoveIdSet(member.id),
                        }),
                    ]),
                  })
                }),
              }),
      }),
      $(Fragment, {
        children:
          memberPendingId &&
          $(Question, {
            title: 'Membership Request',
            description: 'Please accept or deny the membership.',
            close: () => memberPendingIdSet(undefined),
            options: [
              {
                label: 'Decline',
                click: () =>
                  $memberRespond
                    .fetch({memberId: memberPendingId, accept: false})
                    .then(() => {
                      reload()
                      toaster.notify('Membership request declined.')
                      memberPendingIdSet(undefined)
                    }),
              },
              {
                label: 'Accept',
                click: () =>
                  $memberRespond
                    .fetch({memberId: memberPendingId, accept: true})
                    .then(() => {
                      reload()
                      toaster.notify('Membership request accepted.')
                      memberPendingIdSet(undefined)
                    }),
              },
            ],
          }),
      }),
      $(Fragment, {
        children:
          memberRemoveId &&
          $(Question, {
            title: 'Remove Membership',
            description:
              'Are you sure you wish to remove this person from your team?',
            close: () => memberRemoveIdSet(undefined),
            options: [
              {
                label: 'Cancel',
                click: () => memberRemoveIdSet(undefined),
              },
              {
                label: 'Remove',
                click: () =>
                  $memberRemove.fetch(memberRemoveId).then(() => {
                    reload()
                    toaster.notify('Membership removed from team.')
                    memberRemoveIdSet(undefined)
                  }),
              },
            ],
          }),
      }),
      $(Fragment, {
        children:
          memberPromoteId &&
          $(Question, {
            title: 'Change Captain',
            description:
              'Are you sure you wish to set this person as the team captain?',
            close: () => memberPromoteIdSet(undefined),
            options: [
              {
                label: 'Cancel',
                click: () => memberPromoteIdSet(undefined),
              },
              {
                label: 'Set As Captain',
                click: () =>
                  $memberPromote.fetch(memberPromoteId).then(() => {
                    reload()
                    toaster.notify('Captain of team changed.')
                    memberPromoteIdSet(undefined)
                  }),
              },
            ],
          }),
      }),
    ]),
  })
}
