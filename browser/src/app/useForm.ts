import {useMemo, useState} from 'react'
/**
 *
 */
export const useForm = <T extends Record<string, any>>(defaults: T) => {
  const [formData, formDataSet] = useState(defaults)
  const formDataPatch = (data: Partial<T>) =>
    formDataSet((i) => ({...i, ...data}))
  const formLink =
    <K extends keyof T>(key: K) =>
    (value: T[K]) =>
      formDataSet((i) => ({...i, [key]: value}))
  return useMemo(() => {
    return {
      data: formData,
      set: formDataSet,
      patch: formDataPatch,
      link: formLink,
      reset: () => formDataSet(defaults),
    }
  }, [formData])
}
