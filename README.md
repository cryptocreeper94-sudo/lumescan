# Lume Scan — Native Android App

The **Lume Scan** mobile application — a professional OBD-II diagnostic tool built on the Lume 4/42 deterministic diagnostic engine.

## Download

**Latest APK**: [Download LumeScan v1.0.0](https://expo.dev/artifacts/eas/daERWZBDSVug9YcGoKpvqw.apk)

## Features

- **42-signal diagnostic engine** — real-time telemetry at 100ms intervals
- **Mode 05 — IMMO Key Management** — read, program, delete transponder keys ($199 + $8.99/key)
- **Mode 06 — Remote Start** — proximity CAN-bus remote start via registered IMMO credential ($9.99/mo)
- **Consumer/Mechanic toggle** — clean consumer view or full professional toolset
- **Condition reports** — cryptographically signed vehicle health assessments
- **Fuel coaching** — $180–$320/yr estimated savings
- **Predictive maintenance** — catch failures before they happen
- **Free Tier**: Code reading + 3 live signals
- **Pro**: Full 42-signal engine, all governance nodes

## Pricing

| Tier | Purchase | Monthly |
|------|----------|---------|
| Founders (1-100) | $9.99 | $1.99/mo |
| Early Adopter (101-500) | $19.99 | $2.49/mo |
| Standard (500+) | $39.99 | $4.99/mo |
| Mode 05 | $199 | $8.99/key |
| Mode 06 | — | $9.99/mo |

## Tech Stack

- **Framework**: Expo SDK 54 / React Native
- **Auth**: Firebase Authentication
- **Entitlements**: Firestore (`darkwave-auth`)
- **Payments**: Stripe (via lumeauto.tech)
- **OBD-II**: WiFi TCP + BLE via ELM327 protocol
- **Build**: EAS Cloud Build → APK

## Development

```bash
npm install
npx expo start
```

## Build

```bash
npx eas build --platform android --profile preview
```

## Deployment

- Push to `master` → EAS Cloud Build → APK artifact
- APK uploaded to Firebase Storage for distribution
- Download links on lumeauto.tech, lumescan.tech, and cox.tlid.io

## Related

- [lumeauto.tech](https://lumeauto.tech) — Order & download portal
- [lumescan.tech](https://lumescan.tech) — Product landing page
- [cox.tlid.io](https://cox.tlid.io) — Cox Enterprise Platform
- [dwtl.io](https://dwtl.io) — Trust Layer Ledger

## Legal

© 2026 DarkWave Studios LLC / Lume42 Labs
US Provisional Patent 64/032,339
