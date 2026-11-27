# FrameFlash — iPad capture → Laptop Premiere → Supabase

Two-device GIF booth:

| Device | Role |
|--------|------|
| **iPad** | Start page, camera capture (5 timed shots), send photos, export GIF |
| **Laptop** | Relay server + Adobe Premiere Pro UXP panel |

## Flow

1. **Home (iPad)** → set HTTPS relay URL + laptop photo folder → Save → Continue  
2. **Start page** → Start Booth  
3. **Capture** → 3s countdown × 5 shots  
4. **Send to laptop** → photos saved to the configured folder (default `E:\Adobe integration\test photos`)  
5. **Premiere** → Fetch / import the new 5 photos  
6. **Export** → GIF to Supabase, then clear that folder for the next set  

## Laptop setup

```bash
cp .env.example .env
npm install
npm run dev:all
```

HTTPS (self-signed):

- Booth UI: `https://<laptop-lan-ip>:5173`  
- Relay API: `https://<laptop-lan-ip>:8787`  

Accept the certificate warning once in the browser / iPad Safari.

Load `premiere-uxp/` in UXP Developer Tool. Relay URL: `https://127.0.0.1:8787`.

## iPad setup

1. Same Wi‑Fi as the laptop  
2. Safari → `https://<laptop-ip>:5173`  
3. On **Home**: relay `https://<laptop-ip>:8787`, photo dir `E:\Adobe integration\test photos` → Save  
4. **Continue to Start** → Start Booth → capture → send  
5. Premiere: import · iPad: export & clear  

## After export

`DELETE /api/booth` clears photo files in the configured laptop directory.

## API (laptop relay)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/booth` | iPad replaces inbox with 5 frames |
| `GET` | `/api/booth` | Premiere fetches current batch |
| `POST` | `/api/booth/imported` | Mark imported |
| `DELETE` | `/api/booth` | Clear after export |
| `GET` | `/api/booth/events` | SSE live updates |

## Supabase

Run SQL in `supabase/migrations/` for GIF export storage + `booth_sessions`.
