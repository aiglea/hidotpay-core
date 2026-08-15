import { StyleSheet, Text, View } from 'react-native';

// Fallback required by Expo Router. Web and Android use their platform routes.
export default function FallbackHomeScreen() {
  return (
    <View style={styles.page}>
      <Text style={styles.text}>hidotpay 錢包目前支援網頁與 Android。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', backgroundColor: '#07111f', flex: 1, justifyContent: 'center', padding: 24 },
  text: { color: '#f4f8fb', fontSize: 16, textAlign: 'center' },
});
