import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

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
  return (
    <View style={styles.page}>
      <View style={styles.glow} />
      <View style={styles.card}>
        <View style={styles.brandRow}>
          <View style={styles.mark}>
            <View style={styles.markDot} />
          </View>
          <Text style={styles.brand}>hidotpay</Text>
        </View>

        <Text style={styles.eyebrow}>ACCOUNT ACCESS</Text>
        <Text style={styles.title}>
          {authenticated ? '已安全登入' : '你的支付帳戶，從安全登入開始'}
        </Text>
        <Text style={styles.body}>
          {authenticated
            ? '目前登入帳戶'
            : '登入或建立帳戶會在 hidotpay 的安全帳戶頁面完成。'}
        </Text>

        {authenticated ? (
          <View style={styles.profile}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(username ?? 'U').slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.profileText}>
              <Text style={styles.username} numberOfLines={1}>
                {username ?? '使用者'}
              </Text>
              <Text style={styles.status}>帳戶已驗證</Text>
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {children}

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={authenticated ? onSignOut : onSignIn}
          style={({ pressed }) => [styles.button, busy && styles.buttonDisabled, pressed && styles.buttonPressed]}
        >
          {busy ? (
            <ActivityIndicator color="#07111f" />
          ) : (
            <Text style={styles.buttonText}>{authenticated ? '登出' : '登入或註冊'}</Text>
          )}
        </Pressable>

        {!authenticated ? <Text style={styles.note}>不會在此頁面輸入或保存登入資料。</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center',
    backgroundColor: '#07111f',
    flex: 1,
    justifyContent: 'center',
    minHeight: '100%',
    overflow: 'hidden',
    padding: 24,
  },
  glow: {
    backgroundColor: '#13c4ad',
    borderRadius: 999,
    height: 360,
    opacity: 0.16,
    position: 'absolute',
    right: -155,
    top: -160,
    transform: [{ rotate: '18deg' }],
    width: 360,
  },
  card: {
    backgroundColor: '#0d1a2c',
    borderColor: '#1e3551',
    borderRadius: 24,
    borderWidth: 1,
    maxWidth: 440,
    padding: 32,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 34,
    width: '100%',
  },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 46 },
  mark: {
    alignItems: 'center',
    backgroundColor: '#13c4ad',
    borderRadius: 10,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  markDot: { backgroundColor: '#07111f', borderRadius: 4, height: 8, width: 8 },
  brand: { color: '#f4f8fb', fontSize: 21, fontWeight: '700', letterSpacing: -0.6 },
  eyebrow: { color: '#7ce4d6', fontSize: 11, fontWeight: '700', letterSpacing: 1.6, marginBottom: 12 },
  title: { color: '#f4f8fb', fontSize: 30, fontWeight: '700', letterSpacing: -1, lineHeight: 38 },
  body: { color: '#aebfd2', fontSize: 16, lineHeight: 24, marginTop: 14 },
  profile: {
    alignItems: 'center',
    backgroundColor: '#10243b',
    borderColor: '#1c3858',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 26,
    padding: 15,
  },
  avatar: { alignItems: 'center', backgroundColor: '#13c4ad', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  avatarText: { color: '#07111f', fontSize: 15, fontWeight: '800' },
  profileText: { flex: 1, marginLeft: 12, minWidth: 0 },
  username: { color: '#f4f8fb', fontSize: 16, fontWeight: '700' },
  status: { color: '#7ce4d6', fontSize: 13, marginTop: 2 },
  error: { color: '#ffb4a8', fontSize: 14, lineHeight: 20, marginTop: 20 },
  button: {
    alignItems: 'center',
    backgroundColor: '#13c4ad',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 26,
    minHeight: 52,
    paddingHorizontal: 18,
  },
  buttonDisabled: { opacity: 0.65 },
  buttonPressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  buttonText: { color: '#07111f', fontSize: 16, fontWeight: '800' },
  note: { color: '#7890a9', fontSize: 13, lineHeight: 19, marginTop: 16, textAlign: 'center' },
});
