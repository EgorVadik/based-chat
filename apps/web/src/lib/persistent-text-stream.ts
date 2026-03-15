import type { StreamBody, StreamId } from "@convex-dev/persistent-text-streaming";
import type { FunctionReference } from "convex/server";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";

type PersistentBody = StreamBody & {
  errorMessage?: string;
};
type StreamStatus = StreamBody["status"];
type StreamStartResult = {
  ok: boolean;
  errorMessage?: string;
};
type PersistentStreamState = PersistentBody & {
  errorMessage?: string;
};

const TERMINAL_STATUSES = new Set<StreamStatus>(["done", "error", "timeout"]);
const PERSISTENCE_SETTLE_TIMEOUT_MS = 2500;
const streamAbortControllers = new Map<StreamId, AbortController>();

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
  const [streamErrorMessage, setStreamErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const [didPersistenceStall, setDidPersistenceStall] = useState(false);
  const streamStarted = useRef(false);

  const persistentBody = useQuery(
    getPersistentBody,
    streamId ? { streamId } : "skip",
  );
  const persistentText = persistentBody?.text ?? "";
  const hasPersistentRecoveryState =
    persistentBody != null &&
    (persistentText.length > 0 ||
      persistentBody.status === "streaming" ||
      persistentBody.status === "done");
  const hasDirectStreamText = streamBody.length > 0;

  useEffect(() => {
    setStreamEnded(null);
    setStreamBody("");
    setStreamErrorMessage(undefined);
    setDidPersistenceStall(false);
    streamStarted.current = false;
  }, [streamId]);

  useEffect(() => {
    if (!driven || !streamId || streamStarted.current) {
      return;
    }

    streamStarted.current = true;
    let cancelled = false;

    void startStreaming(streamUrl, streamId, (text) => {
      if (!cancelled) {
        setStreamBody((currentBody) => currentBody + text);
      }
    }).then((result) => {
      if (!cancelled) {
        setStreamEnded(result.ok);
        setStreamErrorMessage(result.errorMessage);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [driven, streamId, streamUrl]);

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
      };
    }

    if (persistentBody?.errorMessage) {
      return {
        text: persistentBody.text || streamBody,
        status: "error",
        errorMessage: persistentBody.errorMessage,
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
      };
    }

    if (streamEnded === false) {
      if (hasPersistentRecoveryState) {
        return {
          text: persistentText || streamBody,
          status: persistentBody!.status,
          errorMessage: persistentBody?.errorMessage,
        };
      }

      return {
        text: persistentText || streamBody,
        status: "error",
        errorMessage:
          persistentBody?.errorMessage ??
          streamErrorMessage ??
          "Reply failed to stream. Retry to generate again.",
      };
    }

    if (driven) {
      if (streamEnded === true) {
        if (didPersistenceStall && !hasDirectStreamText && !hasPersistentRecoveryState) {
          return {
            text: "",
            status: "error",
            errorMessage:
              persistentBody?.errorMessage ??
              streamErrorMessage ??
              "The reply stalled before the stream could finish.",
          };
        }

        return {
          text: streamBody || persistentText,
          status:
            persistentBody?.status === "pending" && !hasDirectStreamText
              ? "pending"
              : "streaming",
          errorMessage: persistentBody?.errorMessage ?? streamErrorMessage,
        };
      }

      return {
        text: streamBody,
        status: hasDirectStreamText ? "streaming" : "pending",
      };
    }

    return (
      persistentBody ?? {
        text: "",
        status: "pending",
      }
    );
  }, [
    didPersistenceStall,
    driven,
    hasDirectStreamText,
    hasPersistentRecoveryState,
    persistentBody,
    persistentText,
    streamBody,
    streamEnded,
    streamErrorMessage,
    streamId,
  ]);
}

async function startStreaming(
  url: URL,
  streamId: StreamId,
  onUpdate: (text: string) => void,
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
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: abortController.signal,
      body: JSON.stringify({ streamId }),
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

  while (true) {
    try {
      const { done, value } = await reader.read();

      if (value) {
        onUpdate(decoder.decode(value, { stream: !done }));
      }

      if (done) {
        streamAbortControllers.delete(streamId);
        return { ok: true };
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
