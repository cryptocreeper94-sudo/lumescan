# Lume Scan — lumescan.tech

The consumer landing page for **Lume Scan**, a professional OBD-II diagnostic tool built on the Lume 4/42 deterministic diagnostic engine.

## What It Does

Lume Scan reads 42 real-time OBD-II signals at 100ms intervals, provides fuel coaching ($180–$320/yr estimated savings), predictive maintenance alerts, and driver scoring — all from a $15 Bluetooth adapter and your phone.

- **Free Tier**: Code reading + 3 live signals
- **Pro**: Full 42-signal engine, fuel coaching, predictive maintenance

## Tech Stack

- Static HTML/CSS/JS
- No framework, no build step
- Trust Layer Ledger (TLL) hallmark integration
- Hosted on [Render](https://render.com) as a static site

## Local Development

```bash
# Any static server works
npx serve .
```

## Deployment

Pushes to `master` auto-deploy to Render → `lumescan.tech`

## Related

- [lumeauto.tech](https://lumeauto.tech) — Order & download portal
- [lume42.com](https://lume42.com) — Lume42 Labs parent site
- [dwtl.io](https://dwtl.io) — Trust Layer Ledger

## Legal

© 2026 DarkWave Studios LLC / Lume42 Labs  
US Provisional Patent 64/032,339
