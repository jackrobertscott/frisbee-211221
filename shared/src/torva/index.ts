export type TypeIoValidateReturn<T> =
  | {
      ok: true
      value: T
    }
  | {
      ok: false
      error: string
    }

export interface TypeIo_<K extends string = string, T = any> {
  _type: K
  validate(value: T): TypeIoValidateReturn<T>
}

export interface TypeIoAny extends TypeIo_<'any', any> {}

export interface TypeIoArray<T extends TypeIoAll = TypeIoAll>
  extends TypeIo_<'array', Array<TypeIoValue<T>>> {
  ofType: T
}

export interface TypeIoBoolean extends TypeIo_<'boolean', boolean> {}

export interface TypeIoColor extends TypeIo_<'color', string> {}

export interface TypeIoCustom<T = any> extends TypeIo_<'custom', T> {}

export interface TypeIoDate extends TypeIo_<'date', string> {}

export interface TypeIoEnum<C extends string = string>
  extends TypeIo_<'enum', C> {}

export interface TypeIoId extends TypeIo_<'id', string> {}

export interface TypeIoLazy<T extends TypeIoAll = TypeIoAll>
  extends TypeIo_<'lazy', TypeIoValue<T>> {
  getType(): T
}

export interface TypeIoNull<T extends TypeIoAll = TypeIoAll>
  extends TypeIo_<'null', TypeIoValue<T> | null> {
  ofType: T
}

export interface TypeIoNumberOptions {
  coerce?: boolean
  integer?: boolean
  min?: number
  max?: number
}

export interface TypeIoNumber extends TypeIo_<'number', number> {
  coerce(): TypeIoNumber
  integer(): TypeIoNumber
  min(value: number): TypeIoNumber
  max(value: number): TypeIoNumber
  positive(): TypeIoNumber
}

export type IncludeOfType<X, T> = {
  [K in keyof X as T extends X[K] ? K : never]: X[K]
}

export type ExcludeOfType<X, T> = {
  [K in keyof X as T extends X[K] ? never : K]: X[K]
}

export type Simplify<A> = A extends (infer X)[]
  ? Simplify<X>[]
  : A extends object
    ? {
        [K in keyof A]: Simplify<A[K]>
      }
    : A

export type OptionalUndefined<X> = Simplify<
  ExcludeOfType<X, undefined> & Partial<IncludeOfType<X, undefined>>
>

export interface TypeIoObject<
  F extends Record<string, TypeIoAll> = Record<string, TypeIoAll>,
> extends TypeIo_<
    'object',
    OptionalUndefined<{
      [K in keyof F]: TypeIoValue<F[K]>
    }>
  > {
  shape: F
  extend<X extends Record<string, TypeIoAll>>(
    fields: X,
  ): TypeIoObject<Omit<F, keyof X> & X>
  pick<K extends keyof F>(keys: K[]): TypeIoObject<Pick<F, K>>
  omit<K extends keyof F>(keys: K[]): TypeIoObject<Omit<F, K>>
}

export interface TypeIoOptional<T extends TypeIoAll = TypeIoAll>
  extends TypeIo_<'optional', TypeIoValue<T> | undefined> {
  ofType: T
}

export interface TypeIoStringOptions {
  regex?: RegExp
  trim?: boolean
  email?: boolean
  nowhitespace?: boolean
  emptyok?: boolean
}

export interface TypeIoString extends TypeIo_<'string', string> {
  regex(value: RegExp): TypeIoString
  trim(): TypeIoString
  email(): TypeIoString
  nowhitespace(): TypeIoString
  emptyok(): TypeIoString
}

export interface TypeIoTimestamp extends TypeIo_<'timestamp', number> {}

export type TypeIoAll =
  | TypeIoAny
  | TypeIoArray
  | TypeIoBoolean
  | TypeIoColor
  | TypeIoCustom
  | TypeIoDate
  | TypeIoEnum
  | TypeIoId
  | TypeIoNull
  | TypeIoNumber
  | TypeIoLazy
  | TypeIoObject
  | TypeIoOptional
  | TypeIoString
  | TypeIoTimestamp

export type TypeIoValue<T extends TypeIo_> =
  T extends TypeIo_<string, infer X> ? X : never

export const ensure = {
  date: (data: any): data is Date =>
    Boolean(data instanceof Date && Number.isFinite(data.getTime())),
  object: (data: any): data is object =>
    Boolean(typeof data === 'object' && !Array.isArray(data) && data !== null),
  array: (data: any): data is any[] => Array.isArray(data),
}

export const regex = {
  escape(value = '') {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  },
  from(value = '') {
    return new RegExp(regex.escape(value), 'i')
  },
  normalize(value = '') {
    return new RegExp(`^${regex.escape(value.trim())}$`, 'i')
  },
  startsWith(value = '') {
    return new RegExp(`^${regex.escape(value.trim())}`, 'i')
  },
  endsWith(value = '') {
    return new RegExp(`${regex.escape(value.trim())}$`, 'i')
  },
  email() {
    return /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  },
  hsla() {
    return /^hsla\(\s*(-?\d+(?:\.\d+)?)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*(\d*(?:\.\d+)?)\s*\)$/
  },
}

const getValueType = (value: unknown) => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

export function ioAny(): TypeIoAny {
  return {
    _type: 'any',
    validate(value) {
      return {ok: true, value}
    },
  }
}

export function ioArray<T extends TypeIoAll = TypeIoAll>(
  ofType: T,
): TypeIoArray<T> {
  return {
    _type: 'array',
    ofType,
    validate(value) {
      if (!Array.isArray(value))
        return {
          ok: false,
          error: `Expect type "array" but got "${typeof value}".`,
        }
      try {
        return {
          ok: true,
          value: value.map((item, index) => {
            const data = ofType.validate(item as TypeIoValue<T>)
            if (!data.ok) throw `[${index}]: ${data.error}`
            return data.value
          }),
        }
      } catch (message) {
        const error =
          typeof message === 'string' ? message : 'An error occurred.'
        return {ok: false, error}
      }
    },
  }
}

export function ioBoolean(): TypeIoBoolean {
  return {
    _type: 'boolean',
    validate(value) {
      if (typeof value !== 'boolean')
        return {ok: false, error: `Value is not a boolean.`}
      return {ok: true, value}
    },
  }
}

export function ioColor(): TypeIoColor {
  return {
    _type: 'color',
    validate(value) {
      if (typeof value !== 'string')
        return {ok: false, error: `Color value is not a string.`}
      const normalizedValue = value.trim()
      const match = regex.hsla().exec(normalizedValue)
      if (!match) return {ok: false, error: `Value is not a valid hsla string.`}
      const [, hue, saturation, lightness, alpha] = match
      const channels = {
        hue: Number(hue),
        saturation: Number(saturation),
        lightness: Number(lightness),
        alpha: Number(alpha),
      }
      if (!Number.isFinite(channels.hue))
        return {ok: false, error: `Hue must be a finite number.`}
      if (channels.saturation < 0 || channels.saturation > 100)
        return {ok: false, error: `Saturation must be between 0 and 100.`}
      if (channels.lightness < 0 || channels.lightness > 100)
        return {ok: false, error: `Lightness must be between 0 and 100.`}
      if (channels.alpha < 0 || channels.alpha > 1)
        return {ok: false, error: `Alpha must be between 0 and 1.`}
      return {ok: true, value: normalizedValue}
    },
  }
}

export function ioCustom<T>(
  validate: (value: T) => TypeIoValidateReturn<T>,
): TypeIoCustom<T> {
  return {
    _type: 'custom',
    validate(value) {
      return validate(value)
    },
  }
}

export function ioDate(): TypeIoDate {
  return {
    _type: 'date',
    validate(value) {
      if (typeof value !== 'string')
        return {ok: false, error: `Date value is not a string.`}
      const parsedDate = Date.parse(value)
      if (isNaN(parsedDate))
        return {ok: false, error: `Value is not a valid date string.`}
      return {ok: true, value: new Date(parsedDate).toISOString()}
    },
  }
}

export function ioEnum<C extends string>(choices: C[]): TypeIoEnum<C> {
  return {
    _type: 'enum',
    validate(value) {
      if (typeof value !== 'string')
        return {ok: false, error: `Enum value is not a string.`}
      if (!choices.includes(value as C))
        return {ok: false, error: `Value is not a valid enum option.`}
      return {ok: true, value: value as C}
    },
  }
}

export function ioId(): TypeIoId {
  return {
    _type: 'id',
    validate(value) {
      if (typeof value !== 'string')
        return {ok: false, error: `ID value is not a string.`}
      const normalizedValue = value.trim()
      if (!normalizedValue.length)
        return {ok: false, error: `ID can not be empty.`}
      if (/\s/.test(normalizedValue))
        return {ok: false, error: `ID can not contain whitespace.`}
      return {ok: true, value: normalizedValue}
    },
  }
}

export function ioLazy<T extends TypeIoAll = TypeIoAll>(
  callback: () => T,
): TypeIoLazy<T> {
  return {
    _type: 'lazy',
    getType() {
      return callback()
    },
    validate(value) {
      return callback().validate(value as TypeIoValue<T>)
    },
  }
}

export function ioNull<T extends TypeIoAll = TypeIoAll>(
  ofType: T,
): TypeIoNull<T> {
  return {
    _type: 'null',
    ofType,
    validate(value) {
      if (value === null) return {ok: true, value}
      if (!ofType)
        throw new Error('Null schema not provided prior to validate.')
      return ofType.validate(value as TypeIoValue<T>)
    },
  }
}

export function ioNumber(options?: TypeIoNumberOptions): TypeIoNumber {
  return {
    _type: 'number',
    coerce() {
      return ioNumber({...options, coerce: true})
    },
    integer() {
      return ioNumber({...options, integer: true})
    },
    min(value) {
      return ioNumber({...options, min: value})
    },
    max(value) {
      return ioNumber({...options, max: value})
    },
    positive() {
      return ioNumber({...options, min: Math.max(options?.min ?? 1, 1)})
    },
    validate(value) {
      const rawValue = value as unknown
      let normalizedValue = rawValue
      if (options?.coerce && typeof rawValue === 'string') {
        const trimmedValue = rawValue.trim()
        if (!trimmedValue.length)
          return {ok: false, error: `Value can not be empty.`}
        normalizedValue = Number(trimmedValue)
      }
      if (typeof normalizedValue !== 'number')
        return {ok: false, error: `Value is not a number.`}
      if (!Number.isFinite(normalizedValue))
        return {ok: false, error: `Value must be a finite number.`}
      if (options?.integer && !Number.isInteger(normalizedValue))
        return {ok: false, error: `Value must be an integer.`}
      if (options?.min !== undefined && normalizedValue < options.min)
        return {
          ok: false,
          error: `Value must be greater than or equal to ${options.min}.`,
        }
      if (options?.max !== undefined && normalizedValue > options.max)
        return {
          ok: false,
          error: `Value must be less than or equal to ${options.max}.`,
        }
      return {ok: true, value: normalizedValue}
    },
  }
}

export function ioObject<
  F extends Record<string, TypeIoAll> = Record<string, TypeIoAll>,
>(fields: F): TypeIoObject<F> {
  return {
    _type: 'object',
    shape: fields,
    extend<X extends Record<string, TypeIoAll>>(newFields: X) {
      const currentFields = fields
      return ioObject({
        ...currentFields,
        ...newFields,
      }) as TypeIoObject<Omit<F, keyof X> & X>
    },
    pick<K extends keyof F>(keys: K[]) {
      return ioObject(
        Object.fromEntries(keys.map((key) => [key, fields[key]])) as Pick<F, K>,
      )
    },
    omit<K extends keyof F>(keys: K[]) {
      const omitted = new Set<keyof F>(keys)
      return ioObject(
        Object.fromEntries(
          Object.entries(fields).filter(([key]) => !omitted.has(key as keyof F)),
        ) as Omit<F, K>,
      )
    },
    validate(value) {
      if (!ensure.object(value))
        return {
          ok: false,
          error: `Expect type "object" but got "${getValueType(value)}".`,
        }
      try {
        return {
          ok: true,
          value: Object.entries(fields).reduce(
            (all, [key, ofType]) => {
              const data = ofType.validate(
                (value as Record<string, unknown>)[key] as never,
              )
              if (!data.ok) throw `[${key}]: ${data.error}`
              if (data.value !== undefined) {
                ;(all as Record<string, unknown>)[key] = data.value
              }
              return all
            },
            {} as OptionalUndefined<{[K in keyof F]: TypeIoValue<F[K]>}>,
          ),
        }
      } catch (message) {
        const error =
          typeof message === 'string' ? message : 'An error occurred.'
        return {ok: false, error}
      }
    },
  }
}

export function ioOptional<T extends TypeIoAll = TypeIoAll>(
  ofType: T,
): TypeIoOptional<T> {
  return {
    _type: 'optional',
    ofType,
    validate(value) {
      if (value === undefined) return {ok: true, value}
      if (!ofType)
        throw new Error('Optional schema not provided prior to validate.')
      return ofType.validate(value as TypeIoValue<T>)
    },
  }
}

export function ioString(options?: TypeIoStringOptions): TypeIoString {
  return {
    _type: 'string',
    regex(value) {
      return ioString({...options, regex: value})
    },
    trim() {
      return ioString({...options, trim: true})
    },
    email() {
      return ioString({...options, email: true})
    },
    nowhitespace() {
      return ioString({...options, nowhitespace: true})
    },
    emptyok() {
      return ioString({...options, emptyok: true})
    },
    validate(value) {
      if (typeof value !== 'string')
        return {ok: false, error: `String value is not a string.`}
      let normalizedValue = value
      if (options?.trim) normalizedValue = normalizedValue.trim()
      if (options?.nowhitespace)
        normalizedValue = normalizedValue.replace(/\s+/g, '')
      if (!normalizedValue.length && options?.emptyok)
        return {ok: true, value: normalizedValue}
      if (!options?.emptyok && !normalizedValue.length)
        return {ok: false, error: `Value can not be empty.`}
      if (options?.regex) {
        options.regex.lastIndex = 0
        if (!options.regex.test(normalizedValue))
          return {ok: false, error: `Value does not match regular expression.`}
      }
      if (options?.email && !regex.email().test(normalizedValue))
        return {ok: false, error: `Value is not a valid email.`}
      return {ok: true, value: normalizedValue}
    },
  }
}

export function ioTimestamp(): TypeIoTimestamp {
  return {
    _type: 'timestamp',
    validate(value) {
      if (typeof value !== 'number')
        return {ok: false, error: `Timestamp value is not a number.`}
      if (!Number.isFinite(value))
        return {ok: false, error: `Timestamp must be a finite number.`}
      if (!Number.isInteger(value))
        return {ok: false, error: `Timestamp must be an integer.`}
      if (value < 0)
        return {ok: false, error: `Timestamp must be zero or greater.`}
      return {ok: true, value}
    },
  }
}

export const io = {
  any: ioAny,
  array: ioArray,
  boolean: ioBoolean,
  color: ioColor,
  custom: ioCustom,
  date: ioDate,
  enum: ioEnum,
  id: ioId,
  lazy: ioLazy,
  null: ioNull,
  number: ioNumber,
  object: ioObject,
  optional: ioOptional,
  string: ioString,
  timestamp: ioTimestamp,
}
