import {TUserSafe} from '@shared/schemas/ioUser'
import {screen, waitFor, within} from '@testing-library/react'
import {beforeEach, describe, expect, it} from 'vitest'
import {makeAuth, makeUser} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer} from '../../test/server'
import {
  chooseOption,
  findDialog,
  setupUser,
  spyToasts,
} from '../seasons/screenTestUtils'
import {UsersPage} from './UsersPage'

const admin = () => makeAuth({user: {admin: true}})

const ann = makeUser({
  firstName: 'Ann',
  lastName: 'Archer',
  genderMatching: 'female',
  admin: true,
  emails: [
    {value: 'ann@example.com', verified: false, primary: true, createdOn: '2026-01-01T00:00:00.000Z'},
  ],
})
const bob = makeUser({
  firstName: 'Bob',
  lastName: 'Baker',
  genderMatching: 'male',
  emails: [],
})

const listServer = (users: TUserSafe[] = [ann, bob], count = users.length) =>
  mockServer({
    '/UserList': () => ({count, users}),
    '/FeatureDashboardUserMembershipsLoad': () => ({members: [], seasons: [], teams: []}),
  })

beforeEach(() => {
  window.history.replaceState(null, '', '/users')
})

describe('UsersPage', () => {
  it('lists users sorted by first name from the server', async () => {
    const server = listServer()
    renderApp(<UsersPage />, {auth: admin()})
    const table = await screen.findByRole('table', {name: 'Users'})
    expect(await within(table).findByRole('button', {name: 'Ann'})).toBeInTheDocument()
    const annRow = within(table).getByRole('button', {name: 'Ann'}).closest('tr')
    if (!annRow) throw new Error('Ann row missing')
    expect(within(annRow).getByText('Admin')).toBeInTheDocument()
    expect(within(annRow).getByText('Unverified')).toBeInTheDocument()
    expect(within(annRow).getByText('Female')).toBeInTheDocument()
    const bobRow = within(table).getByRole('button', {name: 'Bob'}).closest('tr')
    if (!bobRow) throw new Error('Bob row missing')
    expect(within(bobRow).getByText('—')).toBeInTheDocument()
    expect(server.payloads('/UserList')).toEqual([
      {search: '', sortBy: 'firstName', sortDirection: 'asc', skip: 0, limit: 25},
    ])
  })

  it('asks the server to re-sort when a header is clicked', async () => {
    const user = setupUser()
    const server = listServer()
    renderApp(<UsersPage />, {auth: admin()})
    await screen.findByRole('button', {name: 'Ann'})
    await user.click(screen.getByRole('button', {name: 'Last name'}))
    await waitFor(() =>
      expect(server.payloads('/UserList').at(-1)).toMatchObject({
        sortBy: 'lastName',
        sortDirection: 'asc',
      }),
    )
    await user.click(screen.getByRole('button', {name: 'Last name'}))
    await waitFor(() =>
      expect(server.payloads('/UserList').at(-1)).toMatchObject({
        sortBy: 'lastName',
        sortDirection: 'desc',
      }),
    )
    await user.click(screen.getByRole('button', {name: 'Created'}))
    await waitFor(() =>
      expect(server.payloads('/UserList').at(-1)).toMatchObject({
        sortBy: 'createdOn',
        sortDirection: 'desc',
      }),
    )
  })

  it('searches and pages on the server', async () => {
    const user = setupUser()
    const server = listServer([ann, bob], 60)
    renderApp(<UsersPage />, {auth: admin()})
    await screen.findByRole('button', {name: 'Ann'})
    await user.click(screen.getByRole('button', {name: 'Next page'}))
    await waitFor(() =>
      expect(server.payloads('/UserList').at(-1)).toMatchObject({skip: 25, limit: 25}),
    )
    await user.type(screen.getByPlaceholderText('Search by name or email'), 'ann')
    await waitFor(() =>
      expect(server.payloads('/UserList').at(-1)).toMatchObject({search: 'ann', skip: 0}),
    )
  })

  it('shows an empty state when nothing matches', async () => {
    listServer([])
    renderApp(<UsersPage />, {auth: admin()})
    expect(await screen.findByText('No matching users')).toBeInTheDocument()
  })

  it('shows a load failure', async () => {
    spyToasts()
    mockServer()
    renderApp(<UsersPage />, {auth: admin()})
    expect(await screen.findByText('Couldn’t load users')).toBeInTheDocument()
  })

  it('sends non-admins home without loading users', async () => {
    const server = listServer()
    renderApp(<UsersPage />, {auth: makeAuth()})
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(server.payloads('/UserList')).toEqual([])
  })

  it('opens a user when their row is clicked', async () => {
    const user = setupUser()
    listServer()
    renderApp(<UsersPage />, {auth: admin()})
    await user.click(await screen.findByText('Baker'))
    const modal = await findDialog(/Bob Baker/)
    expect(within(modal).getByText('No email')).toBeInTheDocument()
    const [footerClose] = within(modal).getAllByRole('button', {name: 'Close'})
    await user.click(footerClose)
    await waitFor(() => expect(modal).not.toBeInTheDocument())
  })

  it('creates a user and opens them', async () => {
    const user = setupUser()
    const created = makeUser({firstName: 'Cat', lastName: 'Cole'})
    const server = listServer()
    server.on('/UserCreate', () => created)
    renderApp(<UsersPage />, {auth: admin()})
    await screen.findByRole('button', {name: 'Ann'})
    await user.click(screen.getByRole('button', {name: 'Create user'}))
    const modal = await findDialog('Create user')
    await user.type(within(modal).getByLabelText('First name'), 'Cat')
    await user.type(within(modal).getByLabelText('Last name'), 'Cole')
    await user.type(within(modal).getByLabelText('Email'), 'cat@example.com')
    await chooseOption(user, 'Gender matching', 'Female')
    await user.click(within(modal).getByRole('button', {name: 'Create user'}))
    expect(await findDialog(/Cat Cole/)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {name: 'Create user'})).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(server.payloads('/UserList').length).toBeGreaterThan(1))
  })
})
