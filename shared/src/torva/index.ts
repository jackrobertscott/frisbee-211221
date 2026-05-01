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
  extends TypeIo_<'array', Array<TypeIoValue<T>>> {}

export interface TypeIoBoolean extends TypeIo_<'boolean', boolean> {}

export interface TypeIoColor extends TypeIo_<'color', string> {}

export interface TypeIoCustom<T = any> extends TypeIo_<'custom', T> {}

export interface TypeIoDate extends TypeIo_<'date', string> {}

export interface TypeIoEnum<C extends string = string> extends TypeIo_<'enum', C> {}

export interface TypeIoLazy<T extends TypeIoAll = TypeIoAll>
  extends TypeIo_<'lazy', TypeIoValue<T>> {}

export interface TypeIoNull<T extends TypeIoAll = TypeIoAll>
  extends TypeIo_<'null', TypeIoValue<T> | null> {}

export interface TypeIoNumber extends TypeIo_<'number', number> {}

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
  extend<X extends Record<string, TypeIoAll>>(
    fields: X
  ): TypeIoObject<Omit<F, keyof X> & X>
}

export interface TypeIoOptional<T extends TypeIoAll = TypeIoAll>
  extends TypeIo_<'optional', TypeIoValue<T> | undefined> {}

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

export type TypeIoAll =
  | TypeIoAny
  | TypeIoArray
  | TypeIoBoolean
  | TypeIoColor
  | TypeIoCustom
  | TypeIoDate
  | TypeIoEnum
  | TypeIoNull
  | TypeIoNumber
  | TypeIoLazy
  | TypeIoObject
  | TypeIoOptional
  | TypeIoString

export type TypeIoValue<T extends TypeIo_> = T extends TypeIo_<string, infer X>
  ? X
  : never

export const ensure = {
  date: (data: any): data is Date =>
    Boolean(data instanceof Date && data.getDate && !isNaN(data.getDate())),
  object: (data: any): data is object =>
    Boolean(typeof data === 'object' && !Array.isArray(data) && data !== null),
  array: (data: any): data is any[] =>
    Boolean(typeof data === 'object' && data.length && Array.isArray(data)),
}

export const regex = {
  escape(value = '') {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  },
  from(value = '') {
    return new RegExp(this.escape(value), 'i')
  },
  normalize(value = '') {
    return new RegExp(`^${this.escape(value.trim())}$`, 'i')
  },
  startsWith(value = '') {
    return new RegExp(`^${this.escape(value.trim())}`, 'i')
  },
  endsWith(value = '') {
    return new RegExp(`${this.escape(value.trim())}$`, 'i')
  },
  email() {
    return /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  },
  hsla() {
    return /^hsla\((\d+),\s*([\d.]+)%,\s*([\d.]+)%,\s*(\d*(?:\.\d+)?)\)$/
  },
}

export function ioAny(): TypeIoAny {
  return {
    _type: 'any',
    validate(value) {
      return {ok: true, value}
    },
  }
}

export function ioArray<T extends TypeIoAll = TypeIoAll>(ofType: T): TypeIoArray<T> {
  return {
    _type: 'array',
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
      if (!regex.hsla().test(value))
        return {ok: false, error: `Value is not a valid hsla string.`}
      return {ok: true, value}
    },
  }
}

export function ioCustom<T>(
  validate: (value: T) => TypeIoValidateReturn<T>
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

export function ioLazy<T extends TypeIoAll = TypeIoAll>(
  callback: () => T
): TypeIoLazy<T> {
  return {
    _type: 'lazy',
    validate(value) {
      return callback().validate(value as TypeIoValue<T>)
    },
  }
}

export function ioNull<T extends TypeIoAll = TypeIoAll>(ofType: T): TypeIoNull<T> {
  return {
    _type: 'null',
    validate(value) {
      if (value === null) return {ok: true, value}
      if (!ofType) throw new Error('Null schema not provided prior to validate.')
      return ofType.validate(value as TypeIoValue<T>)
    },
  }
}

export function ioNumber(): TypeIoNumber {
  return {
    _type: 'number',
    validate(value) {
      if (typeof value !== 'number')
        return {ok: false, error: `Value is not a number.`}
      if (isNaN(value))
        return {ok: false, error: `Value provided is NaN (not a number).`}
      return {ok: true, value}
    },
  }
}

export function ioObject<
  F extends Record<string, TypeIoAll> = Record<string, TypeIoAll>,
>(fields: F): TypeIoObject<F> {
  return {
    _type: 'object',
    extend<X extends Record<string, TypeIoAll>>(newFields: X) {
      const currentFields = fields
      return ioObject({
        ...currentFields,
        ...newFields,
      }) as TypeIoObject<Omit<F, keyof X> & X>
    },
    validate(value) {
      if (typeof value !== 'object')
        return {ok: false, error: `Value is not a object.`}
      try {
        return {
          ok: true,
          value: Object.entries(fields).reduce((all, [key, ofType]) => {
            const data = ofType.validate((value as Record<string, unknown>)[key] as never)
            if (!data.ok) throw `[${key}]: ${data.error}`
            if (data.value !== undefined) {
              ;(all as Record<string, unknown>)[key] = data.value
            }
            return all
          }, {} as OptionalUndefined<{[K in keyof F]: TypeIoValue<F[K]>}>),
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
  ofType: T
): TypeIoOptional<T> {
  return {
    _type: 'optional',
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
      if (!options?.emptyok && !value.trim().length)
        return {ok: false, error: `Value can not be empty.`}
      if (options?.regex && !options.regex.test(value))
        return {ok: false, error: `Value does not match regular expression.`}
      if (options?.email && !regex.email().test(value))
        return {ok: false, error: `Value is not a valid email.`}
      if (options?.trim) value = value.trim()
      if (options?.nowhitespace) value = value.split(' ').join('')
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
  lazy: ioLazy,
  null: ioNull,
  number: ioNumber,
  object: ioObject,
  optional: ioOptional,
  string: ioString,
}
