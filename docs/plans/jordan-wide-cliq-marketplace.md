# Plan: Jordan-wide marketplace, two interfaces, venue self-registration, CliQ payments, prepaid commission

- **Status:** Approved (2026-09-27). All §8 decisions resolved as recommended, with the owner's D2 addition (48-hour refund escalation). Implementation in progress, phase by phase (§7).
- **Replaces:** the original M6 scope ("real provider adapter, webhooks, payouts"). The platform never
  holds player money. Players pay the venue directly by CliQ. The platform earns a commission that is
  taken from a balance the venue pays in advance.
- **Staging:** every phase is deployed to staging when its tests pass (the automatic update runs every 5
  minutes). The staging probe workflow checks it from the internet.

## 1. Jordan-wide geography

| Change | Detail |
|---|---|
| Data | Migration: the 12 governorates become the top level. `catalog.cities` holds governorates and keeps the table name; `timezone` stays `Asia/Amman`. Main areas per governorate (Appendix A); Amman keeps its 12 areas and gains more. `sort_order` is by population. |
| Admin | New catalog screen: add, rename and reorder areas and governorates, so missing areas never need a release. |
| API | `listVenues` takes `governorate` and `area`. Areas are validated to belong to the governorate. |
| Web | The search bar has governorate → area (the area list depends on the governorate). "Anywhere in Jordan" is the default. Home texts no longer say "Amman". The venue card shows "area، governorate". The sitemap lists governorate pages. |
| Owner wizard | Governorate → area, plus "My area is not listed" (free text, reviewed by admin). |

## 2. Two interfaces, one account

| Change | Detail |
|---|---|
| Sign-up | A new step after the name: "بدك تحجز وتلعب؟" / "عندك ملعب وبدك تضيفه؟". Stored as `identity.users.preferred_mode` (`player` / `venue`). It only decides where the user lands; it grants nothing. |
| Player interface | Header: discover, my bookings, account. |
| Venue interface | `/manage` gets its own shell (venue switcher, bottom navigation on mobile): today, calendar, bookings, payments to confirm, balance, venue settings. |
| Switch | A clear toggle in the header and in the account page: "وضع اللاعب ⇄ وضع صاحب الملعب". Anyone can switch. A user without a venue who opens venue mode sees "Add your venue" (the wizard). |
| Authorization | Unchanged: venue access still requires an organization membership (ADR-0008). The mode is presentation only. |

## 3. Venue self-registration and review

| Change | Detail |
|---|---|
| Wizard (mobile-first, saved at every step, resumable) | 1. Venue name and description · 2. Governorate, area, address · 3. Map pin (Leaflet + OpenStreetMap tiles, no API key; "use my location") · 4. Photos (existing upload pipeline, re-encoded, location data removed) · 5. Courts (type, sport formats, attributes, combined courts) · 6. Working hours · 7. Prices (per court, with "all courts") · 8. Payment settings: CliQ alias, alias holder name, deposit percentage · 9. Contact phone and WhatsApp · 10. Review and submit |
| Tenancy | Submitting creates the organization with the user as owner, plus the venue in `draft`. "Submit for review" moves it to `submitted` (shown as "قيد المراجعة"). This reuses the existing status machine. |
| Editing while in review | Allowed. The venue stays hidden until approved. |
| Admin review queue | Pending venues, oldest first. Shows the owner name and phone, with **Call** (`tel:`) and **WhatsApp** (`wa.me`) buttons, all wizard data, photos and the map. Approve, or reject with a required reason; the owner sees the reason and can fix and resubmit. Every decision is written to the audit log. |
| Platform settings (admin) | Support WhatsApp number (for "احكي معنا على واتساب"), platform CliQ alias and holder name (for top-ups), default commission, default deposit percentage, low-balance threshold. Every change is audited. |
| Fees | No sign-up fee or subscription. |

## 4. Payments at launch: CliQ directly to the venue

**Abstraction (ADR-0013, ADR-0006).** A `PaymentProvider` interface with `startPayment`,
`submitProof`, `confirm`, `reject`, `expire` and `refundInstructions`. `CliqManualProvider` is the
first implementation. A card gateway adapter can be added later without changing the booking flow.
Each payment attempt is stored in `payment.payments` (provider, amount, currency, status,
reference, receipt media id and timestamps), which is separate from booking status (ADR-0005).

**Player flow**
1. The player taps a time. The slot is held for **30 minutes** (a per-venue setting for CliQ venues; it replaces the current 10 minutes).
2. The checkout shows:
   - the amount due now: the deposit (venue setting, default 20%, rounded to a whole fils) or the full price;
   - the remainder, paid at the venue;
   - the venue's CliQ alias and holder name, with a copy button;
   - a countdown;
   - the steps in simple Arabic: "افتح تطبيق البنك ← CliQ ← حوّل للاسم المستعار ← ارجع هون".
3. The player enters the CliQ reference and/or uploads the receipt. Receipts are private: only the player, that venue's staff and admins can see them. The status becomes "بانتظار تأكيد الملعب".
4. The venue sees it in "Payments to confirm" and on the booking. One tap on "وصلت الدفعة" confirms it: the booking becomes CONFIRMED and the commission is deducted (§5). "Not received" returns the booking to awaiting payment and explains why to the player.
5. Expiry: a hold without a confirmed payment expires at the deadline, and the slot is freed. What happens when the player has already sent proof: see decision D1.

**Other rules**
- No-show: the venue marks it, and the deposit is not refunded.
- Cancellation refunds: see decision D2.
- **Report a problem:** available on bookings (to the player and to the venue) and on top-ups. It creates a case with the type, a message, the booking reference, the CliQ reference and the receipt. The admin disputes list offers filters, a status (open, resolved) and resolution notes. Both sides see the status.
- **Venue notification:**
  - SMS and WhatsApp are not connected yet. Until they are, the dashboard shows a badge and a sound or vibration for pending payments.
  - The venue list refreshes automatically.
  - A console message goes through the outbox. When a provider is chosen, the same events send SMS or WhatsApp.
- **Pay at venue:** see decision D5.

## 5. Commission from a prepaid venue balance

| Change | Detail |
|---|---|
| Ledger (ADR-0006) | Append-only `finance.balance_entries` per organization: `topup` (+), `commission` (−), `commission_reversal` (+), `adjustment` (±, admin, with reason). The balance is the sum of the entries (with a cached balance row, updated in the same transaction). All amounts are in integer fils. |
| Commission | Default 8% of the **booking price** (see D3), configurable per venue in admin, rounded half-up once. It is charged exactly once, in the same transaction that confirms the payment (idempotent per booking). |
| Top-up | The venue opens "Top up balance" and sees the platform CliQ alias. It enters the amount and CliQ reference and uploads the receipt. The top-up waits for review. The admin approves it (the balance is credited) or rejects it with a reason. |
| Low balance | Below the threshold (see D4): a banner in the venue interface, plus an outbox event. At zero or below, the venue is hidden from search and cannot take new online bookings. Its manual bookings and existing bookings keep working. It becomes visible again as soon as a top-up is approved. |
| Admin | Balances for every venue (with low and empty filters), pending top-ups with the receipt, history (top-ups, deductions, reversals, adjustments), manual adjustment with a reason. Everything is audited. |
| Venue | Balance page: current balance, history, top-up requests and their status. |

## 6. Card payments later

The `PaymentProvider` interface covers redirect or hosted checkout plus webhooks. The adapter will
add signature verification, idempotent webhook handling and reconciliation. The questions to ask a
Jordanian gateway are in Appendix B.

## 7. Delivery phases (each: tests → staging → short Arabic summary)

| Phase | Content |
|---|---|
| P1 | Jordan-wide geography (§1) + admin area management |
| P2 | Two interfaces, sign-up question, mode switch, venue shell (§2) |
| P3 | Venue wizard, review queue with call/WhatsApp, platform settings, "chat with us" button (§3) |
| P4 | Payment abstraction + CliQ flow + receipts + venue confirmation + expiry + disputes (§4) |
| P5 | Prepaid balance, commission, top-ups, hiding, admin finance pages (§5) |
| P6 | Gateway questions document (Appendix B), docs/ADRs, full end-to-end run on staging |

**Tests:**
- property tests for commission rounding and ledger sums;
- concurrency tests: double confirmation, confirmation racing expiry, commission charged once;
- RLS and tenancy tests for receipts and balances;
- end-to-end in Arabic on mobile: wizard → approval → CliQ booking → venue confirmation → balance deduction.

**New ADRs:**
- CliQ direct-to-venue payments;
- the prepaid commission ledger;
- private receipt storage;
- self-registration (this reverses the earlier decision that admins create venues).

## 8. Decisions needed from the owner

- **D1 — The player sent proof but the venue did not confirm within 30 minutes.**
  **Decided: (b)** Once proof is sent, the venue gets 30 more minutes; after that it expires and a
  dispute opens automatically.
- **D2 — The player cancels before the free-cancellation deadline, after paying the deposit.**
  **Decided:** (a) The venue must refund by CliQ. The platform shows "refund due" until the venue
  marks it refunded. **Escalation (owner's addition):** if the venue has not marked it refunded
  within **48 hours** of the cancellation, the venue is hidden from search until it does, and an
  alert appears in admin (a dedicated "refunds overdue" list, plus an outbox event for a future
  notification channel).
- **D3 — Commission base and refunds.**
  **Decided: (a)** 8% of the full booking price. It is returned to the balance if the venue
  cancels, or if the player cancels within the free window. It is kept on no-shows and late
  cancellations.
- **D4 — Low balance.** **Decided:** warn below 10 JOD. Allow the booking that takes the balance
  below zero, then hide the venue (never block a player mid-payment).
- **D5 — Pay at venue without any deposit.**
  **Decided: (b)** Removed. Every online booking needs a CliQ payment.
- **D6 — Commission on bookings the venue adds itself (phone or walk-in).**
  **Decided: (a)** No commission.

## Appendix A — Governorates and main areas (editable later from admin)

| Governorate | Main areas |
|---|---|
| Amman | Existing 12 (Abdoun, Sweifieh, Khalda, Dabouq, Jubeiha, Shmeisani, Tla' Al-Ali, Marj Al-Hamam, Abu Nseir, Um Uthaina, Airport Road, Tabarbour) + Jabal Amman, Wadi As-Seer, Sweileh, Marka, Khirbet Souq, Sahab, Al-Muqabalain, Naour |
| Irbid | Irbid city, University Street, Al-Husn, Ramtha, Bani Kinanah, Al-Koura, Al-Mazar Al-Shamali, Al-Taybeh, Northern Jordan Valley |
| Zarqa | Zarqa city, New Zarqa, Russeifa, Al-Hashemiyya, Al-Dhlail, Azraq, Birain |
| Aqaba | Aqaba city, South Beach, Al-Quwayrah, Wadi Araba |
| Balqa | Salt, Fuheis, Mahis, Ain Al-Basha, Deir Alla, Southern Shouneh |
| Madaba | Madaba city, Dhiban, Mleih |
| Jerash | Jerash city, Souf, Al-Mastaba |
| Ajloun | Ajloun city, Anjara, Kufranjah |
| Karak | Karak city, Mutah, Al-Mazar Al-Janoubi, Al-Qasr, Ghor Al-Safi |
| Mafraq | Mafraq city, Al-Khaldiyya, Sama Al-Sirhan, Northern Badia |
| Tafilah | Tafilah city, Busayra, Al-Hasa |
| Ma'an | Ma'an city, Petra (Wadi Musa), Shoubak, Al-Husseiniyya |

## Appendix B — Questions for a Jordanian card gateway

1. **Licensing and model:** Can you serve a marketplace where the customer pays the venue, not us? Do you support split payments or sub-merchants (each venue a sub-merchant, with our commission split at payment time)? What licence or registration do we need for that (CBJ rules)?
2. **Settlement:** Who receives the money and when (T+1, T+2)? Can you settle directly into each venue's bank account? Is there a minimum settlement amount?
3. **Fees:** Setup fee, monthly fee, per-transaction percentage and fixed fee, split fee, refund fee, chargeback fee, currency conversion fees for foreign cards. Are there volume tiers?
4. **Methods:** Visa/Mastercard (local and foreign), Apple Pay and Google Pay, CliQ collection, eFAWATEERcom. Do you support 3-D Secure? Do you support tokenisation for saved cards?
5. **Technical:** Hosted checkout or embedded fields (so card data never touches our servers and our PCI scope stays SAQ-A)? Signed webhooks with retries? A sandbox? Idempotency keys? Partial refunds and refunds after settlement? Authorisation-then-capture (to hold a slot)? Is there an API to create sub-merchants?
6. **Documents:** What do you need from us (commercial registration, owner ID, bank letter, website terms and privacy policy)? What do you need from each venue as a sub-merchant? How long does onboarding take?
7. **Risk:** Rolling reserve or deposit requirements? Chargeback process and deadlines? Limits per transaction or per day?
8. **Support:** Arabic support, SLA, and who handles disputes with cardholders?
