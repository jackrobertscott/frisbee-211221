import {IncomingMessage} from 'http'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import intrusion from './intrusion'

const makeReq = (
  remoteAddress: string | undefined,
  forwardedFor?: string | string[],
) =>
  ({
    socket: {remoteAddress},
    headers:
      forwardedFor === undefined ? {} : {'x-forwarded-for': forwardedFor},
  }) as unknown as IncomingMessage

let ipCounter = 0
/** Each test uses fresh public IPs since intrusion state is module-global */
const freshIp = () => {
  ipCounter += 1
  return `203.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`
}

const clean = {knownRoute: true, originAllowed: true}

describe('getPathname', () => {
  it('extracts the pathname', () => {
    expect(intrusion.getPathname(undefined)).toBe('/')
    expect(intrusion.getPathname('')).toBe('/')
    expect(intrusion.getPathname('/')).toBe('/')
    expect(intrusion.getPathname('/api/user?x=1#y')).toBe('/api/user')
    expect(intrusion.getPathname('/a/../b')).toBe('/b')
    expect(intrusion.getPathname('/a b')).toBe('/a%20b')
  })

  it('resolves absolute and protocol-relative urls', () => {
    expect(intrusion.getPathname('http://evil.com/x?y')).toBe('/x')
    expect(intrusion.getPathname('//evil.com/path')).toBe('/path')
  })

  it('falls back to splitting on ? for unparseable urls', () => {
    expect(intrusion.getPathname('http://[bad?x=1')).toBe('http://[bad')
  })
})

describe('getClientIp', () => {
  it('uses the socket address when not behind a trusted proxy', () => {
    expect(intrusion.getClientIp(makeReq('8.8.8.8', '1.2.3.4'))).toBe('8.8.8.8')
    expect(intrusion.getClientIp(makeReq(' 8.8.8.8 '))).toBe('8.8.8.8')
    expect(intrusion.getClientIp(makeReq('::ffff:8.8.8.8'))).toBe('8.8.8.8')
    expect(intrusion.getClientIp(makeReq(undefined, '1.2.3.4'))).toBe('unknown')
    expect(intrusion.getClientIp(makeReq(''))).toBe('unknown')
  })

  it('walks forwarded hops from the right past trusted proxies', () => {
    expect(
      intrusion.getClientIp(makeReq('10.0.0.1', 'spoofed, 1.2.3.4, 10.0.0.2')),
    ).toBe('1.2.3.4')
    expect(intrusion.getClientIp(makeReq('10.0.0.1', '1.2.3.4'))).toBe(
      '1.2.3.4',
    )
    expect(
      intrusion.getClientIp(makeReq('::ffff:10.0.0.1', ' 5.6.7.8 , ,')),
    ).toBe('5.6.7.8')
    expect(intrusion.getClientIp(makeReq('10.0.0.1', '::ffff:1.2.3.4'))).toBe(
      '1.2.3.4',
    )
  })

  it('returns the leftmost hop when every hop is trusted', () => {
    expect(
      intrusion.getClientIp(makeReq('10.0.0.1', '192.168.1.5, 172.16.0.1')),
    ).toBe('192.168.1.5')
  })

  it('falls back to the proxy address without a forwarded header', () => {
    expect(intrusion.getClientIp(makeReq('10.0.0.1'))).toBe('10.0.0.1')
    expect(intrusion.getClientIp(makeReq('10.0.0.1', ''))).toBe('10.0.0.1')
  })

  it('only uses the first forwarded header value', () => {
    expect(
      intrusion.getClientIp(
        makeReq('10.0.0.1', ['1.1.1.1, 2.2.2.2', '3.3.3.3']),
      ),
    ).toBe('2.2.2.2')
  })

  it('recognises private, loopback, shared and ULA ranges as trusted', () => {
    const trusted = [
      '10.1.2.3',
      '127.0.0.1',
      '100.64.0.1',
      '100.127.255.255',
      '192.168.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '::1',
      'localhost',
      'fd00::1',
      'fc00::1',
    ]
    for (const proxy of trusted) {
      expect(intrusion.getClientIp(makeReq(proxy, '9.9.9.9')), proxy).toBe(
        '9.9.9.9',
      )
    }
    const untrusted = [
      '100.63.0.1',
      '100.128.0.1',
      '172.15.0.1',
      '172.32.0.1',
      '192.169.0.1',
      '11.0.0.1',
      'fe80::1',
      '10.0.0',
      '10.0.0.256',
    ]
    for (const proxy of untrusted) {
      expect(intrusion.getClientIp(makeReq(proxy, '9.9.9.9')), proxy).toBe(
        proxy,
      )
    }
  })
})

describe('inspect', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('allows clean requests without tracking', () => {
    const req = makeReq(freshIp())
    for (let i = 0; i < 10; i++) {
      expect(
        intrusion.inspect(req, {...clean, pathname: '/api/user'}),
      ).toBeNull()
    }
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('allows unknown routes from an allowed origin', () => {
    const req = makeReq(freshIp())
    expect(
      intrusion.inspect(req, {
        pathname: '/not/a/route',
        knownRoute: false,
        originAllowed: true,
      }),
    ).toBeNull()
  })

  it('flags exploit probe paths', () => {
    const suspicious = [
      '/.git/config',
      '/.git',
      '/wp-admin/install',
      '/WP-CONTENT/x',
      '/cgi-bin/test',
      '/xmlrpc.php',
      '/xmrlpc.php',
      '/.well-known/security.txt',
      '/index.php',
      '/shell.php5/x',
      '/default.aspx',
      '/login.jsp',
    ]
    for (const pathname of suspicious) {
      const error = intrusion.inspect(makeReq(freshIp()), {...clean, pathname})
      expect(error, pathname).toMatchObject({
        statusCode: 404,
        errorCode: 'intrusion.exploit_probe',
        tarpit: {
          body: 'Not found.',
          dripIntervalMs: 5000,
          holdMs: 25000,
          statusCode: 404,
        },
      })
    }
  })

  it('does not flag lookalike paths', () => {
    for (const pathname of [
      '/.gitignore',
      '/api/git',
      '/php/info',
      '/wp-admins',
    ]) {
      expect(
        intrusion.inspect(makeReq(freshIp()), {...clean, pathname}),
        pathname,
      ).toBeNull()
    }
  })

  it('blocks an IP immediately after an exploit probe', () => {
    const req = makeReq(freshIp())
    expect(
      intrusion.inspect(req, {...clean, pathname: '/.git/config'}),
    ).toMatchObject({errorCode: 'intrusion.exploit_probe'})
    expect(
      intrusion.inspect(req, {...clean, pathname: '/api/user'}),
    ).toMatchObject({
      statusCode: 404,
      errorCode: 'intrusion.blocked',
      tarpit: {dripIntervalMs: 4000, holdMs: 45000, statusCode: 404},
    })
  })

  it('flags unknown routes from forbidden origins as suspicious and blocks', () => {
    const req = makeReq(freshIp())
    const options = {
      pathname: '/random',
      knownRoute: false,
      originAllowed: false,
      origin: 'https://evil.com',
    }
    expect(intrusion.inspect(req, options)).toMatchObject({
      statusCode: 404,
      errorCode: 'intrusion.suspicious_request',
      tarpit: {dripIntervalMs: 6000, holdMs: 12000},
    })
    expect(intrusion.inspect(req, {...clean, pathname: '/'})).toMatchObject({
      errorCode: 'intrusion.blocked',
    })
  })

  it('forbids known routes from forbidden origins and blocks on the third strike', () => {
    const req = makeReq(freshIp())
    const options = {
      pathname: '/api/user',
      knownRoute: true,
      originAllowed: false,
      origin: 'https://evil.com',
    }
    for (let i = 0; i < 3; i++) {
      const error = intrusion.inspect(req, options)
      expect(error).toMatchObject({
        statusCode: 403,
        errorCode: 'intrusion.origin_forbidden',
        message: 'Forbidden origin "https://evil.com" attempted "/api/user"',
      })
      expect(error).not.toHaveProperty('tarpit', expect.anything())
    }
    expect(intrusion.inspect(req, options)).toMatchObject({
      errorCode: 'intrusion.blocked',
    })
  })

  it('tracks blocks per client IP behind a trusted proxy', () => {
    const client = freshIp()
    const other = freshIp()
    intrusion.inspect(makeReq('10.0.0.1', client), {
      ...clean,
      pathname: '/.env.php',
    })
    expect(
      intrusion.inspect(makeReq('10.0.0.2', client), {...clean, pathname: '/'}),
    ).toMatchObject({errorCode: 'intrusion.blocked'})
    expect(
      intrusion.inspect(makeReq('10.0.0.1', other), {...clean, pathname: '/'}),
    ).toBeNull()
  })

  it('expires blocks and escalates the duration of repeat blocks', () => {
    vi.useFakeTimers()
    const start = new Date('2030-01-01T00:00:00.000Z').getTime()
    vi.setSystemTime(start)
    const req = makeReq(freshIp())
    const probe = {...clean, pathname: '/.git/config'}
    const home = {...clean, pathname: '/'}
    const minute = 60 * 1000

    intrusion.inspect(req, probe)
    vi.setSystemTime(start + 15 * minute - 1)
    expect(intrusion.inspect(req, home)).toMatchObject({
      errorCode: 'intrusion.blocked',
    })
    vi.setSystemTime(start + 15 * minute)
    expect(intrusion.inspect(req, home)).toBeNull()

    // second block lasts 60 minutes
    const second = start + 15 * minute
    intrusion.inspect(req, probe)
    vi.setSystemTime(second + 60 * minute - 1)
    expect(intrusion.inspect(req, home)).toMatchObject({
      errorCode: 'intrusion.blocked',
    })
    vi.setSystemTime(second + 60 * minute)
    expect(intrusion.inspect(req, home)).toBeNull()
  })

  it('logs strikes and blocks', () => {
    const ip = freshIp()
    intrusion.inspect(makeReq(ip), {...clean, pathname: '/.git/config'})
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(
          `^\\[intrusion\\] ${ip.replace(/\./g, '\\.')} exploit probe on "/\\.git/config" blocked-until=`,
        ),
      ),
    )
  })
})
