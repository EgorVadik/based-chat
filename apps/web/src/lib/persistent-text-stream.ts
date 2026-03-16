import type { StreamBody, StreamId } from "@convex-dev/persistent-text-streaming";
import type { FunctionReference } from "convex/server";
import { useQuery } from "convex/react";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getStoredOpenRouterApiKey } from "@/lib/api-key-storage";
import type { MessageAttachment } from "@/lib/attachments";
import { authClient } from "@/lib/auth-client";
import type { ChatMessageSource } from "@/lib/chat";

type PersistentBody = StreamBody & {
  errorMessage?: string;
  sources?: ChatMessageSource[];
  attachments?: MessageAttachment[];
};
type StreamStatus = StreamBody["status"];
type StreamStartResult = {
  ok: boolean;
  errorMessage?: string;
};
type PersistentStreamState = PersistentBody & {
  errorMessage?: string;
  reasoningText?: string;
  sources: ChatMessageSource[];
  attachments: MessageAttachment[];
};

const TERMINAL_STATUSES = new Set<StreamStatus>(["done", "error", "timeout"]);
const PERSISTENCE_SETTLE_TIMEOUT_MS = 2500;
const streamAbortControllers = new Map<StreamId, AbortController>();

function mergeSources(
  currentSources: ChatMessageSource[],
  nextSource: ChatMessageSource,
) {
  const existingSourceIndex = currentSources.findIndex(
    (source) => source.url === nextSource.url || source.id === nextSource.id,
  );

  if (existingSourceIndex === -1) {
    return [...currentSources, nextSource];
  }

  const existingSource = currentSources[existingSourceIndex]!;
  const mergedSource: ChatMessageSource = {
    ...existingSource,
    ...nextSource,
    title: nextSource.title || existingSource.title,
    snippet:
      nextSource.snippet &&
      nextSource.snippet.length >= (existingSource.snippet?.length ?? 0)
        ? nextSource.snippet
        : existingSource.snippet,
    hostname: nextSource.hostname || existingSource.hostname,
  };

  if (
    mergedSource.id === existingSource.id &&
    mergedSource.url === existingSource.url &&
    mergedSource.title === existingSource.title &&
    mergedSource.snippet === existingSource.snippet &&
    mergedSource.hostname === existingSource.hostname
  ) {
    return currentSources;
  }

  return currentSources.map((source, index) =>
    index === existingSourceIndex ? mergedSource : source,
  );
}

function mergeSourceLists(
  persistentSources: ChatMessageSource[],
  liveSources: ChatMessageSource[],
) {
  return liveSources.reduce(mergeSources, persistentSources);
}

function mergeAttachments(
  currentAttachments: MessageAttachment[],
  nextAttachment: MessageAttachment,
) {
  const existingAttachmentIndex = currentAttachments.findIndex(
    (attachment) => attachment.storageId === nextAttachment.storageId,
  );

  if (existingAttachmentIndex === -1) {
    return [...currentAttachments, nextAttachment];
  }

  const existingAttachment = currentAttachments[existingAttachmentIndex]!;
  const mergedAttachment: MessageAttachment = {
    ...existingAttachment,
    ...nextAttachment,
    url: nextAttachment.url ?? existingAttachment.url,
  };

  if (
    mergedAttachment.kind === existingAttachment.kind &&
    mergedAttachment.storageId === existingAttachment.storageId &&
    mergedAttachment.fileName === existingAttachment.fileName &&
    mergedAttachment.contentType === existingAttachment.contentType &&
    mergedAttachment.size === existingAttachment.size &&
    mergedAttachment.url === existingAttachment.url
  ) {
    return currentAttachments;
  }

  return currentAttachments.map((attachment, index) =>
    index === existingAttachmentIndex ? mergedAttachment : attachment,
  );
}

function mergeAttachmentLists(
  persistentAttachments: MessageAttachment[],
  liveAttachments: MessageAttachment[],
) {
  return liveAttachments.reduce(mergeAttachments, persistentAttachments);
}

export function abortPersistentTextStream(streamId: StreamId) {
  streamAbortControllers.get(streamId)?.abort();
}

export function usePersistentTextStream(
  getPersistentBody: FunctionReference<
    "query",
    "public",
    { streamId: string },
    PersistentBody
  >,
  streamUrl: URL,
  driven: boolean,
  streamId: StreamId | undefined,
) {
  const [streamEnded, setStreamEnded] = useState<boolean | null>(null);
  const [streamBody, setStreamBody] = useState("");
  const [streamReasoningBody, setStreamReasoningBody] = useState("");
  const [streamSources, setStreamSources] = useState<ChatMessageSource[]>([]);
  const [streamAttachments, setStreamAttachments] = useState<MessageAttachment[]>([]);
  const [streamErrorMessage, setStreamErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const [didPersistenceStall, setDidPersistenceStall] = useState(false);
  const streamStarted = useRef(false);
  const pendingChunkRef = useRef("");
  const pendingReasoningChunkRef = useRef("");
  const animationFrameRef = useRef<number | null>(null);

  const persistentBody = useQuery(
    getPersistentBody,
    streamId ? { streamId } : "skip",
  );
  const persistentText = persistentBody?.text ?? "";
  const persistentAttachments = persistentBody?.attachments ?? [];
  const hasPersistentRecoveryState =
    persistentBody != null &&
    (persistentText.length > 0 ||
      persistentAttachments.length > 0 ||
      persistentBody.status === "streaming" ||
      persistentBody.status === "done");
  const hasDirectStreamText = streamBody.length > 0;
  const hasDirectStreamAttachments = streamAttachments.length > 0;
  const hasDirectStreamContent =
    hasDirectStreamText || hasDirectStreamAttachments;

  const flushPendingChunks = useCallback(() => {
    const chunk = pendingChunkRef.current;
    const reasoningChunk = pendingReasoningChunkRef.current;

    if (!chunk && !reasoningChunk) {
      return;
    }

    pendingChunkRef.current = "";
    pendingReasoningChunkRef.current = "";
    startTransition(() => {
      if (chunk) {
        setStreamBody((currentBody) => currentBody + chunk);
      }

      if (reasoningChunk) {
        setStreamReasoningBody((currentBody) => currentBody + reasoningChunk);
      }
    });
  }, []);

  const scheduleChunkFlush = useCallback(() => {
    if (animationFrameRef.current !== null) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      flushPendingChunks();
    });
  }, [flushPendingChunks]);

  useEffect(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    pendingChunkRef.current = "";
    pendingReasoningChunkRef.current = "";
    setStreamEnded(null);
    setStreamBody("");
    setStreamReasoningBody("");
    setStreamSources([]);
    setStreamAttachments([]);
    setStreamErrorMessage(undefined);
    setDidPersistenceStall(false);
    streamStarted.current = false;
  }, [streamId]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!driven || !streamId || streamStarted.current) {
      return;
    }

    streamStarted.current = true;
    let cancelled = false;

    void startStreaming(streamUrl, streamId, {
      onTextDelta(text) {
        if (!cancelled) {
          pendingChunkRef.current += text;
          scheduleChunkFlush();
        }
      },
      onReasoningDelta(text) {
        if (!cancelled) {
          pendingReasoningChunkRef.current += text;
          scheduleChunkFlush();
        }
      },
      onSource(source) {
        if (!cancelled) {
          startTransition(() => {
            setStreamSources((currentSources) =>
              mergeSources(currentSources, source),
            );
          });
        }
      },
      onAttachment(attachment) {
        if (!cancelled) {
          startTransition(() => {
            setStreamAttachments((currentAttachments) =>
              mergeAttachments(currentAttachments, attachment),
            );
          });
        }
      },
    }).then((result) => {
      if (!cancelled) {
        flushPendingChunks();
        setStreamEnded(result.ok);
        setStreamErrorMessage(result.errorMessage);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [driven, flushPendingChunks, scheduleChunkFlush, streamId, streamUrl]);

  useEffect(() => {
    if (
      !driven ||
      !streamId ||
      streamEnded !== true ||
      (persistentBody && TERMINAL_STATUSES.has(persistentBody.status))
    ) {
      setDidPersistenceStall(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDidPersistenceStall(true);
    }, PERSISTENCE_SETTLE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [driven, persistentBody, streamEnded, streamId]);

  return useMemo<PersistentStreamState>(() => {
    if (!streamId) {
      return {
        text: "",
        status: "pending",
        sources: [],
        attachments: [],
      };
    }

    const resolvedSources = mergeSourceLists(
      persistentBody?.sources ?? [],
      streamSources,
    );
    const resolvedAttachments = mergeAttachmentLists(
      persistentBody?.attachments ?? [],
      streamAttachments,
    );

    if (persistentBody?.errorMessage) {
      return {
        text: persistentBody.text || streamBody,
        status: "error",
        errorMessage: persistentBody.errorMessage,
        reasoningText: streamReasoningBody || undefined,
        sources: resolvedSources,
        attachments: resolvedAttachments,
      };
    }

    if (persistentBody && TERMINAL_STATUSES.has(persistentBody.status)) {
      return {
        text: persistentBody.text || streamBody,
        status: persistentBody.status,
        errorMessage:
          persistentBody.status === "error" || persistentBody.status === "timeout"
            ? persistentBody.errorMessage ?? streamErrorMessage
            : undefined,
        reasoningText: streamReasoningBody || undefined,
        sources: resolvedSources,
        attachments: resolvedAttachments,
      };
    }

    if (streamEnded === false) {
      if (hasPersistentRecoveryState) {
        return {
          text: persistentText || streamBody,
          status: persistentBody!.status,
          errorMessage: persistentBody?.errorMessage,
          reasoningText: streamReasoningBody || undefined,
          sources: resolvedSources,
          attachments: resolvedAttachments,
        };
      }

      return {
        text: persistentText || streamBody,
        status: "error",
        errorMessage:
          persistentBody?.errorMessage ??
          streamErrorMessage ??
          "Reply failed to stream. Retry to generate again.",
        reasoningText: streamReasoningBody || undefined,
        sources: resolvedSources,
        attachments: resolvedAttachments,
      };
    }

    if (driven) {
      if (streamEnded === true) {
        if (
          didPersistenceStall &&
          !hasDirectStreamContent &&
          !hasPersistentRecoveryState
        ) {
          return {
            text: "",
            status: "error",
            errorMessage:
              persistentBody?.errorMessage ??
              streamErrorMessage ??
              "The reply stalled before the stream could finish.",
            sources: resolvedSources,
            attachments: resolvedAttachments,
          };
        }

        return {
          text: streamBody || persistentText,
          status:
            persistentBody?.status === "pending" && !hasDirectStreamContent
              ? "pending"
              : "streaming",
          errorMessage: persistentBody?.errorMessage ?? streamErrorMessage,
          reasoningText: streamReasoningBody || undefined,
          sources: resolvedSources,
          attachments: resolvedAttachments,
        };
      }

      return {
        text: streamBody,
        status: hasDirectStreamContent ? "streaming" : "pending",
        reasoningText: streamReasoningBody || undefined,
        sources: resolvedSources,
        attachments: resolvedAttachments,
      };
    }

    return persistentBody
      ? {
          ...persistentBody,
          sources: resolvedSources,
          attachments: resolvedAttachments,
        }
      : {
          text: "",
          status: "pending",
          sources: [],
          attachments: [],
        };
  }, [
    didPersistenceStall,
    driven,
    hasDirectStreamContent,
    hasPersistentRecoveryState,
    persistentAttachments,
    persistentBody,
    persistentText,
    streamBody,
    streamAttachments,
    streamReasoningBody,
    streamEnded,
    streamErrorMessage,
    streamId,
    streamSources,
  ]);
}

type StreamEvent =
  | {
      type: "text-delta";
      text: string;
    }
  | {
      type: "reasoning-delta";
      text: string;
    }
  | {
      type: "source";
      source: ChatMessageSource;
    }
  | {
      type: "attachment";
      attachment: MessageAttachment;
    }
  | {
      type: "error";
      errorMessage: string;
    };

async function startStreaming(
  url: URL,
  streamId: StreamId,
  handlers: {
    onTextDelta: (text: string) => void;
    onReasoningDelta: (text: string) => void;
    onSource: (source: ChatMessageSource) => void;
    onAttachment: (attachment: MessageAttachment) => void;
  },
): Promise<StreamStartResult> {
  const abortController = new AbortController();
  streamAbortControllers.set(streamId, abortController);
  const tokenResult = await authClient.convex.token({
    fetchOptions: { throw: false },
  });
  const accessToken = tokenResult.data?.token;

  if (!accessToken) {
    streamAbortControllers.delete(streamId);
    return {
      ok: false,
      errorMessage: "Could not authenticate the streaming request.",
    };
  }

  let response: Response;
  try {
    const apiKey = getStoredOpenRouterApiKey();
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: abortController.signal,
      body: JSON.stringify({
        streamId,
        apiKey: apiKey || undefined,
      }),
    });
  } catch (error) {
    streamAbortControllers.delete(streamId);
    return {
      ok: false,
      errorMessage:
        error instanceof Error
          ? error.name === "AbortError"
            ? "Stopped generating."
            : error.message
          : "Failed to reach the streaming endpoint.",
    };
  }

  if (response.status === 205) {
    streamAbortControllers.delete(streamId);
    return { ok: true };
  }

  if (!response.ok || !response.body) {
    streamAbortControllers.delete(streamId);
    let errorMessage = `Streaming request failed with ${response.status}.`;
    try {
      const responseText = (await response.text()).trim();
      if (responseText) {
        errorMessage = responseText;
      }
    } catch {
      // Ignore response body parsing errors and keep the fallback message.
    }

    if (!response.body && response.ok) {
      errorMessage = "The streaming response ended before any data arrived.";
    }

    return {
      ok: false,
      errorMessage,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bufferedResponseText = "";
  let streamEventErrorMessage: string | undefined;

  const processBufferedResponse = () => {
    const responseLines = bufferedResponseText.split("\n");
    bufferedResponseText = responseLines.pop() ?? "";

    for (const responseLine of responseLines) {
      const trimmedLine = responseLine.trim();
      if (!trimmedLine) {
        continue;
      }

      let streamEvent: StreamEvent;
      try {
        streamEvent = JSON.parse(trimmedLine) as StreamEvent;
      } catch {
        continue;
      }

      if (streamEvent.type === "text-delta") {
        handlers.onTextDelta(streamEvent.text);
        continue;
      }

      if (streamEvent.type === "reasoning-delta") {
        handlers.onReasoningDelta(streamEvent.text);
        continue;
      }

      if (streamEvent.type === "source") {
        handlers.onSource(streamEvent.source);
        continue;
      }

      if (streamEvent.type === "attachment") {
        handlers.onAttachment(streamEvent.attachment);
        continue;
      }

      if (streamEvent.type === "error") {
        streamEventErrorMessage = streamEvent.errorMessage;
      }
    }
  };

  while (true) {
    try {
      const { done, value } = await reader.read();

      if (value) {
        bufferedResponseText += decoder.decode(value, { stream: !done });
        processBufferedResponse();
      }

      if (done) {
        bufferedResponseText += decoder.decode();
        processBufferedResponse();
        streamAbortControllers.delete(streamId);
        return {
          ok: streamEventErrorMessage == null,
          errorMessage: streamEventErrorMessage,
        };
      }
    } catch (error) {
      streamAbortControllers.delete(streamId);
      return {
        ok: false,
        errorMessage:
          error instanceof Error
            ? error.name === "AbortError"
              ? "Stopped generating."
              : error.message
            : "The stream connection was interrupted.",
      };
    }
  }
}
