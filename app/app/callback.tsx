import { StyleSheet, Text, View } from 'react-native';

// Fallback required by Expo Router. Web and Android handle their own callbacks.
export default function FallbackCallbackScreen() {
  return (
    <View style={styles.page}>
      <Text style={styles.text}>正在返回 hidotpay。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', backgroundColor: '#07111f', flex: 1, justifyContent: 'center', padding: 24 },
  text: { color: '#f4f8fb', fontSize: 16, textAlign: 'center' },
});
