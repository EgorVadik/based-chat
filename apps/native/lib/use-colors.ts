import { useAppTheme } from "@/contexts/app-theme-context";
import { colors, type ThemeColors } from "./theme";

export function useColors(): ThemeColors {
  const { isDark } = useAppTheme();
  return isDark ? colors.dark : colors.light;
}
