import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { allocateDepositAddress, getWalletSnapshot, submitInternalTransfer, type DepositAddress, type WalletSnapshot } from './wallet-api';

type WalletHomeProps = {
  apiBaseUrl: string;
  getAccessToken: () => Promise<string | undefined>;
  onSignOut: () => void;
  username?: string;
};

type RequestStatus = 'idle' | 'loading' | 'ready' | 'error';

function messageFrom(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

function formatUsdt(atoms: string): string {
  if (!/^\d+$/.test(atoms)) return atoms;
  const value = BigInt(atoms);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole.toLocaleString()}.${fraction}` : whole.toLocaleString();
}

function usdtToAtoms(value: string): string | undefined {
  if (!/^\d+(\.\d{0,6})?$/.test(value.trim())) return undefined;
  const [whole, fraction = ''] = value.trim().split('.');
  const atoms = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  return atoms > 0n ? atoms.toString() : undefined;
}

function shortIdentifier(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 9)}…${value.slice(-7)}`;
}

export function WalletHome({ apiBaseUrl, getAccessToken, onSignOut, username }: WalletHomeProps) {
  const [wallet, setWallet] = useState<WalletSnapshot>();
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [message, setMessage] = useState<string>();
  const [network, setNetwork] = useState<'ethereum' | 'tron'>('ethereum');
  const [depositAddress, setDepositAddress] = useState<DepositAddress>();
  const [recipientWalletId, setRecipientWalletId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferStatus, setTransferStatus] = useState<RequestStatus>('idle');
  const [transferMessage, setTransferMessage] = useState<string>();
  const transferIdempotencyKey = useRef<string | undefined>(undefined);
  const configured = Boolean(apiBaseUrl.trim());

  const fetchToken = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('登入憑證尚未就緒，請重新登入後再試。');
    return accessToken;
  }, [getAccessToken]);

  const refresh = useCallback(async () => {
    if (!configured) {
      setStatus('idle');
      return;
    }
    setMessage(undefined);
    setStatus('loading');
    try {
      const snapshot = await getWalletSnapshot({ accessToken: await fetchToken(), apiBaseUrl });
      setWallet(snapshot);
      setStatus('ready');
    } catch (reason) {
      setWallet(undefined);
      setMessage(messageFrom(reason, '未能讀取錢包資料，請稍後再試。'));
      setStatus('error');
    }
  }, [apiBaseUrl, configured, fetchToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedBalance = useMemo(
    () => wallet?.balances.find((balance) => balance.assetCode === 'USDT'),
    [wallet],
  );

  const requestDepositAddress = async () => {
    setMessage(undefined);
    if (!configured) return;
    setStatus('loading');
    try {
      const address = await allocateDepositAddress({ accessToken: await fetchToken(), apiBaseUrl, network });
      setDepositAddress(address);
      setStatus('ready');
    } catch (reason) {
      setMessage(messageFrom(reason, '未能建立充值地址，請稍後再試。'));
      setStatus('error');
    }
  };

  const sendInternalTransfer = async () => {
    const amountAtoms = usdtToAtoms(transferAmount);
    if (!amountAtoms) {
      setTransferStatus('error');
      setTransferMessage('請輸入大於 0、最多 6 位小數的 USDT 金額。');
      return;
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recipientWalletId.trim())) {
      setTransferStatus('error');
      setTransferMessage('請輸入正確的收款錢包 ID。');
      return;
    }
    if (!configured) return;

    const idempotencyKey = transferIdempotencyKey.current ?? `wallet-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    transferIdempotencyKey.current = idempotencyKey;
    setTransferMessage(undefined);
    setTransferStatus('loading');
    try {
      const result = await submitInternalTransfer({
        accessToken: await fetchToken(),
        amountAtoms,
        apiBaseUrl,
        assetCode: 'USDT',
        idempotencyKey,
        recipientWalletId: recipientWalletId.trim(),
      });
      setTransferAmount('');
      transferIdempotencyKey.current = undefined;
      setTransferStatus('ready');
      setTransferMessage(`站內轉帳已送出，交易編號 ${shortIdentifier(result.transferId)}。`);
      void refresh();
    } catch (reason) {
      setTransferStatus('error');
      setTransferMessage(messageFrom(reason, '站內轉帳沒有完成，請稍後再試。'));
    }
  };

  return (
    <View style={styles.page}>
      <View pointerEvents="none" style={styles.halo} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} style={styles.scrollView}>
        <View style={styles.topbar}>
          <View style={styles.brandRow}>
            <View style={styles.mark}><View style={styles.markCore} /></View>
            <Text style={styles.brand}>hidotpay</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onSignOut} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
            <Text style={styles.signOutText}>登出</Text>
          </Pressable>
        </View>

        <View style={styles.welcomeRow}>
          <View>
            <Text style={styles.eyebrow}>你的錢包</Text>
            <Text style={styles.heading}>您好，{username ?? '使用者'}</Text>
          </View>
          <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>帳本保護中</Text></View>
        </View>

        {!configured ? (
          <View style={styles.protectedCard}>
            <Text style={styles.protectedTitle}>錢包服務尚未啟用</Text>
            <Text style={styles.protectedBody}>你已完成登入。為保護資產，系統不會在沒有已驗證 API 與權限設定時顯示測試數字或允許轉帳。</Text>
          </View>
        ) : null}

        <View style={styles.balanceCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>可用資產</Text>
            <Pressable accessibilityRole="button" disabled={status === 'loading'} onPress={() => void refresh()} style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}>
              <Text style={styles.refreshText}>{status === 'loading' ? '更新中' : '更新餘額'}</Text>
            </Pressable>
          </View>
          {status === 'loading' ? <ActivityIndicator color="#0b675e" style={styles.loader} /> : null}
          {status === 'error' ? <Text style={styles.errorText}>{message}</Text> : null}
          {status !== 'loading' && status !== 'error' && configured && !wallet?.balances.length ? (
            <Text style={styles.emptyText}>尚無已入帳資產。取得充值地址後，請只轉入已啟用網路與資產。</Text>
          ) : null}
          {wallet?.balances.map((balance) => (
            <View key={balance.assetCode} style={styles.assetRow}>
              <View><Text style={styles.assetCode}>{balance.assetCode}</Text><Text style={styles.assetNetwork}>可用餘額</Text></View>
              <Text style={styles.assetAmount}>{balance.assetCode === 'USDT' ? formatUsdt(balance.balanceAtoms) : balance.balanceAtoms}</Text>
            </View>
          ))}
          {!configured ? <Text style={styles.emptyText}>尚未連接受保護的錢包 API。</Text> : null}
        </View>

        <Text style={styles.sectionTitle}>資金操作</Text>
        <View style={styles.actionGrid}>
          <View style={styles.actionCard}>
            <Text style={styles.actionTitle}>充值地址</Text>
            <Text style={styles.actionBody}>每個帳戶、每條網路都有獨立地址。建立後才會顯示。</Text>
            <View style={styles.networkRow}>
              {(['ethereum', 'tron'] as const).map((item) => (
                <Pressable key={item} accessibilityRole="button" onPress={() => setNetwork(item)} style={[styles.networkChoice, network === item && styles.networkChoiceSelected]}>
                  <Text style={[styles.networkText, network === item && styles.networkTextSelected]}>{item === 'ethereum' ? 'Ethereum' : 'TRON'}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" disabled={!configured || status === 'loading'} onPress={() => void requestDepositAddress()} style={({ pressed }) => [styles.primaryButton, (!configured || status === 'loading') && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>{status === 'loading' ? '處理中' : '取得地址'}</Text>
            </Pressable>
            {depositAddress ? <View style={styles.addressBox}><Text style={styles.addressLabel}>{depositAddress.network.toUpperCase()} 地址</Text><Text selectable style={styles.addressText}>{depositAddress.address}</Text><Text style={styles.addressHint}>請確認網路一致；轉錯網路可能無法找回。</Text></View> : null}
          </View>

          <View style={styles.actionCard}>
            <Text style={styles.actionTitle}>站內轉帳</Text>
            <Text style={styles.actionBody}>使用 hidotpay 錢包 ID，系統帳本內轉移，不會產生鏈上 gas。</Text>
            <Text style={styles.inputLabel}>收款錢包 ID</Text>
            <TextInput accessibilityLabel="收款錢包 ID" autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { transferIdempotencyKey.current = undefined; setRecipientWalletId(value); }} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" placeholderTextColor="#688086" style={styles.input} value={recipientWalletId} />
            <Text style={styles.inputLabel}>金額（USDT）</Text>
            <TextInput accessibilityLabel="轉帳金額" inputMode="decimal" keyboardType="decimal-pad" onChangeText={(value) => { transferIdempotencyKey.current = undefined; setTransferAmount(value); }} placeholder="0.00" placeholderTextColor="#688086" style={styles.input} value={transferAmount} />
            <Text style={styles.availableHint}>目前可用：{selectedBalance ? `${formatUsdt(selectedBalance.balanceAtoms)} USDT` : '尚未讀取'}</Text>
            <Pressable accessibilityRole="button" disabled={!configured || transferStatus === 'loading'} onPress={() => void sendInternalTransfer()} style={({ pressed }) => [styles.primaryButton, (!configured || transferStatus === 'loading') && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>{transferStatus === 'loading' ? '提交中' : '確認站內轉帳'}</Text>
            </Pressable>
            {transferMessage ? <Text style={transferStatus === 'error' ? styles.errorText : styles.successText}>{transferMessage}</Text> : null}
          </View>
        </View>

        <View style={styles.historyCard}>
          <Text style={styles.actionTitle}>交易紀錄</Text>
          <Text style={styles.actionBody}>交易紀錄會以帳本確認結果為準。使用者專屬唯讀紀錄 API 尚未啟用，因此此處不會顯示推測或假資料。</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#f5f7f4', flex: 1 },
  halo: { backgroundColor: '#96e1d6', borderRadius: 999, height: 420, opacity: 0.45, position: 'absolute', right: -180, top: -250, width: 420 },
  scrollView: { flex: 1 },
  scroll: { gap: 22, marginHorizontal: 'auto', maxWidth: 920, padding: 20, paddingBottom: 48, width: '100%' },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 46 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  mark: { alignItems: 'center', backgroundColor: '#0b675e', borderRadius: 11, height: 32, justifyContent: 'center', width: 32 },
  markCore: { backgroundColor: '#d7fbf5', borderRadius: 4, height: 10, transform: [{ rotate: '45deg' }], width: 10 },
  brand: { color: '#17312e', fontSize: 21, fontWeight: '800', letterSpacing: -0.7 },
  signOut: { borderColor: '#c8d3d0', borderRadius: 10, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 9 },
  signOutText: { color: '#33504c', fontSize: 14, fontWeight: '700' },
  welcomeRow: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  eyebrow: { color: '#0b675e', fontSize: 12, fontWeight: '800', letterSpacing: 1.3, marginBottom: 7 },
  heading: { color: '#17312e', fontSize: 30, fontWeight: '800', letterSpacing: -1.1 },
  liveBadge: { alignItems: 'center', backgroundColor: '#e0f4ed', borderRadius: 999, flexDirection: 'row', gap: 7, paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { backgroundColor: '#0b675e', borderRadius: 999, height: 7, width: 7 },
  liveText: { color: '#205b53', fontSize: 12, fontWeight: '700' },
  protectedCard: { backgroundColor: '#fff8e7', borderColor: '#ebd6a1', borderRadius: 16, borderWidth: 1, gap: 7, padding: 18 },
  protectedTitle: { color: '#735600', fontSize: 16, fontWeight: '800' },
  protectedBody: { color: '#5c4b1b', fontSize: 14, lineHeight: 21 },
  balanceCard: { backgroundColor: '#113a35', borderRadius: 22, gap: 16, overflow: 'hidden', padding: 22 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardLabel: { color: '#c6eae4', fontSize: 14, fontWeight: '700' },
  refreshButton: { borderColor: '#5a887f', borderRadius: 9, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 7 },
  refreshText: { color: '#e0f8f3', fontSize: 12, fontWeight: '700' },
  loader: { alignSelf: 'flex-start', marginVertical: 12 },
  assetRow: { alignItems: 'center', borderTopColor: '#28574f', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16 },
  assetCode: { color: '#fbfffd', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  assetNetwork: { color: '#a3c9c1', fontSize: 12, marginTop: 3 },
  assetAmount: { color: '#fbfffd', fontSize: 24, fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: -0.7, maxWidth: '55%', textAlign: 'right' },
  emptyText: { color: '#b9d8d1', fontSize: 14, lineHeight: 21 },
  errorText: { color: '#ffc5b8', fontSize: 13, lineHeight: 20, marginTop: 4 },
  successText: { color: '#0a675c', fontSize: 13, fontWeight: '700', lineHeight: 20, marginTop: 12 },
  sectionTitle: { color: '#17312e', fontSize: 18, fontWeight: '800', letterSpacing: -0.4, marginTop: 6 },
  actionGrid: { gap: 16 },
  actionCard: { backgroundColor: '#ffffff', borderColor: '#dbe3e0', borderRadius: 18, borderWidth: 1, gap: 12, padding: 18 },
  actionTitle: { color: '#1a312e', fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  actionBody: { color: '#55706b', fontSize: 14, lineHeight: 21 },
  networkRow: { flexDirection: 'row', gap: 9 },
  networkChoice: { borderColor: '#d1ddda', borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  networkChoiceSelected: { backgroundColor: '#e0f4ed', borderColor: '#0b675e' },
  networkText: { color: '#58716d', fontSize: 13, fontWeight: '700' },
  networkTextSelected: { color: '#0b675e' },
  primaryButton: { alignItems: 'center', backgroundColor: '#0b675e', borderRadius: 11, justifyContent: 'center', minHeight: 46, paddingHorizontal: 14 },
  primaryButtonText: { color: '#f5fffc', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  addressBox: { backgroundColor: '#edf6f3', borderColor: '#d1e4df', borderRadius: 10, borderWidth: 1, gap: 6, marginTop: 2, padding: 12 },
  addressLabel: { color: '#39746b', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  addressText: { color: '#17312e', fontFamily: 'monospace', fontSize: 13, lineHeight: 19 },
  addressHint: { color: '#5a746f', fontSize: 12, lineHeight: 18 },
  inputLabel: { color: '#47635e', fontSize: 12, fontWeight: '800', marginTop: 2 },
  input: { backgroundColor: '#f7faf9', borderColor: '#d7e2df', borderRadius: 10, borderWidth: 1, color: '#17312e', fontSize: 15, minHeight: 46, paddingHorizontal: 12 },
  availableHint: { color: '#65807b', fontSize: 12, fontVariant: ['tabular-nums'] },
  historyCard: { backgroundColor: '#edf1ef', borderColor: '#d9e2df', borderRadius: 16, borderWidth: 1, gap: 8, padding: 18 },
});
