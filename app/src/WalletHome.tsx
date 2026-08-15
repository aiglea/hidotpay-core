import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { figmaWallet, figmaWalletShared } from './FigmaWalletTheme';
import { isInvalidAuthGrant } from './auth-session';
import { allocateDepositAddress, getWalletSnapshot, getWalletTransactions, submitInternalTransfer, type DepositAddress, type WalletSnapshot, type WalletTransaction } from './wallet-api';

type WalletHomeProps = { apiBaseUrl: string; getAccessToken: () => Promise<string | undefined>; onSignOut: () => void; username?: string };
type RequestStatus = 'idle' | 'loading' | 'ready' | 'error';
type Screen = 'home' | 'topup' | 'topup-confirmation' | 'history' | 'send' | 'send-confirm' | 'send-done';
type Network = 'ethereum' | 'tron';

const WALLET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function messageFrom(reason: unknown, fallback: string): string { return reason instanceof Error && reason.message ? reason.message : fallback; }
function formatUsdt(atoms: string): string {
  if (!/^\d+$/.test(atoms)) return atoms;
  const value = BigInt(atoms); const whole = value / 1_000_000n; const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole.toLocaleString()}.${fraction}` : whole.toLocaleString();
}
function usdtToAtoms(value: string): string {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) throw new Error('請輸入有效的 USDT 金額，最多六位小數。');
  const [whole, fraction = ''] = trimmed.split('.');
  const atoms = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  if (atoms <= 0n) throw new Error('轉帳金額必須大於 0。');
  return atoms.toString();
}
function transactionLabel(type: string): string { return type === 'internal_transfer' ? '站內轉帳' : type === 'deposit_credit' || type === 'deposit' ? '充值入帳' : type === 'withdrawal' ? '提領' : '錢包異動'; }
function timeLabel(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? '時間待確認' : date.toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }); }
function shortAddress(address: string): string { return address.length > 20 ? `${address.slice(0, 10)}…${address.slice(-8)}` : address; }

export function WalletHome({ apiBaseUrl, getAccessToken, onSignOut, username }: WalletHomeProps) {
  const [screen, setScreen] = useState<Screen>('home');
  const [wallet, setWallet] = useState<WalletSnapshot>();
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [message, setMessage] = useState<string>();
  const [history, setHistory] = useState<{ nextCursor?: string; transactions: WalletTransaction[] }>();
  const [historyStatus, setHistoryStatus] = useState<RequestStatus>('idle');
  const [historyMessage, setHistoryMessage] = useState<string>();
  const [network, setNetwork] = useState<Network>('ethereum');
  const [depositAddress, setDepositAddress] = useState<DepositAddress>();
  const [copied, setCopied] = useState(false);
  const [copiedWalletId, setCopiedWalletId] = useState(false);
  const [recipientWalletId, setRecipientWalletId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferId, setTransferId] = useState<string>();
  const [transferBusy, setTransferBusy] = useState(false);
  const configured = Boolean(apiBaseUrl.trim());
  const fetchToken = useCallback(async () => { const token = await getAccessToken(); if (!token) throw new Error('登入憑證尚未就緒，請重新登入後再試。'); return token; }, [getAccessToken]);
  const failAuth = useCallback((reason: unknown, fallback: string) => {
    if (isInvalidAuthGrant(reason)) { onSignOut(); return '登入已過期，請重新登入。'; }
    return messageFrom(reason, fallback);
  }, [onSignOut]);
  const refresh = useCallback(async () => {
    if (!configured) { setStatus('idle'); return; }
    setMessage(undefined); setStatus('loading');
    try { setWallet(await getWalletSnapshot({ accessToken: await fetchToken(), apiBaseUrl })); setStatus('ready'); }
    catch (reason) { setWallet(undefined); setMessage(failAuth(reason, '未能讀取錢包資料，請稍後再試。')); setStatus('error'); }
  }, [apiBaseUrl, configured, failAuth, fetchToken]);
  const loadHistory = useCallback(async (cursor?: string) => {
    if (!configured) { setHistory(undefined); setHistoryStatus('idle'); return; }
    setHistoryMessage(undefined); setHistoryStatus('loading');
    try {
      const page = await getWalletTransactions({ accessToken: await fetchToken(), apiBaseUrl, cursor });
      setHistory((current) => cursor && current ? { ...page, transactions: [...current.transactions, ...page.transactions] } : page); setHistoryStatus('ready');
    } catch (reason) { if (!cursor) setHistory(undefined); setHistoryMessage(failAuth(reason, '未能讀取交易紀錄，請稍後再試。')); setHistoryStatus('error'); }
  }, [apiBaseUrl, configured, failAuth, fetchToken]);
  useEffect(() => { void refresh(); void loadHistory(); }, [loadHistory, refresh]);
  const usdt = useMemo(() => wallet?.balances.find((balance) => balance.assetCode === 'USDT'), [wallet]);
  const requestDepositAddress = async () => {
    if (!configured) return;
    setCopied(false); setMessage(undefined); setStatus('loading');
    try { setDepositAddress(await allocateDepositAddress({ accessToken: await fetchToken(), apiBaseUrl, network })); setStatus('ready'); setScreen('topup-confirmation'); }
    catch (reason) { setMessage(messageFrom(reason, '未能建立充值地址，請稍後再試。')); setStatus('error'); }
  };
  const copyAddress = async () => {
    if (!depositAddress) return;
    try { await globalThis.navigator?.clipboard?.writeText(depositAddress.address); setCopied(true); } catch { setCopied(false); }
  };
  const copyWalletId = async () => {
    if (!wallet?.accountId) return;
    try { await globalThis.navigator?.clipboard?.writeText(wallet.accountId); setCopiedWalletId(true); } catch { setCopiedWalletId(false); }
  };
  const reviewTransfer = () => {
    setMessage(undefined);
    try {
      const recipient = recipientWalletId.trim();
      if (!WALLET_ID_PATTERN.test(recipient)) throw new Error('請輸入對方的錢包編號（UUID）。');
      if (wallet?.accountId && recipient.toLowerCase() === wallet.accountId.toLowerCase()) throw new Error('不能轉帳給自己的錢包。');
      usdtToAtoms(transferAmount);
      setScreen('send-confirm');
    } catch (reason) { setMessage(messageFrom(reason, '請確認收款錢包與金額後再試。')); }
  };
  const confirmTransfer = async () => {
    if (!configured) return;
    setTransferBusy(true); setMessage(undefined);
    try {
      const result = await submitInternalTransfer({
        accessToken: await fetchToken(),
        amountAtoms: usdtToAtoms(transferAmount),
        apiBaseUrl,
        assetCode: 'USDT',
        idempotencyKey: globalThis.crypto.randomUUID(),
        recipientWalletId: recipientWalletId.trim(),
      });
      setTransferId(result.transferId);
      setScreen('send-done');
      void refresh();
      void loadHistory();
    } catch (reason) { setMessage(messageFrom(reason, '站內轉帳沒有完成，請確認收款帳戶與餘額後再試。')); }
    finally { setTransferBusy(false); }
  };
  const returnHome = () => { setScreen('home'); setMessage(undefined); setCopied(false); };
  const openSend = () => { setMessage(undefined); setTransferId(undefined); setScreen('send'); };

  if (screen === 'topup') return <TopUpScreen configured={configured} loading={status === 'loading'} message={message} network={network} onBack={returnHome} onChooseNetwork={setNetwork} onRequest={() => void requestDepositAddress()} />;
  if (screen === 'topup-confirmation' && depositAddress) return <TopUpConfirmation address={depositAddress} copied={copied} onBack={() => setScreen('topup')} onCopy={() => void copyAddress()} onDone={returnHome} />;
  if (screen === 'history') return <HistoryScreen configured={configured} history={history} message={historyMessage} status={historyStatus} onBack={returnHome} onLoad={() => void loadHistory()} onMore={(cursor) => void loadHistory(cursor)} />;
  if (screen === 'send') return <SendScreen amount={transferAmount} configured={configured} message={message} recipient={recipientWalletId} walletId={wallet?.accountId} onAmount={setTransferAmount} onBack={returnHome} onRecipient={setRecipientWalletId} onReview={reviewTransfer} />;
  if (screen === 'send-confirm') return <SendConfirmScreen amount={transferAmount} busy={transferBusy} message={message} recipient={recipientWalletId.trim()} onBack={() => { setMessage(undefined); setScreen('send'); }} onConfirm={() => void confirmTransfer()} />;
  if (screen === 'send-done' && transferId) return <SendDoneScreen amount={transferAmount} recipient={recipientWalletId.trim()} transferId={transferId} onDone={returnHome} />;

  return <View style={styles.page}><ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
    <View style={styles.topbar}><View style={styles.brandRow}><View style={figmaWalletShared.brandMark}><View style={figmaWalletShared.brandMarkCore} /></View><View><Text style={styles.greeting}>您好，{username ?? '使用者'}</Text><Text style={styles.subGreeting}>歡迎回來</Text></View></View><Pressable accessibilityLabel="登出" accessibilityRole="button" onPress={onSignOut} style={({ pressed }) => [styles.profileButton, pressed && figmaWalletShared.pressed]}><Text style={styles.profileButtonText}>登出</Text></Pressable></View>
    <View style={styles.balanceArea}><Text style={styles.balanceLabel}>總資產</Text>{status === 'loading' ? <ActivityIndicator color={figmaWallet.colors.black} /> : null}{status === 'error' ? <Text style={styles.error}>{message}</Text> : null}{configured && status === 'ready' && usdt ? <Text style={styles.balanceValue}>{formatUsdt(usdt.balanceAtoms)} <Text style={styles.balanceUnit}>USDT</Text></Text> : null}{configured && status === 'ready' && !wallet?.balances.length ? <Text style={styles.balanceEmpty}>尚無已入帳資產</Text> : null}{!configured ? <Text style={styles.balanceEmpty}>錢包 API 尚未啟用，沒有顯示測試餘額。</Text> : null}</View>
    {wallet?.accountId ? <View style={styles.walletIdCard}><Text style={styles.walletIdLabel}>我的錢包編號</Text><Text selectable style={styles.walletIdText}>{wallet.accountId}</Text><Pressable accessibilityLabel="複製錢包編號" accessibilityRole="button" onPress={() => void copyWalletId()} style={({ pressed }) => [styles.copyInline, pressed && figmaWalletShared.pressed]}><Text style={styles.copyText}>{copiedWalletId ? '已複製' : '複製給對方收款'}</Text></Pressable></View> : null}
    <View style={styles.actionRow}><Pressable accessibilityLabel="前往多鏈充值" accessibilityRole="button" onPress={() => setScreen('topup')} style={({ pressed }) => [styles.primaryAction, pressed && figmaWalletShared.pressed]}><Text style={styles.actionIcon}>↓</Text><Text style={styles.primaryActionText}>充值</Text></Pressable><Pressable accessibilityLabel="前往站內轉帳" accessibilityRole="button" onPress={openSend} style={({ pressed }) => [styles.secondaryAction, pressed && figmaWalletShared.pressed]}><Text style={styles.secondaryIcon}>↗</Text><Text style={styles.secondaryActionText}>轉帳</Text></Pressable></View>
    <View style={styles.purpleBanner}><Text style={styles.bannerTitle}>多鏈充值，清楚確認</Text><Text style={styles.bannerBody}>Ethereum 與 TRON 均可取得你的專屬地址。</Text><Pressable accessibilityRole="button" onPress={() => setScreen('topup')}><Text style={styles.bannerLink}>開始充值　→</Text></Pressable></View>
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>交易紀錄</Text><Pressable accessibilityRole="button" onPress={() => setScreen('history')}><Text style={styles.seeAll}>查看全部</Text></Pressable></View>
    {!configured ? <Text style={styles.notice}>連接受保護 API 後，這裡才會顯示你的真實紀錄。</Text> : null}
    {configured && historyStatus === 'loading' && !history ? <View style={styles.loadingRow}><ActivityIndicator color={figmaWallet.colors.blue} /><Text style={styles.notice}>正在讀取交易紀錄</Text></View> : null}
    {configured && historyStatus === 'error' ? <View style={styles.noticeCard}><Text style={styles.errorDark}>{historyMessage}</Text><Pressable accessibilityRole="button" onPress={() => void loadHistory()}><Text style={styles.seeAll}>重新載入</Text></Pressable></View> : null}
    {configured && historyStatus === 'ready' && !history?.transactions.length ? <Text style={styles.notice}>尚無交易紀錄。完成鏈上充值後會在這裡顯示。</Text> : null}
    {history?.transactions.slice(0, 3).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}
  </ScrollView></View>;
}

function TopUpScreen({ configured, loading, message, network, onBack, onChooseNetwork, onRequest }: { configured: boolean; loading: boolean; message?: string; network: Network; onBack: () => void; onChooseNetwork: (network: Network) => void; onRequest: () => void }) {
  return <View style={styles.purplePage}><ScrollView contentContainerStyle={styles.topupScroll} showsVerticalScrollIndicator={false}><TopBar title="充值" onBack={onBack} /><View style={styles.sheet}><Text style={styles.sheetEyebrow}>選擇網路</Text><Text style={styles.sheetTitle}>充值 USDT</Text><Text style={styles.sheetBody}>請選擇轉出平台使用的網路。只可轉入相同網路的 USDT。</Text>{(['ethereum', 'tron'] as const).map((item) => <Pressable key={item} accessibilityRole="button" onPress={() => onChooseNetwork(item)} style={({ pressed }) => [styles.networkCard, network === item && styles.networkCardActive, pressed && figmaWalletShared.pressed]}><View style={[styles.networkBadge, item === 'tron' && styles.tronBadge]}><Text style={styles.networkBadgeText}>{item === 'ethereum' ? 'ETH' : 'TRX'}</Text></View><View style={styles.networkDetails}><Text style={styles.networkName}>{item === 'ethereum' ? 'Ethereum' : 'TRON'}</Text><Text style={styles.networkDescription}>{item === 'ethereum' ? 'ERC-20 · 網路費可能較高' : 'TRC-20 · 請確認轉出端支援'}</Text></View><Text style={styles.choiceMark}>{network === item ? '✓' : ''}</Text></Pressable>)}{message ? <Text style={styles.errorDark}>{message}</Text> : null}<Pressable accessibilityRole="button" disabled={!configured || loading} onPress={onRequest} style={({ pressed }) => [figmaWalletShared.button, (!configured || loading) && styles.disabled, pressed && figmaWalletShared.pressed]}>{loading ? <ActivityIndicator color={figmaWallet.colors.black} /> : <Text style={figmaWalletShared.buttonText}>{configured ? '取得充值地址' : '充值服務尚未啟用'}</Text>}</Pressable></View></ScrollView></View>;
}

function TopUpConfirmation({ address, copied, onBack, onCopy, onDone }: { address: DepositAddress; copied: boolean; onBack: () => void; onCopy: () => void; onDone: () => void }) {
  return <View style={styles.purplePage}><ScrollView contentContainerStyle={styles.topupScroll} showsVerticalScrollIndicator={false}><TopBar title="充值地址" onBack={onBack} /><View style={styles.sheet}><View style={styles.successCircle}><Text style={styles.successTick}>✓</Text></View><Text style={styles.sheetTitle}>地址已準備好</Text><Text style={styles.sheetBody}>僅限透過 <Text style={styles.emphasis}>{address.network === 'ethereum' ? 'Ethereum（ERC-20）' : 'TRON（TRC-20）'}</Text> 轉入 USDT。網路不一致可能造成資產遺失。</Text><View style={styles.addressCard}><Text style={styles.addressLabel}>{address.network.toUpperCase()} · USDT</Text><Text selectable style={styles.addressText}>{address.address}</Text><Pressable accessibilityRole="button" onPress={onCopy} style={({ pressed }) => [styles.copyButton, pressed && figmaWalletShared.pressed]}><Text style={styles.copyText}>{copied ? '已複製' : '複製地址'}</Text></Pressable></View><View style={styles.warningCard}><Text style={styles.warningTitle}>充值前請再次確認</Text><Text style={styles.warningBody}>網路、幣種與地址必須完全相同。此地址只代表你的 hidotpay 錢包。</Text></View><Pressable accessibilityRole="button" onPress={onDone} style={({ pressed }) => [figmaWalletShared.button, pressed && figmaWalletShared.pressed]}><Text style={figmaWalletShared.buttonText}>我已了解</Text></Pressable></View></ScrollView></View>;
}

function SendScreen({ amount, configured, message, recipient, walletId, onAmount, onBack, onRecipient, onReview }: { amount: string; configured: boolean; message?: string; recipient: string; walletId?: string; onAmount: (value: string) => void; onBack: () => void; onRecipient: (value: string) => void; onReview: () => void }) {
  return <View style={styles.purplePage}><ScrollView contentContainerStyle={styles.topupScroll} showsVerticalScrollIndicator={false}><TopBar title="站內轉帳" onBack={onBack} /><View style={styles.sheet}><Text style={styles.sheetEyebrow}>轉給 hidotpay 用戶</Text><Text style={styles.sheetTitle}>即時到帳，不上鏈</Text><Text style={styles.sheetBody}>輸入對方的錢包編號與 USDT 金額。這是平台內轉帳，不會產生鏈上手續費，也不會觸發外部提領。</Text>{walletId ? <View style={styles.addressCard}><Text style={styles.addressLabel}>你的錢包編號</Text><Text selectable style={styles.addressText}>{walletId}</Text></View> : null}<Text style={styles.fieldLabel}>收款錢包編號</Text><TextInput accessibilityLabel="收款錢包編號" autoCapitalize="none" autoCorrect={false} onChangeText={onRecipient} placeholder="00000000-0000-4000-8000-000000000000" placeholderTextColor={figmaWallet.colors.muted} style={styles.input} value={recipient} /><Text style={styles.fieldLabel}>金額（USDT）</Text><TextInput accessibilityLabel="轉帳金額" autoCapitalize="none" keyboardType="decimal-pad" onChangeText={onAmount} placeholder="0.00" placeholderTextColor={figmaWallet.colors.muted} style={styles.input} value={amount} />{message ? <Text style={styles.errorDark}>{message}</Text> : null}<Pressable accessibilityRole="button" disabled={!configured} onPress={onReview} style={({ pressed }) => [figmaWalletShared.button, !configured && styles.disabled, pressed && figmaWalletShared.pressed]}><Text style={figmaWalletShared.buttonText}>{configured ? '檢查轉帳內容' : '轉帳服務尚未啟用'}</Text></Pressable></View></ScrollView></View>;
}

function SendConfirmScreen({ amount, busy, message, recipient, onBack, onConfirm }: { amount: string; busy: boolean; message?: string; recipient: string; onBack: () => void; onConfirm: () => void }) {
  return <View style={styles.purplePage}><ScrollView contentContainerStyle={styles.topupScroll} showsVerticalScrollIndicator={false}><TopBar title="確認轉帳" onBack={onBack} /><View style={styles.sheet}><Text style={styles.sheetTitle}>請再確認一次</Text><Text style={styles.sheetBody}>送出後會立刻從你的可用餘額扣款，並記入對方錢包。請確認編號與金額無誤。</Text><View style={styles.addressCard}><Text style={styles.addressLabel}>收款錢包</Text><Text selectable style={styles.addressText}>{recipient}</Text><Text style={styles.addressLabel}>金額</Text><Text style={styles.confirmAmount}>{amount} USDT</Text></View>{message ? <Text style={styles.errorDark}>{message}</Text> : null}<Pressable accessibilityRole="button" disabled={busy} onPress={onConfirm} style={({ pressed }) => [figmaWalletShared.button, busy && styles.disabled, pressed && figmaWalletShared.pressed]}>{busy ? <ActivityIndicator color={figmaWallet.colors.black} /> : <Text style={figmaWalletShared.buttonText}>確認轉出</Text>}</Pressable></View></ScrollView></View>;
}

function SendDoneScreen({ amount, recipient, transferId, onDone }: { amount: string; recipient: string; transferId: string; onDone: () => void }) {
  return <View style={styles.purplePage}><ScrollView contentContainerStyle={styles.topupScroll} showsVerticalScrollIndicator={false}><TopBar title="轉帳完成" onBack={onDone} /><View style={styles.sheet}><View style={styles.successCircle}><Text style={styles.successTick}>✓</Text></View><Text style={styles.sheetTitle}>已轉給對方</Text><Text style={styles.sheetBody}>{amount} USDT 已記入對方的 hidotpay 錢包，無需等待鏈上確認。</Text><View style={styles.addressCard}><Text style={styles.addressLabel}>收款錢包</Text><Text selectable style={styles.addressText}>{recipient}</Text><Text style={styles.addressLabel}>轉帳編號</Text><Text selectable style={styles.addressText}>{transferId}</Text></View><Pressable accessibilityRole="button" onPress={onDone} style={({ pressed }) => [figmaWalletShared.button, pressed && figmaWalletShared.pressed]}><Text style={figmaWalletShared.buttonText}>返回錢包</Text></Pressable></View></ScrollView></View>;
}

function HistoryScreen({ configured, history, message, status, onBack, onLoad, onMore }: { configured: boolean; history?: { nextCursor?: string; transactions: WalletTransaction[] }; message?: string; status: RequestStatus; onBack: () => void; onLoad: () => void; onMore: (cursor: string) => void }) {
  return <View style={styles.page}><ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}><TopBar title="交易紀錄" onBack={onBack} dark /><View style={styles.historyPanel}>{!configured ? <Text style={styles.notice}>錢包 API 尚未啟用。</Text> : null}{status === 'loading' && !history ? <ActivityIndicator color={figmaWallet.colors.blue} /> : null}{status === 'error' ? <><Text style={styles.errorDark}>{message}</Text><Pressable accessibilityRole="button" onPress={onLoad}><Text style={styles.seeAll}>重新載入</Text></Pressable></> : null}{status === 'ready' && !history?.transactions.length ? <Text style={styles.notice}>尚無交易紀錄。</Text> : null}{history?.transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}{history?.nextCursor ? <Pressable accessibilityRole="button" disabled={status === 'loading'} onPress={() => onMore(history.nextCursor!)} style={({ pressed }) => [styles.moreButton, pressed && figmaWalletShared.pressed]}><Text style={styles.moreButtonText}>{status === 'loading' ? '載入中' : '載入更多'}</Text></Pressable> : null}</View></ScrollView></View>;
}

function TopBar({ title, onBack, dark = false }: { title: string; onBack: () => void; dark?: boolean }) { return <View style={styles.screenTopbar}><Pressable accessibilityLabel="返回" accessibilityRole="button" onPress={onBack} style={styles.backButton}><Text style={[styles.backText, dark && styles.backTextDark]}>‹</Text></Pressable><Text style={[styles.screenTitle, dark && styles.screenTitleDark]}>{title}</Text><View style={styles.backButton} /></View>; }
function TransactionRow({ transaction }: { transaction: WalletTransaction }) { const incoming = transaction.direction === 'incoming'; const amount = transaction.assetCode === 'USDT' ? formatUsdt(transaction.amountAtoms) : transaction.amountAtoms; return <View style={styles.transactionRow}><View style={[styles.transactionBadge, incoming && styles.transactionBadgeIncoming]}><Text style={styles.transactionArrow}>{incoming ? '↓' : '↑'}</Text></View><View style={styles.transactionMain}><Text numberOfLines={1} style={styles.transactionName}>{transactionLabel(transaction.type)}</Text><Text style={styles.transactionTime}>{timeLabel(transaction.createdAt)}</Text></View><View><Text style={[styles.transactionAmount, incoming && styles.incomingAmount]}>{incoming ? '+' : '-'}{amount}</Text><Text style={styles.transactionAsset}>{transaction.assetCode}</Text></View></View>; }

const styles = StyleSheet.create({
  page: { backgroundColor: figmaWallet.colors.canvas, flex: 1, minHeight: '100%', overflow: 'hidden' }, scroll: { alignSelf: 'center', maxWidth: 540, padding: 24, paddingBottom: 44, width: '100%' }, topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, brandRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minWidth: 0 }, greeting: { color: figmaWallet.colors.black, fontSize: 16, fontWeight: '800' }, subGreeting: { color: figmaWallet.colors.muted, fontSize: 12, marginTop: 2 }, profileButton: { borderColor: figmaWallet.colors.border, borderRadius: 12, borderWidth: 1, minHeight: 42, paddingHorizontal: 13, justifyContent: 'center' }, profileButtonText: { color: figmaWallet.colors.black, fontSize: 13, fontWeight: '800' }, balanceArea: { gap: 11, marginTop: 40, minHeight: 113 }, balanceLabel: { color: figmaWallet.colors.muted, fontSize: 14 }, balanceValue: { color: figmaWallet.colors.black, fontSize: 39, fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: -1.8 }, balanceUnit: { color: figmaWallet.colors.muted, fontSize: 18, fontWeight: '700' }, balanceEmpty: { color: figmaWallet.colors.muted, fontSize: 15, lineHeight: 22, maxWidth: 300 }, error: { color: '#B42318', fontSize: 14, lineHeight: 20 }, actionRow: { flexDirection: 'row', gap: 12, marginTop: 19 }, primaryAction: { alignItems: 'center', backgroundColor: figmaWallet.colors.acid, borderRadius: 24, flex: 1, gap: 8, justifyContent: 'center', minHeight: 94 }, primaryActionText: { color: figmaWallet.colors.black, fontSize: 14, fontWeight: '800' }, actionIcon: { color: figmaWallet.colors.black, fontSize: 27, fontWeight: '400' }, walletIdCard: { backgroundColor: figmaWallet.colors.soft, borderRadius: 16, gap: 8, marginTop: 18, padding: 16 }, walletIdLabel: { color: figmaWallet.colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 }, walletIdText: { color: figmaWallet.colors.black, fontFamily: 'monospace', fontSize: 13, lineHeight: 20 }, copyInline: { alignSelf: 'flex-start' }, secondaryAction: { alignItems: 'center', backgroundColor: figmaWallet.colors.blue, borderRadius: 24, flex: 1, gap: 8, justifyContent: 'center', minHeight: 94 }, secondaryIcon: { color: '#FFFFFF', fontSize: 25 }, secondaryActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' }, fieldLabel: { color: figmaWallet.colors.black, fontSize: 13, fontWeight: '800', marginTop: 4 }, input: { backgroundColor: figmaWallet.colors.soft, borderColor: figmaWallet.colors.border, borderRadius: 12, borderWidth: 1, color: figmaWallet.colors.black, fontSize: 16, minHeight: 52, paddingHorizontal: 14 }, confirmAmount: { color: figmaWallet.colors.black, fontSize: 28, fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: -1 }, purpleBanner: { backgroundColor: figmaWallet.colors.blue, borderRadius: 18, marginTop: 24, overflow: 'hidden', padding: 21 }, bannerTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '800', letterSpacing: -0.6 }, bannerBody: { color: '#DFDCFF', fontSize: 14, lineHeight: 20, marginTop: 7 }, bannerLink: { color: figmaWallet.colors.acid, fontSize: 14, fontWeight: '800', marginTop: 17 }, sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 29 }, sectionTitle: { color: figmaWallet.colors.black, fontSize: 19, fontWeight: '800' }, seeAll: { color: figmaWallet.colors.blue, fontSize: 14, fontWeight: '800' }, notice: { color: figmaWallet.colors.muted, fontSize: 14, lineHeight: 21, marginTop: 16 }, loadingRow: { alignItems: 'center', flexDirection: 'row', gap: 10 }, noticeCard: { backgroundColor: '#FFF6F4', borderRadius: 12, gap: 8, marginTop: 16, padding: 14 }, errorDark: { color: '#A23A2C', fontSize: 14, lineHeight: 20 }, transactionRow: { alignItems: 'center', borderColor: figmaWallet.colors.border, borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 14, padding: 13 }, transactionBadge: { alignItems: 'center', backgroundColor: figmaWallet.colors.violetSoft, borderRadius: 17, height: 42, justifyContent: 'center', width: 42 }, transactionBadgeIncoming: { backgroundColor: '#F0FFD0' }, transactionArrow: { color: figmaWallet.colors.black, fontSize: 21 }, transactionMain: { flex: 1, minWidth: 0 }, transactionName: { color: figmaWallet.colors.black, fontSize: 14, fontWeight: '800' }, transactionTime: { color: figmaWallet.colors.muted, fontSize: 11, marginTop: 4 }, transactionAmount: { color: figmaWallet.colors.black, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '800', textAlign: 'right' }, incomingAmount: { color: '#237D4B' }, transactionAsset: { color: figmaWallet.colors.muted, fontSize: 11, marginTop: 4, textAlign: 'right' }, purplePage: { backgroundColor: figmaWallet.colors.blue, flex: 1, minHeight: '100%' }, topupScroll: { alignSelf: 'center', maxWidth: 540, minHeight: '100%', width: '100%' }, screenTopbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 114, paddingHorizontal: 24 }, backButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 }, backText: { color: '#FFFFFF', fontSize: 32, fontWeight: '300', lineHeight: 35, marginTop: -3 }, backTextDark: { color: figmaWallet.colors.black }, screenTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' }, screenTitleDark: { color: figmaWallet.colors.black }, sheet: { backgroundColor: figmaWallet.colors.canvas, borderTopLeftRadius: 32, borderTopRightRadius: 32, flexGrow: 1, gap: 14, minHeight: 710, padding: 24, paddingTop: 31 }, sheetEyebrow: { color: figmaWallet.colors.muted, fontSize: 14 }, sheetTitle: { color: figmaWallet.colors.black, fontSize: 29, fontWeight: '800', letterSpacing: -1.1 }, sheetBody: { color: figmaWallet.colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 12 }, emphasis: { color: figmaWallet.colors.black, fontWeight: '800' }, networkCard: { alignItems: 'center', borderColor: figmaWallet.colors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 13, minHeight: 80, padding: 13 }, networkCardActive: { backgroundColor: '#FAFFEC', borderColor: figmaWallet.colors.acid, borderWidth: 2 }, networkBadge: { alignItems: 'center', backgroundColor: '#E7E0FF', borderRadius: 18, height: 44, justifyContent: 'center', width: 44 }, tronBadge: { backgroundColor: '#FFE2E1' }, networkBadgeText: { color: figmaWallet.colors.black, fontSize: 11, fontWeight: '800' }, networkDetails: { flex: 1, minWidth: 0 }, networkName: { color: figmaWallet.colors.black, fontSize: 16, fontWeight: '800' }, networkDescription: { color: figmaWallet.colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 }, choiceMark: { color: figmaWallet.colors.black, fontSize: 19, fontWeight: '800' }, successCircle: { alignItems: 'center', alignSelf: 'center', backgroundColor: figmaWallet.colors.acid, borderRadius: 34, height: 68, justifyContent: 'center', marginBottom: 12, width: 68 }, successTick: { color: figmaWallet.colors.black, fontSize: 34, fontWeight: '800' }, addressCard: { backgroundColor: figmaWallet.colors.soft, borderRadius: 15, gap: 11, padding: 16 }, addressLabel: { color: figmaWallet.colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.8 }, addressText: { color: figmaWallet.colors.black, fontFamily: 'monospace', fontSize: 14, lineHeight: 21 }, copyButton: { alignItems: 'center', borderColor: figmaWallet.colors.border, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 40 }, copyText: { color: figmaWallet.colors.blue, fontSize: 13, fontWeight: '800' }, warningCard: { backgroundColor: '#FFF7DF', borderRadius: 14, gap: 5, marginBottom: 8, padding: 14 }, warningTitle: { color: '#674A00', fontSize: 14, fontWeight: '800' }, warningBody: { color: '#715E2A', fontSize: 12, lineHeight: 18 }, historyPanel: { paddingBottom: 20 }, moreButton: { alignItems: 'center', borderColor: figmaWallet.colors.border, borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 48 }, moreButtonText: { color: figmaWallet.colors.black, fontSize: 14, fontWeight: '800' }, disabled: { opacity: 0.48 },
});
