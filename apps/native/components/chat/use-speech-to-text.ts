import { useCallback, useMemo, useState } from 'react'
import { Keyboard, Platform } from 'react-native'
import {
  AudioQuality,
  IOSOutputFormat,
  RecordingPresets,
  type RecordingOptions,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'

import { transcribeLocalAudioFile } from '@/lib/audio-transcription'

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
        numberOfChannels: 1,
        bitRate: 128_000,
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
    return 0.15
  }
  const v = (metering + 60) / 50
  return Math.max(0.05, Math.min(1, v))
}

export function useSpeechToText() {
  const [phase, setPhase] = useState<SpeechToTextPhase>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const recorderOptions = useMemo(() => buildVoiceRecorderOptions(), [])
  const recorder = useAudioRecorder(recorderOptions)
  const recState = useAudioRecorderState(recorder, 80)

  const level = useMemo(
    () => meteringToLevel(recState.metering),
    [recState.metering],
  )

  const startRecording = useCallback(async () => {
    if (Platform.OS === 'web') {
      return
    }
    setErrorMessage(null)
    const { status } = await requestRecordingPermissionsAsync()
    if (status !== 'granted') {
      setErrorMessage('Microphone access is required for voice input.')
      return
    }
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
      })
      await recorder.prepareToRecordAsync()
      recorder.record()
      setPhase('recording')
    } catch (e) {
      setErrorMessage(
        e instanceof Error ? e.message : 'Could not start recording.',
      )
      setPhase('idle')
    }
  }, [recorder])

  const stopAndTranscribe = useCallback(
    async (appendTranscript: (text: string) => void) => {
      if (Platform.OS === 'web') {
        return
      }
      if (!recorder.getStatus().isRecording) {
        setPhase('idle')
        return
      }
      setPhase('transcribing')
      try {
        await recorder.stop()
        const fileUri = recorder.uri ?? recorder.getStatus().url
        if (!fileUri) {
          throw new Error('No recording file was produced.')
        }
        const text = await transcribeLocalAudioFile(fileUri)
        appendTranscript(text)
        setErrorMessage(null)
      } catch (e) {
        setErrorMessage(
          e instanceof Error
            ? e.message
            : 'Transcription failed. Try again.',
        )
      } finally {
        setPhase('idle')
      }
    },
    [recorder],
  )

  const toggle = useCallback(
    async (appendTranscript: (text: string) => void) => {
      if (Platform.OS === 'web' || phase === 'transcribing') {
        return
      }
      if (recState.isRecording) {
        await stopAndTranscribe(appendTranscript)
        return
      }
      Keyboard.dismiss()
      await startRecording()
    },
    [phase, recState.isRecording, startRecording, stopAndTranscribe],
  )

  return {
    phase,
    level,
    errorMessage,
    setErrorMessage,
    isSupported: Platform.OS !== 'web',
    toggle,
  }
}
