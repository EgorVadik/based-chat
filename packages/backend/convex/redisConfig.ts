import { Redis } from '@upstash/redis'
import { z } from 'zod'

const DEFAULT_CACHE_TTL_MS = 30_000
const redisConfigCache = new Map<string, { expiresAt: number; value: unknown }>()

function createRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    return null
  }

  return new Redis({
    url,
    token,
  })
}

export async function readSerializedRedisConfig<T>({
  key,
  schema,
  fallback,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
}: {
  key: string
  schema: z.ZodType<T>
  fallback: T
  cacheTtlMs?: number
}) {
  const cachedValue = redisConfigCache.get(key)

  if (cachedValue && cachedValue.expiresAt > Date.now()) {
    return cachedValue.value as T
  }

  const redis = createRedisClient()

  if (!redis) {
    return fallback
  }

  try {
    const value = await redis.get<unknown>(key)

    if (!value) {
      redisConfigCache.set(key, {
        value: fallback,
        expiresAt: Date.now() + cacheTtlMs,
      })
      return fallback
    }

    const jsonValue = typeof value === 'string' ? JSON.parse(value) : value
    const validatedValue = schema.parse(jsonValue)
    redisConfigCache.set(key, {
      value: validatedValue,
      expiresAt: Date.now() + cacheTtlMs,
    })
    return validatedValue
  } catch (error) {
    console.error(`Failed to parse Redis config key "${key}".`, error)
    redisConfigCache.set(key, {
      value: fallback,
      expiresAt: Date.now() + cacheTtlMs,
    })
    return fallback
  }
}
