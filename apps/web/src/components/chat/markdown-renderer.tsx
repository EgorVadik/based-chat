import { cn } from "@based-chat/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useState,
  type ComponentProps,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SHIKI_THEME = "vesper";
const highlightedHtmlCache = new Map<string, string>();
let shikiModulePromise: Promise<typeof import("shiki")> | null = null;

async function highlightCode(code: string, language: string) {
  const cacheKey = `${language}\u0000${code}`;
  const cachedHtml = highlightedHtmlCache.get(cacheKey);
  if (cachedHtml) {
    return cachedHtml;
  }

  shikiModulePromise ??= import("shiki");
  const { codeToHtml } = await shikiModulePromise;

  let highlightedHtml: string;
  try {
    highlightedHtml = await codeToHtml(code, {
      lang: language,
      theme: SHIKI_THEME,
    });
  } catch {
    highlightedHtml = await codeToHtml(code, {
      lang: "text",
      theme: SHIKI_THEME,
    });
  }

  highlightedHtmlCache.set(cacheKey, highlightedHtml);
  return highlightedHtml;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
    >
      {copied ? (
        <>
          <Check className="size-3" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="size-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void highlightCode(code, language)
      .then((html) => {
        if (!cancelled) {
          setHighlightedHtml(html);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <div className="group/code relative mb-3 last:mb-0 rounded-xl overflow-hidden border border-white/[0.04] shadow-lg shadow-black/20">
      <div className="flex items-center justify-between bg-[oklch(0.10_0.005_270)] px-4 py-2 text-[11px] border-b border-white/[0.04]">
        <span className="font-mono text-muted-foreground/60 uppercase tracking-wider">
          {language}
        </span>
        <CopyButton text={code} />
      </div>
      {highlightedHtml ? (
        <div
          className="shiki-container overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre className="!mt-0 !rounded-t-none !mb-0">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

function CustomCode(props: ComponentProps<"code">) {
  const { className, children, node, ...rest } = props as ComponentProps<
    "code"
  > & { node?: unknown };
  const match = /language-(\w+)/.exec(String(className) || "");
  const codeString = String(children).replace(/\n$/, "");

  if (match) {
    return <CodeBlock language={match[1]!} code={codeString} />;
  }

  return (
    <code className={className} {...rest}>
      {children}
    </code>
  );
}

function MarkdownRenderer({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("markdown-body", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CustomCode,
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

export default memo(MarkdownRenderer);
