import { File as ExpoFile } from 'expo-file-system'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Keyboard, Platform } from 'react-native'
import {
  type AudioRecorder,
  AudioQuality,
  IOSOutputFormat,
  RecordingPresets,
  type RecordingOptions,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio'

import { transcribeLocalAudioFile } from '@/lib/audio-transcription'

/**
 * The transcription endpoint rejects audio over 8 MB. iOS records 16 kHz mono
 * 16-bit WAV (~32 KB/s, ~4.4 min), so stop well before that.
 */
const MAX_RECORDING_SECONDS = 240
const LEVEL_POLL_INTERVAL_MS = 80
const IDLE_LEVEL = 0.15

function buildVoiceRecorderOptions(): RecordingOptions {
  if (Platform.OS === 'ios') {
    return {
      isMeteringEnabled: true,
      extension: '.wav',
      sampleRate: 16_000,
      numberOfChannels: 1,
      bitRate: 128_000,
      android: RecordingPresets.HIGH_QUALITY.android,
      web: RecordingPresets.HIGH_QUALITY.web,
      ios: {
        extension: '.wav',
        sampleRate: 16_000,
        outputFormat: IOSOutputFormat.LINEARPCM,
        audioQuality: AudioQuality.HIGH,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
    }
  }
  return {
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  }
}

export type SpeechToTextPhase = 'idle' | 'recording' | 'transcribing'

/** Map recorder metering (often dBFS, roughly -160…0) to 0…1 for UI bars. */
function meteringToLevel(metering: number | undefined): number {
  if (metering == null || Number.isNaN(metering)) {
    return IDLE_LEVEL
  }
  const v = (metering + 60) / 50
  return Math.max(0.05, Math.min(1, v))
}

function getRecordingUri(recorder: AudioRecorder) {
  try {
    return recorder.uri ?? recorder.getStatus().url
  } catch {
    // The recorder may already be released (screen unmounted).
    return null
  }
}

function deleteRecordingFile(uri: string | null | undefined) {
  if (!uri) {
    return
  }

  try {
    const file = new ExpoFile(uri)
    if (file.exists) {
      file.delete()
    }
  } catch {
    // Best effort; the file lives in the cache directory.
  }
}

function releaseAudioMode() {
  void setAudioModeAsync({ allowsRecording: false }).catch(() => {})
}

export function useSpeechToText(onTranscript: (text: string) => void) {
  const [phase, setPhase] = useState<SpeechToTextPhase>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [level, setLevel] = useState(IDLE_LEVEL)
  const phaseRef = useRef<SpeechToTextPhase>('idle')
  const isStartingRef = useRef(false)
  const onTranscriptRef = useRef(onTranscript)
  const isSupported = Platform.OS !== 'web'

  const recorderOptions = useMemo(() => buildVoiceRecorderOptions(), [])
  const recorder = useAudioRecorder(recorderOptions)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  const updatePhase = useCallback((nextPhase: SpeechToTextPhase) => {
    phaseRef.current = nextPhase
    setPhase(nextPhase)
  }, [])

  const startRecording = useCallback(async () => {
    if (!isSupported || phaseRef.current !== 'idle' || isStartingRef.current) {
      return
    }

    isStartingRef.current = true
    setErrorMessage(null)
    try {
      const { status } = await requestRecordingPermissionsAsync()
      if (status !== 'granted') {
        setErrorMessage('Microphone access is required for voice input.')
        return
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
      })
      await recorder.prepareToRecordAsync()
      recorder.record({ forDuration: MAX_RECORDING_SECONDS })
      setLevel(IDLE_LEVEL)
      updatePhase('recording')
    } catch (e) {
      setErrorMessage(
        e instanceof Error ? e.message : 'Could not start recording.',
      )
      updatePhase('idle')
      releaseAudioMode()
    } finally {
      isStartingRef.current = false
    }
  }, [isSupported, recorder, updatePhase])

  const stopAndTranscribe = useCallback(async () => {
    if (phaseRef.current !== 'recording') {
      return
    }

    updatePhase('transcribing')
    let fileUri: string | null = null
    try {
      try {
        await recorder.stop()
      } catch {
        // Already stopped by the duration cap or a system interruption.
      }
      fileUri = getRecordingUri(recorder)
      if (!fileUri) {
        throw new Error('No recording file was produced.')
      }
      const text = await transcribeLocalAudioFile(fileUri)
      onTranscriptRef.current(text)
      setErrorMessage(null)
    } catch (e) {
      setErrorMessage(
        e instanceof Error
          ? e.message
          : 'Transcription failed. Try again.',
      )
    } finally {
      deleteRecordingFile(fileUri)
      releaseAudioMode()
      updatePhase('idle')
    }
  }, [recorder, updatePhase])

  /** Stops and discards an in-progress recording (blur, background, unmount). */
  const cancel = useCallback(() => {
    if (phaseRef.current !== 'recording') {
      return
    }

    updatePhase('idle')
    void (async () => {
      try {
        await recorder.stop()
      } catch {
        // Already stopped or released.
      }
      deleteRecordingFile(getRecordingUri(recorder))
      releaseAudioMode()
    })()
  }, [recorder, updatePhase])

  // Poll the recorder only while recording (metering + stop detection).
  useEffect(() => {
    if (phase !== 'recording') {
      return
    }

    let sawRecording = false
    const interval = setInterval(() => {
      let status: ReturnType<AudioRecorder['getStatus']>
      try {
        status = recorder.getStatus()
      } catch {
        return
      }

      if (status.isRecording) {
        sawRecording = true
        setLevel(meteringToLevel(status.metering))
        return
      }

      if (sawRecording) {
        // Duration cap reached or the system interrupted the recording:
        // transcribe what was captured instead of leaving the UI stuck.
        void stopAndTranscribe()
      }
    }, LEVEL_POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [phase, recorder, stopAndTranscribe])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        cancel()
      }
    })

    return () => {
      subscription.remove()
      cancel()
    }
  }, [cancel])

  const toggle = useCallback(async () => {
    if (!isSupported || phaseRef.current === 'transcribing') {
      return
    }
    if (phaseRef.current === 'recording') {
      await stopAndTranscribe()
      return
    }
    Keyboard.dismiss()
    await startRecording()
  }, [isSupported, startRecording, stopAndTranscribe])

  return {
    phase,
    level,
    errorMessage,
    setErrorMessage,
    isSupported,
    toggle,
    cancel,
  }
}
