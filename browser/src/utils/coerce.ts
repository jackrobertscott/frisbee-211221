import {hsla} from './hsla'
/**
 *
 */
export const isString = (data: any): data is string => {
  return typeof data === 'string'
}
/**
 *
 */
export const isNumber = (data: any): data is number => {
  return typeof data === 'number' && !isNaN(data)
}
/**
 *
 */
export const isHSLAColor = (data: any): data is string => {
  return typeof data === 'string' && hsla.validate(data)
}
/**
 *
 */
export const isBoolean = (data: any): data is boolean => {
  return typeof data === 'boolean'
}
/**
 *
 */
export const isDefined = <T>(data: T): data is NonNullable<T> => {
  return data !== undefined && data !== null
}
/**
 *
 */
export const isObject = (data: any): data is Record<string, any> => {
  return typeof data === 'object' && !Array.isArray(data)
}
/**
 *
 */
export const isArray = <T>(data: T | T[] | any): data is T[] => {
  return Array.isArray(data)
}
/**
 *
 */
export const isFunction = (data: any): data is Function => {
  return typeof data === 'function'
}
