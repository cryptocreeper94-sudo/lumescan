# Lume Scan — Mobile (LumeAuto Mobile)

**Professional OBD-II Diagnostic Scanner — 42-signal deterministic engine on your phone.**

The native Android app for Lume Scan / Lume Auto. Full BLE + WiFi OBD-II connectivity, real-time diagnostics, fuel coaching, predictive maintenance, and Mode 05 key management.

## Download

📱 **[Download APK](https://expo.dev/artifacts/eas/dxTKe5gQw2G11HQbe4GyR.apk)**

🏪 Google Play & Apple App Store — Coming Soon

## Features

- 📡 **42-Signal Diagnostic Engine** — Real-time telemetry at 100ms intervals
- 🔧 **Plain-English Fault Codes** — DTCs translated with severity ratings and repair urgency
- ⛽ **Fuel Coaching** — Passive audio coaching calibrated to your vehicle's torque curve
- 📊 **Predictive Maintenance** — Detects component degradation before check engine light
- 🔑 **Mode 05 Key Management** — Immobilizer key read/program/delete via NFC + OBD-II UDS
- 🛒 **Amazon Part Links** — Direct affiliate links to replacement parts
- 🛡️ **Trust Layer Sealed** — Every diagnostic session cryptographically sealed

## Compatibility

- **Vehicles**: Any OBD-II vehicle (1996+)
- **Adapter**: Any ELM327 BLE/WiFi adapter ($12–$30 on Amazon)
- **Android**: 7.0+ (API 24)

## Pricing

| Tier | Software | Monthly | Access |
|------|----------|---------|--------|
| Free | $0 | — | 3 live signals, blurred interpretation |
| Founders | $9.99 | $1.99/mo | Full 42 signals, all features |
| Own Outright | $249 | — | Lifetime license |

## Tech Stack

- Expo SDK 54 + React Native
- Firebase Auth
- WebView shell targeting lumeauto.tech
- EAS Build (preview profile, `latest` image)

## Build

```bash
npx eas-cli build --platform android --profile preview
```

## License

Proprietary — DarkWave Studios LLC © 2026

- [lumeauto.tech](https://lumeauto.tech)
- [lumescan.tech](https://lumescan.tech)
- U.S. Provisional Patent 64/032,339
