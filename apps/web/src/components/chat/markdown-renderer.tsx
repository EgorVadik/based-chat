import { Button } from '@based-chat/ui/components/button'
import { cn } from '@based-chat/ui/lib/utils'
import { Check, Copy, ImageIcon } from 'lucide-react'
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'

const SHIKI_THEME = 'vesper'
const HIGHLIGHT_CACHE_LIMIT = 100
// While a message streams, a code block is only highlighted once it has
// stopped changing for this long (i.e. the block is complete).
const STREAMING_HIGHLIGHT_IDLE_MS = 400
const REMARK_PLUGINS = [remarkGfm]
// LRU: Map iteration order is insertion order, so the first key is the oldest.
const highlightedHtmlCache = new Map<string, string>()
let shikiModulePromise: Promise<typeof import('shiki')> | null = null

// Set by the `pre` renderer so `code` can tell fenced/indented blocks (with or
// without a language) apart from inline code.
const CodeBlockContext = createContext(false)
const MarkdownStreamingContext = createContext(false)

function readHighlightCache(cacheKey: string) {
  const cachedHtml = highlightedHtmlCache.get(cacheKey)
  if (cachedHtml !== undefined) {
    highlightedHtmlCache.delete(cacheKey)
    highlightedHtmlCache.set(cacheKey, cachedHtml)
  }

  return cachedHtml
}

function writeHighlightCache(cacheKey: string, html: string) {
  highlightedHtmlCache.delete(cacheKey)
  highlightedHtmlCache.set(cacheKey, html)

  while (highlightedHtmlCache.size > HIGHLIGHT_CACHE_LIMIT) {
    const oldestKey = highlightedHtmlCache.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    highlightedHtmlCache.delete(oldestKey)
  }
}

async function highlightCode(
  code: string,
  language: string,
  { cache }: { cache: boolean },
) {
  const cacheKey = `${language}\u0000${code}`
  const cachedHtml = readHighlightCache(cacheKey)
  if (cachedHtml !== undefined) {
    return cachedHtml
  }

  shikiModulePromise ??= import('shiki')
  const { codeToHtml } = await shikiModulePromise

  let highlightedHtml: string
  try {
    highlightedHtml = await codeToHtml(code, {
      lang: language,
      theme: SHIKI_THEME,
    })
  } catch {
    highlightedHtml = await codeToHtml(code, {
      lang: 'text',
      theme: SHIKI_THEME,
    })
  }

  // Partial code from an in-progress stream is never cached.
  if (cache) {
    writeHighlightCache(cacheKey, highlightedHtml)
  }

  return highlightedHtml
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const resetTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current)
      }
    }
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      toast.error('Could not copy the code.')
      return
    }

    setCopied(true)
    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current)
    }
    resetTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className='flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors'
    >
      {copied ? (
        <>
          <Check className='size-3' />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className='size-3' />
          <span>Copy</span>
        </>
      )}
    </button>
  )
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const isStreaming = useContext(MarkdownStreamingContext)
  const [highlighted, setHighlighted] = useState<{
    code: string
    language: string
    html: string
  } | null>(() => {
    // Seed from the cache so remounting a finished block doesn't flash plain.
    const cachedHtml = readHighlightCache(`${language}\u0000${code}`)
    return cachedHtml === undefined ? null : { code, language, html: cachedHtml }
  })

  useEffect(() => {
    let cancelled = false
    const runHighlight = () => {
      void highlightCode(code, language, { cache: !isStreaming })
        .then((html) => {
          if (!cancelled) {
            setHighlighted({ code, language, html })
          }
        })
        .catch(() => {})
    }

    if (!isStreaming) {
      runHighlight()
      return () => {
        cancelled = true
      }
    }

    const timeoutId = window.setTimeout(
      runHighlight,
      STREAMING_HIGHLIGHT_IDLE_MS,
    )

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [code, isStreaming, language])

  // Only show highlighted HTML for the exact current code; stale HTML would
  // hide lines that streamed in after it was produced.
  const highlightedHtml =
    highlighted?.code === code && highlighted.language === language
      ? highlighted.html
      : null

  return (
    <div className='group/code relative mb-3 last:mb-0 rounded-xl overflow-hidden border border-white/4 shadow-lg shadow-black/20'>
      <div className='flex items-center justify-between bg-zinc-900 px-4 py-2 text-[11px] border-b border-white/4'>
        <span className='font-mono text-muted-foreground/60 uppercase tracking-wider'>
          {language}
        </span>
        <CopyButton text={code} />
      </div>
      {highlightedHtml ? (
        <div
          className='shiki-container overflow-x-auto'
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre className='mt-0! rounded-t-none! mb-0!'>
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}

function CustomPre({ children }: ComponentProps<'pre'>) {
  return (
    <CodeBlockContext.Provider value={true}>{children}</CodeBlockContext.Provider>
  )
}

function CustomCode(props: ComponentProps<'code'>) {
  const { className, children, node, ...rest } =
    props as ComponentProps<'code'> & { node?: unknown }
  const isBlock = useContext(CodeBlockContext)
  const match = /language-([\w+#.-]+)/.exec(className ?? '')

  if (isBlock) {
    return (
      <CodeBlock
        language={match?.[1] ?? 'text'}
        code={String(children).replace(/\n$/, '')}
      />
    )
  }

  return (
    <code className={className} {...rest}>
      {children}
    </code>
  )
}

function CustomLink(props: ComponentProps<'a'>) {
  const { href, children, node, ...rest } = props as ComponentProps<'a'> & {
    node?: unknown
  }
  // In-page anchors (e.g. GFM footnotes) stay in the current tab.
  const isInPageLink = href?.startsWith('#') ?? false

  return (
    <a
      {...rest}
      href={href}
      {...(isInPageLink
        ? {}
        : { target: '_blank', rel: 'noopener noreferrer' })}
    >
      {children}
    </a>
  )
}

function getImageHostname(src: string) {
  try {
    return new URL(src, window.location.href).hostname || 'unknown host'
  } catch {
    return 'unknown host'
  }
}

// Remote images in model output are not fetched until the user asks: an
// auto-loading URL can carry conversation data to a third party.
function CustomImage(props: ComponentProps<'img'>) {
  const { src, alt, node, ...rest } = props as ComponentProps<'img'> & {
    node?: unknown
  }
  const [isRevealed, setIsRevealed] = useState(false)
  const source = typeof src === 'string' ? src : ''

  if (!source) {
    return alt ? <span className='text-muted-foreground'>{alt}</span> : null
  }

  if (isRevealed) {
    return (
      <img
        {...rest}
        src={source}
        alt={alt ?? ''}
        loading='lazy'
        decoding='async'
        referrerPolicy='no-referrer'
        className='my-2 max-h-96 max-w-full rounded-xl border border-border/50'
      />
    )
  }

  return (
    <Button
      type='button'
      variant='outline'
      size='sm'
      onClick={(event) => {
        // The image may be wrapped in a link; revealing must not navigate.
        event.preventDefault()
        setIsRevealed(true)
      }}
      className='my-1 h-auto max-w-full justify-start gap-2 rounded-lg px-2.5 py-1.5 text-left font-normal text-muted-foreground'
    >
      <ImageIcon className='size-3.5 shrink-0' />
      <span className='min-w-0 truncate'>
        {alt ? `${alt} · ` : ''}Load image from {getImageHostname(source)}
      </span>
    </Button>
  )
}

const MARKDOWN_COMPONENTS: Components = {
  a: CustomLink,
  code: CustomCode,
  img: CustomImage,
  pre: CustomPre,
}

function MarkdownRenderer({
  content,
  className,
  isStreaming = false,
}: {
  content: string
  className?: string
  isStreaming?: boolean
}) {
  return (
    <MarkdownStreamingContext.Provider value={isStreaming}>
      <div className={cn('markdown-body min-w-0 max-w-full', className)}>
        <Markdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
          {content}
        </Markdown>
      </div>
    </MarkdownStreamingContext.Provider>
  )
}

export default memo(MarkdownRenderer)
