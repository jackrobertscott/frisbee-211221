import { bucket, defineRailway, github, mongo, preserve, project, ref, service, volume } from 'railway/iac'

const REGION = 'asia-southeast1-eqsg3a'

// Secrets live in Railway; declaring them as preserved keeps them on apply.
const SECRET_NAME_ARR = ['JWT_SECRET', 'SES_ACCESS_KEY_ID', 'SES_SECRET_ACCESS_KEY']

type Site = {
  appName: string
  apiDomain: string
  clientUrl: string
  mongoTcpProxies: Record<string, Record<string, never>>
}

// This file deploys to two Railway projects: run it from a folder linked to the one to change.
const SITE_BY_PROJECT: Record<string, Site> = {
  'frisbee-211221-pul': {
    appName: 'PUL',
    apiDomain: 'api.perthulti.com',
    clientUrl: 'https://www.perthulti.com',
    mongoTcpProxies: { '27017': {} },
  },
  'frisbee-211221-marlow': {
    appName: 'Marlow Street',
    apiDomain: 'api.marlowst.com',
    clientUrl: 'https://www.marlowst.com',
    mongoTcpProxies: {},
  },
}

export default defineRailway((ctx) => {
  const projectName = ctx.projectName
  const site = projectName ? SITE_BY_PROJECT[projectName] : undefined
  if (!projectName || !site) throw new Error(`No Railway config for project ${projectName}`)

  const data = volume('frisbee-211221-rust-volume', { region: REGION, sizeMB: 50000 })
  const mongoData = volume('mongodb-volume', { region: REGION, sizeMB: 50000 })

  // Daily SQLite backups, the newest 14 kept (rust/src/services/backup.rs).
  const backups = bucket('frisbee-211221-backups', { region: 'sin' })

  const mongodb = mongo('MongoDB', { region: REGION })
  mongodb.deploy = {
    startCommand:
      'docker-entrypoint.sh mongod --ipv6 --bind_ip ::,0.0.0.0 --setParameter diagnosticDataCollectionEnabled=false',
    sleepApplication: true,
  }
  mongodb.networking = { privateNetworkEndpoint: 'mongodb', tcpProxies: site.mongoTcpProxies }

  return project(projectName, {
    resources: [
      backups,
      service('frisbee-211221-rust', {
        source: github('jackrobertscott/frisbee-211221', {
          branch: 'master',
          checkSuites: false,
          rootDirectory: 'rust',
        }),
        build: {
          builder: 'DOCKERFILE',
          dockerfilePath: 'Dockerfile',
          watchPatterns: ['/rust/**'],
        },
        deploy: {
          healthcheckPath: '/health',
          healthcheckTimeout: 300,
          // The restart policy stays at Railway's default, ON_FAILURE with 10 retries:
          // Railway doesn't store those values, so setting them never stops showing in the plan.
          sleepApplication: true,
          // SQLite allows exactly one instance.
          multiRegionConfig: { [REGION]: { numReplicas: 1 } },
        },
        volumeMounts: { '/data': data },
        networking: { customDomains: { [site.apiDomain]: { port: 8080 } } },
        variables: {
          ...Object.fromEntries(SECRET_NAME_ARR.map((name) => [name, preserve()])),
          APP_NAME: site.appName,
          BACKUP_BUCKET: ref(backups, 'BUCKET'),
          BACKUP_ENDPOINT: ref(backups, 'ENDPOINT'),
          BACKUP_REGION: ref(backups, 'REGION'),
          BACKUP_ACCESS_KEY_ID: ref(backups, 'ACCESS_KEY_ID'),
          BACKUP_SECRET_ACCESS_KEY: ref(backups, 'SECRET_ACCESS_KEY'),
          NODE_ENV: 'production',
          PORT: '8080',
          SES_FROM_EMAIL: 'noreply@marlowst.com',
          SES_REGION: 'us-east-1',
          SQLITE_PATH: '/data/frisbee.sqlite',
          URL_CLIENT: site.clientUrl,
        },
      }),
      mongodb,
      mongoData,
      data,
    ],
  })
})
