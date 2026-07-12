// Mock for @expo-google-fonts/space-grotesk and @expo-google-fonts/space-mono
// in test environment. Real packages export a require()'d font asset per
// weight; tests never rasterize text, so a stand-in value per name is enough
// to satisfy the import and useFonts() map shape.

export const SpaceGrotesk_400Regular = 'SpaceGrotesk_400Regular';
export const SpaceGrotesk_500Medium = 'SpaceGrotesk_500Medium';
export const SpaceGrotesk_600SemiBold = 'SpaceGrotesk_600SemiBold';
export const SpaceGrotesk_700Bold = 'SpaceGrotesk_700Bold';

export const SpaceMono_400Regular = 'SpaceMono_400Regular';
export const SpaceMono_700Bold = 'SpaceMono_700Bold';
