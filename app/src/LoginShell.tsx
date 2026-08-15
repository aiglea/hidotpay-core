import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type LoginShellProps = {
  authenticated: boolean;
  busy: boolean;
  username?: string;
  error?: string;
  onSignIn: () => void;
  onSignOut: () => void;
  children?: ReactNode;
};

export function LoginShell({
  authenticated,
  busy,
  username,
  error,
  onSignIn,
  onSignOut,
  children,
}: LoginShellProps) {
  if (!authenticated) {
    return (
      <View style={styles.page}>
        <ScrollView contentContainerStyle={styles.onboardingFrame} showsVerticalScrollIndicator={false} style={styles.onboardingScroll}>
          <Pressable
            accessibilityLabel="略過引導並登入"
            accessibilityRole="button"
            disabled={busy}
            onPress={onSignIn}
            style={({ pressed }) => [styles.skipButton, busy && styles.buttonDisabled, pressed && styles.buttonPressed]}
          >
            <Text style={styles.skipText}>略過</Text>
          </Pressable>

          <View style={styles.walletScene}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.gridOrb}>
              <View style={styles.gridRing} />
              <View style={styles.gridLineHorizontal} />
              <View style={styles.gridLineVertical} />
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.brandRow}>
                <View style={styles.mark}>
                  <View style={styles.markDot} />
                </View>
                <Text style={styles.brand}>hidotpay</Text>
              </View>
              <Text style={styles.summaryEyebrow}>你的錢包</Text>
              <Text style={styles.summaryTitle}>安全錢包</Text>
              <Text style={styles.summaryBody}>登入後顯示可用資產</Text>
              <View style={styles.actionRow}>
                <Pressable
                  accessibilityLabel="轉帳功能需登入後使用"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: true }}
                  disabled
                  style={styles.actionPill}
                >
                  <Text style={styles.actionPillText}>轉帳</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="收款功能需登入後使用"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: true }}
                  disabled
                  style={styles.actionPill}
                >
                  <Text style={styles.actionPillText}>收款</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.onboardingCard}>
            <Text style={styles.onboardingEyebrow}>hidotpay</Text>
            <Text style={styles.onboardingTitle}>一個更安心的開始</Text>
            <Text style={styles.onboardingBody}>使用安全帳戶登入後，即可查看你的可用資產與錢包服務。</Text>
            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            {children}

            <View accessibilityLabel="第 1 頁，共 3 頁" accessibilityRole="progressbar" style={styles.dots}>
              <View style={[styles.dot, styles.dotActive]} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
            <Pressable
              accessibilityLabel="開始使用並登入"
              accessibilityRole="button"
              disabled={busy}
              onPress={onSignIn}
              style={({ pressed }) => [styles.primaryButton, busy && styles.buttonDisabled, pressed && styles.buttonPressed]}
            >
              {busy ? <ActivityIndicator color="#111111" /> : <Text style={styles.primaryButtonText}>開始使用</Text>}
            </Pressable>
            <Text style={styles.note}>登入會在 hidotpay 的安全帳戶頁面完成。</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.authCard}>
        <View style={styles.brandRow}>
          <View style={styles.mark}>
            <View style={styles.markDot} />
          </View>
          <Text style={styles.brand}>hidotpay</Text>
        </View>
        <Text style={styles.summaryEyebrow}>帳戶狀態</Text>
        <Text style={styles.authTitle}>已安全登入</Text>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(username ?? 'U').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.profileText}>
            <Text numberOfLines={1} style={styles.username}>{username ?? '使用者'}</Text>
            <Text style={styles.status}>帳戶已驗證</Text>
          </View>
        </View>
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        {children}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onSignOut}
          style={({ pressed }) => [styles.secondaryButton, busy && styles.buttonDisabled, pressed && styles.buttonPressed]}
        >
          {busy ? <ActivityIndicator color="#111111" /> : <Text style={styles.primaryButtonText}>登出</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    flex: 1,
    minHeight: '100%',
    overflow: 'hidden',
  },
  onboardingScroll: { flex: 1, width: '100%' },
  onboardingFrame: { alignSelf: 'center', flexGrow: 1, maxWidth: 480, overflow: 'hidden', paddingTop: 20, width: '100%' },
  skipButton: { alignSelf: 'flex-start', borderRadius: 999, marginLeft: 24, paddingHorizontal: 12, paddingVertical: 8 },
  skipText: { color: '#111111', fontSize: 14, fontWeight: '700' },
  walletScene: { alignItems: 'center', height: 330, justifyContent: 'center', marginHorizontal: 24, position: 'relative' },
  gridOrb: {
    borderColor: '#D7D7D7',
    borderRadius: 150,
    borderWidth: 1,
    height: 300,
    overflow: 'hidden',
    position: 'absolute',
    right: -96,
    top: 8,
    width: 300,
  },
  gridRing: { borderColor: '#DFDFDF', borderRadius: 112, borderWidth: 1, height: 224, left: 38, position: 'absolute', top: 38, width: 224 },
  gridLineHorizontal: { borderColor: '#E1E1E1', borderTopWidth: 1, left: 0, position: 'absolute', top: 149, width: '100%' },
  gridLineVertical: { borderColor: '#E1E1E1', borderLeftWidth: 1, height: '100%', left: 149, position: 'absolute', top: 0 },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#111111',
    borderRadius: 22,
    borderWidth: 1,
    padding: 22,
    boxShadow: '0px 8px 16px rgba(17, 17, 17, 0.08)',
    width: '100%',
  },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  mark: { alignItems: 'center', backgroundColor: '#111111', borderRadius: 9, height: 27, justifyContent: 'center', width: 27 },
  markDot: { backgroundColor: '#D7FF00', borderRadius: 4, height: 8, width: 8 },
  brand: { color: '#111111', fontSize: 20, fontWeight: '800', letterSpacing: -0.6 },
  summaryEyebrow: { color: '#737373', fontSize: 12, fontWeight: '700', letterSpacing: 1.1, marginTop: 26 },
  summaryTitle: { color: '#111111', fontSize: 28, fontWeight: '800', letterSpacing: -1, lineHeight: 35, marginTop: 5 },
  summaryBody: { color: '#5E5E5E', fontSize: 15, lineHeight: 22, marginTop: 5 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  actionPill: { alignItems: 'center', backgroundColor: '#D7FF00', borderRadius: 999, flex: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  actionPillText: { color: '#111111', fontSize: 15, fontWeight: '800' },
  onboardingCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    flex: 1,
    minHeight: 306,
    padding: 26,
  },
  onboardingEyebrow: { color: '#737373', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  onboardingTitle: { color: '#111111', fontSize: 28, fontWeight: '800', letterSpacing: -1, lineHeight: 35, marginTop: 8 },
  onboardingBody: { color: '#5E5E5E', fontSize: 16, lineHeight: 24, marginTop: 10 },
  dots: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 20 },
  dot: { backgroundColor: '#D6D6D6', borderRadius: 4, height: 8, width: 8 },
  dotActive: { backgroundColor: '#111111', width: 22 },
  primaryButton: { alignItems: 'center', backgroundColor: '#D7FF00', borderRadius: 999, justifyContent: 'center', marginTop: 20, minHeight: 54, paddingHorizontal: 20 },
  secondaryButton: { alignItems: 'center', backgroundColor: '#D7FF00', borderRadius: 999, justifyContent: 'center', marginTop: 24, minHeight: 52, paddingHorizontal: 20 },
  buttonDisabled: { opacity: 0.58 },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: '#111111', fontSize: 16, fontWeight: '800' },
  note: { color: '#737373', fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: 'center' },
  authCard: { backgroundColor: '#FFFFFF', borderColor: '#111111', borderRadius: 24, borderWidth: 1, margin: 24, maxWidth: 440, padding: 28, width: '100%' },
  authTitle: { color: '#111111', fontSize: 28, fontWeight: '800', letterSpacing: -1, lineHeight: 35, marginTop: 5 },
  profile: { alignItems: 'center', backgroundColor: '#F5F5F5', borderColor: '#E1E1E1', borderRadius: 16, borderWidth: 1, flexDirection: 'row', marginTop: 22, padding: 15 },
  avatar: { alignItems: 'center', backgroundColor: '#D7FF00', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  avatarText: { color: '#111111', fontSize: 15, fontWeight: '800' },
  profileText: { flex: 1, marginLeft: 12, minWidth: 0 },
  username: { color: '#111111', fontSize: 16, fontWeight: '700' },
  status: { color: '#5E5E5E', fontSize: 13, marginTop: 2 },
  error: { color: '#B42318', fontSize: 14, lineHeight: 20, marginTop: 16 },
});
