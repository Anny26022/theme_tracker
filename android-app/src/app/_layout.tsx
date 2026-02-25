import { Stack } from "expo-router";
import { ThemeProvider } from "../contexts/ThemeContext";
import { PriceProvider } from "../contexts/PriceContext";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <PriceProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </PriceProvider>
    </ThemeProvider>
  );
}
