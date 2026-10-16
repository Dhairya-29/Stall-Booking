# Stall Booking — Hotel Shiv, Ground Floor Hall

Stall booking website with a live hall map, SMS-OTP login, UPI payment proof upload, admin approval, receipts, and email/WhatsApp alerts.

## Features
- Customer login with name + mobile number (SMS OTP); booking details are filled from the login
- Event list with posters, per-stall pricing, and a live hall map (held / pending / booked stalls update every few seconds, so no double booking)
- 10-minute hold while paying by UPI QR; unique transaction ID + payment screenshot required
- Admin panel (`/admin.html`): approve/reject, view screenshots, add events, set default and per-stall prices, upcoming-event reminders
- Receipt page after approval; ended events disappear from the site but their data is kept
- Alerts to the admin by email (Gmail) and WhatsApp (CallMeBot); 24h and 12h flashcard reminder emails before each event

## Run locally
```bash
npm install
cp .env.example .env     # then edit the values
node server.js
```
Open http://localhost:3000 (customers) and http://localhost:3000/admin.html (admin).
Put your payment QR image at `public/qr.png`.

With no `SMS_PROVIDER` set, OTPs are printed in the server console (testing only).

## Configuration (`.env`)
See `.env.example`: admin password, Gmail SMTP, WhatsApp admins, SMS provider (Fast2SMS or Twilio), `SITE_URL`, and `DATA_DIR`.

## Deploying
Needs a Node.js host with a persistent disk (bookings live in `data.json`, screenshots in `uploads/`). Set `DATA_DIR` to the disk's mount path, e.g. `/var/data`. Build: `npm install` · Start: `node server.js`.

## Notes
`data.json`, `uploads/` and `.env` are git-ignored — never commit them.
