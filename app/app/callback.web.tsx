import { useHandleSignInCallback } from '@logto/react';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function WebCallbackScreen() {
  const { error, isLoading } = useHandleSignInCallback(() => {
    router.replace('..');
  });

  return (
    <View style={styles.page}>
      {isLoading ? <ActivityIndicator color="#13c4ad" /> : null}
      <Text style={styles.text}>{error ? '登入沒有完成，請回到首頁重試。' : '正在安全確認登入…'}</Text>
      {error ? <Text style={styles.detail}>{error.message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', backgroundColor: '#07111f', flex: 1, gap: 16, justifyContent: 'center', padding: 24 },
  text: { color: '#f4f8fb', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  detail: { color: '#aebfd2', fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
