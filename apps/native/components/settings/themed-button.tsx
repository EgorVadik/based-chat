import { Pressable, Text, type PressableProps } from 'react-native'

import { useColors } from '@/lib/use-colors'

type ButtonVariant = 'primary' | 'danger' | 'outline' | 'ghost'
type ButtonSize = 'sm' | 'md'

type ThemedButtonProps = PressableProps & {
  variant?: ButtonVariant
  size?: ButtonSize
  children: string
}

export function ThemedButton({
  variant = 'primary',
  size = 'md',
  children,
  disabled,
  ...props
}: ThemedButtonProps) {
  const colors = useColors()

  const sizeStyles = {
    sm: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 12 } as const,
    md: { paddingHorizontal: 16, paddingVertical: 10, fontSize: 13 } as const,
  }

  const getStyles = (pressed: boolean) => {
    const base = {
      borderRadius: 10,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: sizeStyles[size].paddingHorizontal,
      paddingVertical: sizeStyles[size].paddingVertical,
      opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
    }

    switch (variant) {
      case 'primary':
        return {
          ...base,
          backgroundColor: colors.primary,
        }
      case 'danger':
        return {
          ...base,
          backgroundColor: colors.destructive,
        }
      case 'outline':
        return {
          ...base,
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: `${colors.border}CC`,
        }
      case 'ghost':
        return {
          ...base,
          backgroundColor: pressed ? `${colors.muted}40` : 'transparent',
        }
    }
  }

  const getTextColor = () => {
    switch (variant) {
      case 'primary':
        return colors.primaryForeground
      case 'danger':
        return '#f5fafa'
      case 'outline':
        return colors.foreground
      case 'ghost':
        return colors.mutedForeground
    }
  }

  return (
    <Pressable
      disabled={disabled}
      {...props}
      style={({ pressed }) => getStyles(pressed)}
    >
      <Text
        className='font-medium'
        style={{ fontSize: sizeStyles[size].fontSize, color: getTextColor() }}
      >
        {children}
      </Text>
    </Pressable>
  )
}
