import { Button } from '@based-chat/ui/components/button'
import { Input } from '@based-chat/ui/components/input'
import { Eye, EyeOff, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { useLocalStorage } from '@/hooks/use-local-storage'
import {
  OPENROUTER_API_KEY_STORAGE_KEY,
  normalizeOpenRouterApiKey,
} from '@/lib/api-key-storage'

export default function ApiKeysTab() {
  const [savedApiKey, setSavedApiKey] = useLocalStorage(
    OPENROUTER_API_KEY_STORAGE_KEY,
    '',
    {
      parse: (rawValue) => normalizeOpenRouterApiKey(rawValue) ?? '',
      serialize: (value) => normalizeOpenRouterApiKey(value),
    },
  )
  const [apiKey, setApiKey] = useState(savedApiKey)
  const [showKey, setShowKey] = useState(false)
  const hasSavedApiKey = savedApiKey.length > 0
  const hasUnsavedChanges = apiKey.trim() !== savedApiKey

  useEffect(() => {
    setApiKey(savedApiKey)
  }, [savedApiKey])

  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-base font-semibold tracking-tight'>API Keys</h2>
        <p className='mt-1 text-xs text-muted-foreground'>
          Manage your API keys for model providers.
        </p>
      </div>

      {/* OpenRouter section */}
      <div className='rounded-xl border border-border/50 bg-card/20 p-5 space-y-4'>
        <div className='flex items-start justify-between'>
          <div>
            <div className='flex items-center gap-2'>
              <h3 className='text-sm font-medium'>OpenRouter</h3>
              <div
                className={
                  apiKey.trim()
                    ? 'size-1.5 rounded-full bg-emerald-400/70'
                    : 'size-1.5 rounded-full bg-muted-foreground/30'
                }
              />
            </div>
            <p className='mt-1 text-[10px] text-muted-foreground'>
              Connect your OpenRouter API key to access all available models.
            </p>
          </div>
          <a
            href='https://openrouter.ai/keys'
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors'
          >
            Get a key
            <ExternalLink className='size-2.5' />
          </a>
        </div>

        <div className='space-y-2'>
          <label className='text-xs font-medium text-muted-foreground'>
            API Key
          </label>
          <div className='relative'>
            <Input
              type={showKey ? 'text' : 'password'}
              placeholder='sk-or-v1-...'
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className='h-9 rounded-lg bg-muted/30 border-border/50 pr-9 font-mono text-[11px] focus-visible:bg-muted/50'
            />
            <button
              type='button'
              onClick={() => setShowKey(!showKey)}
              className='absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer'
            >
              {showKey ? (
                <EyeOff className='size-3.5' />
              ) : (
                <Eye className='size-3.5' />
              )}
            </button>
          </div>
        </div>

        <div className='flex items-center justify-between gap-3 pt-1'>
          <p className='text-[10px] text-muted-foreground/50'>
            Your key is stored in this browser and sent with chat requests so
            the backend can call OpenRouter on your behalf.
          </p>
          <div className='flex items-center gap-2'>
            {hasSavedApiKey ? (
              <Button
                size='sm'
                variant='ghost'
                onClick={() => {
                  setSavedApiKey('')
                  toast.success('API key removed.')
                }}
              >
                Clear key
              </Button>
            ) : null}
            <Button
              size='sm'
              disabled={!hasUnsavedChanges}
              onClick={() => {
                const savedKey = normalizeOpenRouterApiKey(apiKey) ?? ''
                setSavedApiKey(savedKey)
                setApiKey(savedKey)
                toast.success(
                  savedKey ? 'API key saved.' : 'API key removed.',
                )
              }}
            >
              Save key
            </Button>
          </div>
        </div>
      </div>

      {/* Placeholder for future providers */}
      <div className='rounded-xl border border-dashed border-border/30 px-5 py-8 text-center'>
        <p className='text-xs text-muted-foreground/40'>
          More providers coming soon.
        </p>
      </div>
    </div>
  )
}
