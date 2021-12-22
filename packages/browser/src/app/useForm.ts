import {useMemo, useState} from 'react'
/**
 *
 */
export const useForm = <T extends Record<string, any>>(defaults: T) => {
  const [formData, formDataSet] = useState(defaults)
  const formDataPatch = (data: Partial<typeof formData>) =>
    formDataSet((i) => ({...i, ...data}))
  return useMemo(() => {
    return {
      data: formData,
      set: formDataSet,
      patch: formDataPatch,
      reset: () => formDataSet(defaults),
    }
  }, [formData])
}
