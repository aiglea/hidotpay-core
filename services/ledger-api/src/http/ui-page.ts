export const uiPage = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>hidotpay</title>
  <style>
    :root {
      --bg: #07111f;
      --card: #0d1a2c;
      --line: #1e3551;
      --ink: #f4f8fb;
      --muted: #aebfd2;
      --accent: #13c4ad;
      --accent-ink: #07111f;
      --soft: #7ce4d6;
      --panel: #10243b;
      --danger: #ffb4a8;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); font-family: "Avenir Next", "Segoe UI", "PingFang TC", "Noto Sans TC", sans-serif; }
    body { overflow-x: hidden; }
    .page { min-height: 100vh; display: flex; justify-content: center; padding: 28px 20px 64px; position: relative; }
    .glow { position: absolute; right: -140px; top: -150px; width: 340px; height: 340px; border-radius: 999px; background: var(--accent); opacity: .16; transform: rotate(18deg); }
    .wrap { width: 100%; max-width: 440px; position: relative; }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 36px; }
    .mark { width: 30px; height: 30px; border-radius: 10px; background: var(--accent); display: grid; place-items: center; }
    .mark i { width: 8px; height: 8px; border-radius: 4px; background: var(--bg); display: block; }
    .brand b { font-size: 21px; letter-spacing: -.6px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 24px; padding: 32px; box-shadow: 0 18px 34px rgba(0,0,0,.28); }
    .eyebrow { color: var(--soft); font-size: 11px; font-weight: 700; letter-spacing: 1.6px; margin-bottom: 12px; }
    h1 { margin: 0; font-size: 30px; letter-spacing: -1px; line-height: 1.25; }
    p { color: var(--muted); font-size: 16px; line-height: 1.5; margin: 14px 0 0; }
    .panel { margin-top: 22px; background: var(--panel); border: 1px solid #1c3858; border-radius: 16px; padding: 15px; }
    .label { color: var(--soft); font-size: 12px; }
    .value { margin-top: 6px; font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; word-break: break-all; }
    .amount { font-size: 36px; letter-spacing: -1.4px; }
    button { width: 100%; min-height: 52px; margin-top: 18px; border: 0; border-radius: 12px; background: var(--accent); color: var(--accent-ink); font-size: 16px; font-weight: 800; cursor: pointer; }
    button:disabled { opacity: .65; cursor: wait; }
    button.ghost { background: transparent; color: var(--soft); border: 1px solid var(--line); }
    .err { color: var(--danger); font-size: 14px; margin-top: 16px; }
    .note { color: #7890a9; font-size: 13px; line-height: 1.45; margin-top: 16px; text-align: center; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="page">
    <div class="glow"></div>
    <div class="wrap">
      <div class="brand"><span class="mark"><i></i></span><b>hidotpay</b></div>
      <section class="card">
        <div class="eyebrow">ACCOUNT ACCESS</div>
        <h1 id="title">你的支付帳戶，從安全充值開始</h1>
        <p id="body">按下面按鈕取得你的 TRON 充值地址。請用錢包轉入真實的官方 USDT，系統會掃描鏈上確認後才加餘額。</p>
        <div id="address-box" class="panel hidden">
          <div class="label">TRON 充值地址</div>
          <div id="address" class="value"></div>
        </div>
        <div id="balance-box" class="panel hidden">
          <div class="label">可用 USDT</div>
          <div id="available" class="value amount">0</div>
          <p class="note" style="text-align:left;margin-top:8px">歸集後鏈上充值地址可能是 0，帳本餘額仍會保留。</p>
        </div>
        <div id="error" class="err hidden"></div>
        <button id="allocate" type="button">取得充值地址</button>
        <button id="scan" class="ghost hidden" type="button">檢查是否到帳</button>
        <p class="note">只認 TRON 官方 USDT 合約。未確認的轉帳不會變成可用餘額。這裡不會顯示私鑰。</p>
      </section>
    </div>
  </div>
  <script>
    const key = 'hidotpay.ui.user';
    const userId = localStorage.getItem(key) || ('ui-' + Math.random().toString(36).slice(2, 10));
    localStorage.setItem(key, userId);

    const $ = (id) => document.getElementById(id);
    const show = (id, on) => $(id).classList.toggle('hidden', !on);

    async function call(path, options) {
      const response = await fetch(path, options);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || '操作失敗');
      return data;
    }

    function render(state) {
      $('error').classList.add('hidden');
      if (state.address) {
        $('title').textContent = '充值地址已就緒';
        $('body').textContent = '請把真實的 TRON USDT 轉到這個地址，然後按「檢查是否到帳」。';
        $('address').textContent = state.address;
        show('address-box', true);
        show('scan', true);
        $('allocate').textContent = '再次確認地址';
      }
      if (typeof state.available === 'number') {
        show('balance-box', true);
        $('available').textContent = String(state.available);
        if (state.available > 0) $('title').textContent = '已安全入帳';
      }
    }

    async function allocate() {
      $('allocate').disabled = true;
      try {
        const data = await call('/ui/allocate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        render(data);
      } catch (error) {
        $('error').textContent = error.message;
        show('error', true);
      } finally {
        $('allocate').disabled = false;
      }
    }

    async function scan() {
      $('scan').disabled = true;
      try {
        const data = await call('/ui/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        render(data);
        if (!data.credited) {
          $('error').textContent = data.scanned
            ? '鏈上有轉帳，但還沒確認完成，或不是官方 USDT。'
            : '鏈上還沒看到轉入。請確認已轉到這個地址，稍後再檢查。';
          show('error', true);
        }
      } catch (error) {
        $('error').textContent = error.message;
        show('error', true);
      } finally {
        $('scan').disabled = false;
      }
    }

    $('allocate').addEventListener('click', () => void allocate());
    $('scan').addEventListener('click', () => void scan());

    call('/ui/balance?userId=' + encodeURIComponent(userId)).then((data) => {
      if (data.address) render(data);
    }).catch(() => {});
  </script>
</body>
</html>
`;
