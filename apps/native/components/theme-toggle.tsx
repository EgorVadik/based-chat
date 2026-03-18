import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable } from "react-native";
import Animated, { FadeOut, ZoomIn } from "react-native-reanimated";
import { withUniwind } from "uniwind";

import { useAppTheme } from "@/contexts/app-theme-context";
import { useColors } from "@/lib/use-colors";

const StyledIonicons = withUniwind(Ionicons);

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { toggleTheme, isLight } = useAppTheme();
  const colors = useColors();

  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleTheme();
      }}
      className="items-center justify-center rounded-xl"
      style={({ pressed }) => ({
        width: compact ? 32 : 36,
        height: compact ? 32 : 36,
        backgroundColor: pressed ? `${colors.accent}B3` : 'transparent',
      })}
    >
      {isLight ? (
        <Animated.View key="moon" entering={ZoomIn.duration(250)} exiting={FadeOut.duration(150)}>
          <StyledIonicons name="moon" size={compact ? 16 : 18} className="text-foreground" />
        </Animated.View>
      ) : (
        <Animated.View key="sun" entering={ZoomIn.duration(250)} exiting={FadeOut.duration(150)}>
          <StyledIonicons name="sunny" size={compact ? 16 : 18} className="text-foreground" />
        </Animated.View>
      )}
    </Pressable>
  );
}
