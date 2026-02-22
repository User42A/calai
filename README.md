# AICal PWA (iOS Safari "Als App" kompatibel)

## Was du bekommst
- Ultra-clean Glassmorphism UI (Dark Mode default) + Live Accent Color
- Onboarding: Ziel (Cut/Maintain/Bulk) + BMR/TDEE + Kalorien/Makros auto + manuell editierbar
- Dashboard (Heute): kcal + Makro Bars, Mahlzeitenliste
- Logging: pro Mahlzeit Manuell, Suche (lokale Food-DB), AI-Text (Stub) mit Confidence + Review-Screen
- Fortschritt: Ø Werte + Gewicht speichern, Historie (letzte 30 Tage)
- Einstellungen: Theme (Dark/Light + Accent), Ziel/Makros editieren
- Offline-first: LocalStorage + Service Worker Cache

## Hosting (wichtig für iOS)
Du MUSST über HTTPS hosten (z.B. Cloudflare Pages, Netlify, Vercel, GitHub Pages mit HTTPS).
Dann in iOS Safari:
1) Öffne deine URL
2) Share → „Zum Home-Bildschirm“
3) Starten → läuft im Standalone App-Modus

## Lokales Testen
Einfach irgendeinen Static Host verwenden:
- VSCode Live Server
- oder `python -m http.server 5173` im Ordner (für schnellen Test)

## Nächste Upgrades
- Barcode Scan: iOS Web: `BarcodeDetector` (wo unterstützt) oder QuaggaJS
- AI Foto: Upload + Backend (Vision) → Draft + Review
- Export/Cloud: später Sync (optional Account)
