---
sidebar_position: 2
---

# Auto-Recharge

Auto-recharge automatically tops up your OpenDoor credit balance when it falls below a threshold you set. This prevents service interruptions caused by accidental credit depletion.

---

## How It Works

1. You configure a **minimum balance** (e.g. $50) and a **recharge amount** (e.g. $200).
2. OpenDoor monitors your credit balance in real time.
3. When balance < minimum, Stripe charges your default payment method for the recharge amount.
4. Credits are added to your balance immediately after Stripe confirms the charge.
5. An email receipt is sent to the billing contact on file.

If the charge fails (expired card, insufficient funds, etc.), OpenDoor retries every 6 hours for up to 48 hours. After that, a critical alert is sent and auto-recharge is paused until you update your payment method.

---

## Enabling Auto-Recharge

### Dashboard

1. Go to **Settings → Billing → Auto-Recharge**.
2. Toggle **Enable Auto-Recharge**.
3. Enter:
   - **Trigger threshold** — balance that triggers a recharge
   - **Recharge amount** — amount to add each time
   - **Monthly cap** — maximum total recharge per calendar month (optional)
4. Confirm your default payment method.
5. Save.

### API

```bash
curl -X PUT https://api.opendoor.ai/v1/billing/auto-recharge \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "thresholdUsdCents": 5000,
    "amountUsdCents": 20000,
    "monthlyCapUsdCents": 100000
  }'
```

---

## Monthly Caps

The monthly cap prevents runaway spending in case of unexpected traffic spikes or misconfiguration. Once the cap is reached:

- No further auto-recharges occur until the 1st of the next month.
- Requests continue as long as you have a positive balance.
- When balance hits zero, hard-capped keys are blocked. Uncapped keys continue and accrue billable overage.

You can adjust the cap at any time. Changes take effect immediately but do not reset the current month’s accumulated recharge total.

---

## Payment Methods

Auto-recharge requires a saved payment method. OpenDoor supports:

- Credit / debit cards (Visa, Mastercard, Amex)
- ACH bank transfers (US only)
- SEPA debit (EU only)

To update your payment method, visit **Settings → Billing → Payment Methods**.

---

## Invoices & Receipts

Each auto-recharge generates a Stripe invoice. You can:

- View invoices in the dashboard under **Billing → Invoices**
- Export them as PDF
- Send them automatically to your accounting email

---

## Disabling Auto-Recharge

You can disable auto-recharge at any time:

1. Go to **Settings → Billing → Auto-Recharge**.
2. Toggle **Enable Auto-Recharge** to **Off**.
3. Existing credits remain usable. No refunds are issued for unused credits.

Disabling does not affect one-time manual top-ups, which you can still perform from the same page.

---

## Security

- Payment details are stored by Stripe, not OpenDoor. We only retain Stripe customer and payment method IDs.
- All auto-recharge webhooks are verified with Stripe signature checks.
- Changes to auto-recharge settings are logged in the organization audit trail.
