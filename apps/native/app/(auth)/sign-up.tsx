import { Ionicons } from '@expo/vector-icons'
import { useForm } from '@tanstack/react-form'
import { useConvexAuth } from 'convex/react'
import { Link, router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import z from 'zod'

import { authClient } from '@/lib/auth-client'
import { signInWithGitHub, signInWithGoogle } from '@/lib/social-auth'
import { useColors } from '@/lib/use-colors'

const signUpSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export default function SignUpScreen() {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)
  const [socialLoading, setSocialLoading] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const { isAuthenticated, isLoading } = useConvexAuth()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/(drawer)')
    }
  }, [isLoading, isAuthenticated])

  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
    validators: { onSubmit: signUpSchema },
    onSubmit: async ({ value, formApi }) => {
      setFormError(null)
      await authClient.signUp.email(
        {
          name: value.name.trim(),
          email: value.email.trim(),
          password: value.password,
        },
        {
          onError(error) {
            setFormError(error.error?.message || 'Failed to create account')
          },
          onSuccess() {
            formApi.reset()
          },
        },
      )
    },
  })

  const handleSocialSignIn = async (provider: 'github' | 'google') => {
    setSocialLoading(provider)
    setFormError(null)
    try {
      if (provider === 'google') {
        await signInWithGoogle()
      } else {
        await signInWithGitHub()
      }
    } catch (error) {
      if (error instanceof Error && !error.message.includes('cancel')) {
        setFormError(`Failed to sign in with ${provider}`)
      }
    } finally {
      setSocialLoading(null)
    }
  }

  return (
    <View className='flex-1' style={{ backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        className='flex-1'
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 20,
          }}
          keyboardShouldPersistTaps='handled'
        >
          <View className='w-full max-w-[380px] self-center gap-7'>
            {/* Logo */}
            <View className='items-center'>
              <View
                className='w-12 h-12 rounded-2xl items-center justify-center mb-5'
                style={{ backgroundColor: colors.primary }}
              >
                <Text
                  className='text-base font-bold'
                  style={{
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                    color: colors.primaryForeground,
                  }}
                >
                  B
                </Text>
              </View>
              <Text
                className='text-[22px] font-semibold'
                style={{ color: colors.foreground, letterSpacing: -0.3 }}
              >
                Create your account
              </Text>
              <Text
                className='text-sm mt-1'
                style={{ color: colors.mutedForeground }}
              >
                Sign up to get started with Based Chat
              </Text>
            </View>

            {/* Social buttons */}
            <View className='flex-row gap-2.5'>
              <Pressable
                onPress={() => handleSocialSignIn('github')}
                disabled={socialLoading !== null}
                className='flex-1 h-11 rounded-[14px] border flex-row items-center justify-center gap-2'
                style={{
                  borderColor: colors.border,
                  opacity: socialLoading !== null ? 0.6 : 1,
                }}
              >
                {socialLoading === 'github' ? (
                  <ActivityIndicator size='small' color={colors.foreground} />
                ) : (
                  <Ionicons
                    name='logo-github'
                    size={18}
                    color={colors.foreground}
                  />
                )}
                <Text
                  className='text-[13px] font-medium'
                  style={{ color: colors.foreground }}
                >
                  GitHub
                </Text>
              </Pressable>

              <Pressable
                onPress={() => handleSocialSignIn('google')}
                disabled={socialLoading !== null}
                className='flex-1 h-11 rounded-[14px] border flex-row items-center justify-center gap-2'
                style={{
                  borderColor: colors.border,
                  opacity: socialLoading !== null ? 0.6 : 1,
                }}
              >
                {socialLoading === 'google' ? (
                  <ActivityIndicator size='small' color={colors.foreground} />
                ) : (
                  <Ionicons
                    name='logo-google'
                    size={18}
                    color={colors.foreground}
                  />
                )}
                <Text
                  className='text-[13px] font-medium'
                  style={{ color: colors.foreground }}
                >
                  Google
                </Text>
              </Pressable>
            </View>

            {/* Divider */}
            <View className='flex-row items-center'>
              <View
                className='flex-1 h-px'
                style={{ backgroundColor: colors.border }}
              />
              <Text
                className='px-3.5 text-[10px] font-medium uppercase tracking-[2px] opacity-50'
                style={{ color: colors.mutedForeground }}
              >
                or
              </Text>
              <View
                className='flex-1 h-px'
                style={{ backgroundColor: colors.border }}
              />
            </View>

            {/* Form */}
            <View className='gap-3.5'>
              {formError && (
                <Text
                  className='text-xs font-medium'
                  style={{ color: colors.destructive }}
                >
                  {formError}
                </Text>
              )}

              <form.Field name='name'>
                {(field) => (
                  <View className='gap-1.5'>
                    <TextInput
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChangeText={field.handleChange}
                      placeholder='Display name'
                      placeholderTextColor={`${colors.mutedForeground}66`}
                      autoComplete='name'
                      textContentType='name'
                      returnKeyType='next'
                      blurOnSubmit={false}
                      onSubmitEditing={() => emailRef.current?.focus()}
                      className='h-11 rounded-[14px] border px-4 text-sm'
                      style={{
                        borderColor: `${colors.border}99`,
                        backgroundColor: `${colors.muted}33`,
                        color: colors.foreground,
                      }}
                    />
                    {field.state.meta.errors.length > 0 && (
                      <Text
                        className='text-[11px] font-medium'
                        style={{ color: colors.destructive }}
                      >
                        {typeof field.state.meta.errors[0] === 'string'
                          ? field.state.meta.errors[0]
                          : (field.state.meta.errors[0] as { message?: string })
                              ?.message}
                      </Text>
                    )}
                  </View>
                )}
              </form.Field>

              <form.Field name='email'>
                {(field) => (
                  <View className='gap-1.5'>
                    <TextInput
                      ref={emailRef}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChangeText={field.handleChange}
                      placeholder='Email address'
                      placeholderTextColor={`${colors.mutedForeground}66`}
                      keyboardType='email-address'
                      autoCapitalize='none'
                      autoComplete='email'
                      textContentType='emailAddress'
                      returnKeyType='next'
                      blurOnSubmit={false}
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      className='h-11 rounded-[14px] border px-4 text-sm'
                      style={{
                        borderColor: `${colors.border}99`,
                        backgroundColor: `${colors.muted}33`,
                        color: colors.foreground,
                      }}
                    />
                    {field.state.meta.errors.length > 0 && (
                      <Text
                        className='text-[11px] font-medium'
                        style={{ color: colors.destructive }}
                      >
                        {typeof field.state.meta.errors[0] === 'string'
                          ? field.state.meta.errors[0]
                          : (field.state.meta.errors[0] as { message?: string })
                              ?.message}
                      </Text>
                    )}
                  </View>
                )}
              </form.Field>

              <form.Field name='password'>
                {(field) => (
                  <View className='gap-1.5'>
                    <TextInput
                      ref={passwordRef}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChangeText={field.handleChange}
                      placeholder='Password'
                      placeholderTextColor={`${colors.mutedForeground}66`}
                      secureTextEntry
                      autoComplete='new-password'
                      textContentType='newPassword'
                      returnKeyType='go'
                      onSubmitEditing={form.handleSubmit}
                      className='h-11 rounded-[14px] border px-4 text-sm'
                      style={{
                        borderColor: `${colors.border}99`,
                        backgroundColor: `${colors.muted}33`,
                        color: colors.foreground,
                      }}
                    />
                    {field.state.meta.errors.length > 0 && (
                      <Text
                        className='text-[11px] font-medium'
                        style={{ color: colors.destructive }}
                      >
                        {typeof field.state.meta.errors[0] === 'string'
                          ? field.state.meta.errors[0]
                          : (field.state.meta.errors[0] as { message?: string })
                              ?.message}
                      </Text>
                    )}
                  </View>
                )}
              </form.Field>

              <form.Subscribe
                selector={(state) => ({
                  isSubmitting: state.isSubmitting,
                  canSubmit: state.canSubmit,
                })}
              >
                {({ isSubmitting, canSubmit }) => (
                  <Pressable
                    onPress={form.handleSubmit}
                    disabled={
                      !canSubmit || isSubmitting || socialLoading !== null
                    }
                    className='h-11 rounded-[14px] items-center justify-center mt-1'
                    style={{
                      backgroundColor: colors.primary,
                      opacity: !canSubmit || isSubmitting ? 0.6 : 1,
                    }}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator
                        size='small'
                        color={colors.primaryForeground}
                      />
                    ) : (
                      <Text
                        className='text-sm font-semibold'
                        style={{ color: colors.primaryForeground }}
                      >
                        Create account
                      </Text>
                    )}
                  </Pressable>
                )}
              </form.Subscribe>
            </View>

            {/* Footer */}
            <View className='items-center'>
              <Text
                className='text-[13px]'
                style={{ color: colors.mutedForeground }}
              >
                Already have an account?{' '}
                <Link href='/(auth)/sign-in' replace asChild>
                  <Text
                    className='font-semibold'
                    style={{ color: colors.primary }}
                  >
                    Sign in
                  </Text>
                </Link>
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
