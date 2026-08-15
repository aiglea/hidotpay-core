import { StyleSheet } from 'react-native';

export const figmaWallet = {
  colors: { acid: '#D8FF00', black: '#171717', blue: '#5B42FF', border: '#E5E5E5', canvas: '#FFFFFF', muted: '#787878', soft: '#F8F8F8', violetSoft: '#F0EDFF' },
  radius: { card: 18, control: 12, pill: 999 },
};

export const figmaWalletShared = StyleSheet.create({
  brandMark: { alignItems: 'center', backgroundColor: figmaWallet.colors.acid, borderRadius: 12, height: 42, justifyContent: 'center', overflow: 'hidden', width: 42 },
  brandMarkCore: { backgroundColor: figmaWallet.colors.blue, borderRadius: 5, height: 20, transform: [{ rotate: '-10deg' }], width: 27 },
  button: { alignItems: 'center', backgroundColor: figmaWallet.colors.acid, borderRadius: figmaWallet.radius.control, justifyContent: 'center', minHeight: 56, paddingHorizontal: 20 },
  buttonText: { color: figmaWallet.colors.black, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
});
