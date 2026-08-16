import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { figmaWallet, figmaWalletShared } from './FigmaWalletTheme';

type OnboardingFlowProps = { busy: boolean; error?: string; onSignIn: () => void; onSignUp: () => void };
type Screen = 'intro' | 'welcome' | 'auth';

export function OnboardingFlow({ busy, error, onSignIn, onSignUp }: OnboardingFlowProps) {
  const [screen, setScreen] = useState<Screen>('intro');
  const advance = () => setScreen((current) => current === 'intro' ? 'welcome' : 'auth');
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.statusSpace} />
        <View style={styles.brandRow}><View style={figmaWalletShared.brandMark}><View style={figmaWalletShared.brandMarkCore} /></View><Text style={styles.wordmark}>hidotpay</Text></View>
        {screen === 'intro' ? <View style={styles.hero}>
          <View pointerEvents="none" style={styles.heroOrb}><View style={styles.heroOrbit} /><View style={styles.heroLine} /></View>
          <Text style={styles.kicker}>測試網預覽</Text><Text style={styles.heroTitle}>每一筆資產，{'\n'}都清楚掌握</Text><Text style={styles.heroBody}>以你的帳戶為中心，安全查看測試網資產，並在支援的網路建立專屬充值地址。不得轉入主網資產。</Text>
          <View accessibilityLabel="第 1 頁，共 2 頁" accessibilityRole="progressbar" style={styles.dots}><View style={[styles.dot, styles.dotActive]} /><View style={styles.dot} /></View>
          <Pressable accessibilityLabel="繼續引導" accessibilityRole="button" onPress={advance} style={({ pressed }) => [figmaWalletShared.button, pressed && figmaWalletShared.pressed]}><Text style={figmaWalletShared.buttonText}>繼續</Text></Pressable>
          <Pressable accessibilityLabel="略過引導" accessibilityRole="button" onPress={() => setScreen('auth')} style={({ pressed }) => [styles.textButton, pressed && figmaWalletShared.pressed]}><Text style={styles.textButtonText}>略過</Text></Pressable>
        </View> : null}
        {screen === 'welcome' ? <View style={styles.hero}>
          <View style={styles.walletPreview}><Text style={styles.previewOverline}>hidotpay wallet</Text><Text style={styles.previewAmount}>你的資產</Text><View style={styles.previewRule} /><Text style={styles.previewCaption}>登入後會顯示已驗證的真實資料</Text></View>
          <Text style={styles.heroTitle}>安全，{'\n'}由第一步開始</Text><Text style={styles.heroBody}>我們不會在前台保存你的密碼。登入與建立帳戶會交由安全驗證流程完成。</Text>
          <View accessibilityLabel="第 2 頁，共 2 頁" accessibilityRole="progressbar" style={styles.dots}><View style={styles.dot} /><View style={[styles.dot, styles.dotActive]} /></View>
          <Pressable accessibilityLabel="開始使用" accessibilityRole="button" onPress={advance} style={({ pressed }) => [figmaWalletShared.button, pressed && figmaWalletShared.pressed]}><Text style={figmaWalletShared.buttonText}>開始使用</Text></Pressable>
        </View> : null}
        {screen === 'auth' ? <View style={styles.authCard}>
          <Text style={styles.authTitle}>歡迎使用</Text><Text style={styles.authBody}>這是測試網預覽。登入後可配置多鏈充值地址；不得轉入主網資產，也不能保管真實資金。</Text>
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityLabel="登入 hidotpay" accessibilityRole="button" disabled={busy} onPress={onSignIn} style={({ pressed }) => [figmaWalletShared.button, busy && styles.disabled, pressed && figmaWalletShared.pressed]}>{busy ? <ActivityIndicator color={figmaWallet.colors.black} /> : <Text style={figmaWalletShared.buttonText}>登入</Text>}</Pressable>
          <Pressable accessibilityLabel="建立 hidotpay 帳戶" accessibilityRole="button" disabled={busy} onPress={onSignUp} style={({ pressed }) => [styles.outlineButton, busy && styles.disabled, pressed && figmaWalletShared.pressed]}><Text style={styles.outlineButtonText}>建立帳戶</Text></Pressable>
          <Text style={styles.securityNote}>帳密和驗證碼只會在 hidotpay 的安全登入流程中處理。</Text>
        </View> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: figmaWallet.colors.canvas, flex: 1, minHeight: '100%' }, content: { alignSelf: 'center', flexGrow: 1, maxWidth: 480, padding: 24, paddingBottom: 40, width: '100%' }, statusSpace: { height: 24 }, brandRow: { alignItems: 'center', flexDirection: 'row', gap: 10 }, wordmark: { color: figmaWallet.colors.black, fontSize: 20, fontWeight: '800', letterSpacing: -0.7 }, hero: { flex: 1, justifyContent: 'center', minHeight: 620, paddingVertical: 36 }, heroOrb: { alignItems: 'center', borderColor: '#EDEDED', borderRadius: 140, borderWidth: 1, height: 280, justifyContent: 'center', marginBottom: 46, overflow: 'hidden', width: 280 }, heroOrbit: { borderColor: '#E7E7E7', borderRadius: 90, borderWidth: 1, height: 180, width: 180 }, heroLine: { backgroundColor: '#E7E7E7', height: 1, position: 'absolute', width: '100%' }, kicker: { color: figmaWallet.colors.blue, fontSize: 13, fontWeight: '800', letterSpacing: 1.1, marginBottom: 10 }, heroTitle: { color: figmaWallet.colors.black, fontSize: 35, fontWeight: '800', letterSpacing: -1.6, lineHeight: 42 }, heroBody: { color: figmaWallet.colors.muted, fontSize: 16, lineHeight: 24, marginTop: 14, maxWidth: 336 }, dots: { flexDirection: 'row', gap: 8, marginTop: 28 }, dot: { backgroundColor: '#DEDEDE', borderRadius: 5, height: 9, width: 9 }, dotActive: { backgroundColor: figmaWallet.colors.black, width: 25 }, textButton: { alignItems: 'center', justifyContent: 'center', marginTop: 12, minHeight: 44 }, textButtonText: { color: figmaWallet.colors.blue, fontSize: 15, fontWeight: '800' }, walletPreview: { backgroundColor: figmaWallet.colors.blue, borderRadius: 24, marginBottom: 42, minHeight: 206, overflow: 'hidden', padding: 24 }, previewOverline: { color: '#D9D4FF', fontSize: 12, fontWeight: '800', letterSpacing: 1.1 }, previewAmount: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', letterSpacing: -1.1, marginTop: 25 }, previewRule: { backgroundColor: '#897BFF', height: 1, marginTop: 23, width: '100%' }, previewCaption: { color: '#EEEFFF', fontSize: 13, lineHeight: 19, marginTop: 14 }, authCard: { flex: 1, justifyContent: 'center', minHeight: 620, paddingBottom: 28, paddingTop: 58 }, authTitle: { color: figmaWallet.colors.black, fontSize: 32, fontWeight: '800', letterSpacing: -1.3 }, authBody: { color: figmaWallet.colors.muted, fontSize: 16, lineHeight: 24, marginBottom: 34, marginTop: 10 }, error: { color: '#B42318', fontSize: 14, lineHeight: 20, marginBottom: 16 }, outlineButton: { alignItems: 'center', borderColor: figmaWallet.colors.border, borderRadius: figmaWallet.radius.control, borderWidth: 1, justifyContent: 'center', marginTop: 12, minHeight: 56, paddingHorizontal: 20 }, outlineButtonText: { color: figmaWallet.colors.black, fontSize: 16, fontWeight: '800' }, securityNote: { color: figmaWallet.colors.muted, fontSize: 12, lineHeight: 18, marginTop: 16, textAlign: 'center' }, disabled: { opacity: 0.5 },
});
