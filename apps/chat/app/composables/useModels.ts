import { MODELS } from '#shared/utils/models'

export function useModels() {
  const model = useCookie<string>('model', { default: () => 'qwen3-next-80b-instruct' })

  return {
    models: MODELS,
    model
  }
}
