# 幻域編年史後端

純後端服務，提供排行榜 / 跨玩家共享狀態。前端（GitHub Pages）透過 HTTPS 呼叫這裡。

## 安裝（一次性）

### 1. 安裝 Node.js
- 下載：https://nodejs.org/zh-tw/ （選 **LTS** 版本）
- 安裝完關閉所有終端機重開

驗證：
```bash
node --version  # v20 或 v22
npm --version
```

### 2. 安裝後端套件
```bash
cd C:\Users\User\Desktop\Claude\idle-rpg\server
npm install
```

跑完後 `node_modules/` 出現就 OK（不會進 git）。

### 3. 安裝 cloudflared（公開網路）
- 下載：https://github.com/cloudflare/cloudflared/releases/latest
  選 `cloudflared-windows-amd64.exe`，改名為 `cloudflared.exe` 放在 `C:\Windows\System32\`
- 或 winget：`winget install Cloudflare.cloudflared`

驗證：
```bash
cloudflared --version
```

## 啟動

### 方式 A：開發（純本機測試）
```bash
cd server
npm start
```

伺服器跑在 `http://localhost:8766`。前端先把 `js/config.js` 的 `API_BASE` 改成 `http://localhost:8766` 測試。

### 方式 B：上線（Cloudflare Tunnel）

**第一次設定（一次性）：**
```bash
# 1. 登入 Cloudflare（會開瀏覽器要你授權）
cloudflared tunnel login

# 2. 建立 tunnel
cloudflared tunnel create idle-rpg

# 3. 設定 config 檔案（記下上一步輸出的 UUID）
# 開啟 C:\Users\User\.cloudflared\config.yml 編輯成下面內容：
```

`config.yml`：
```yaml
tunnel: <你的 tunnel UUID>
credentials-file: C:\Users\User\.cloudflared\<UUID>.json

ingress:
  - hostname: idle-rpg-api.<你的子網域>.cfargotunnel.com
    service: http://localhost:8766
  - service: http_status:404
```

（如果你沒有 Cloudflare 註冊網域，可以省略 hostname 那一行，跑 quick tunnel 拿臨時網址）

**之後每次：**
```bash
# 後端
cd server
npm start

# 另開終端機跑 cloudflared
cloudflared tunnel run idle-rpg
```

### 方式 C：當作 Windows 服務（24x7 開機自動跑）
```bash
# Node server 用 pm2 管：
npm install -g pm2 pm2-windows-startup
cd server
pm2 start server.js --name idle-rpg
pm2 save
pm2-startup install

# cloudflared 註冊系統服務：
cloudflared service install
```

之後開機自動跑、斷線自動重連、無需手動。

## 開發注意

- DB 檔案 `data.db` 在 git ignore，不會傳上去
- 改 schema 時：刪掉 `data.db`，重啟 server 會自動建表
- 想看 DB 內容：用 [DB Browser for SQLite](https://sqlitebrowser.org/)
- 日誌：console 直接看；想存檔可以 `npm start > server.log 2>&1`

## API Endpoints

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/health` | 健康檢查 |
| POST | `/api/players/sync` | 玩家資料 upsert |
| GET | `/api/leaderboard?limit=100` | 戰力排行榜 |
| GET | `/api/players/:id` | 單一玩家 + 排名 |

## 安全

- CORS 預設只允許 GitHub Pages + localhost
- payload 限制 32 KB
- CP 上限 1 億（cheat protection）
- 暱稱長度 32 字

要加新允許網域：改 `server.js` 的 `ALLOWED_ORIGINS`。
