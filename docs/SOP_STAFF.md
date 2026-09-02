# Daily routine for reception staff

How to work the **To Do** tab in the clinic CRM sheet so fewer patients miss their
appointment.

The AI front desk books, moves and cancels appointments on its own. It does **not** send
reminders. That part is yours, and this is how it works.

---

## The short version

1. Open the **To Do** tab. Sort by **Date**.
2. Find the appointments happening **tomorrow**. Message each patient. Tick **1st reminder**.
3. Next morning, find the appointments happening **today**. Message each one. Tick
   **2nd reminder**.
4. Done. Two ticks per patient, one the day before, one on the day.

Twice a day is enough: once in the late afternoon, once first thing in the morning.

---

## Reading a row

Every time the front desk books an appointment, it drops one row here automatically.

| Column | What it means |
|---|---|
| **Date** | When the appointment is. **This is the appointment time, not when the row appeared.** Sort by this. |
| **Patient** | Who to message |
| **Phone** | Their mobile |
| **What they need** | `Appointment reminder` for these rows |
| **Details** | The service, and which channel they booked through |
| **Priority** | `Normal` for reminders |
| **Status** | `Open`. Change it to `Done` once the appointment has happened |
| **Notes** | Yours. Write anything useful here |
| **1st reminder** | Tick after you send the day-before reminder |
| **2nd reminder** | Tick after you send the morning-of reminder |

**Only tick the box after you have actually sent the message.** The boxes are the record of
what has been done. Nothing ticks them automatically, and nothing checks them. If a box is
empty, the assumption is that nobody reminded that patient.

Rows that say something other than `Appointment reminder` in **What they need** are not
reminders. Those are problems the AI could not handle and needs a person for. **Deal with
those first.**

---

## What to send

Use the channel they booked through, shown in **Details**. If they came through Facebook,
reply on Facebook. Phoning is fine too if that is easier.

**Day before (tick `1st reminder`)**

> Hi {name}! Reminder of your {service} appointment at {clinic} tomorrow, {day} at {time}.
>
> If anything changes, just message us here.
>
> See you soon!

**Morning of (tick `2nd reminder`)**

> Hi {name}! Just a reminder, your {service} appointment at {clinic} is today at {time}.
>
> See you soon!

Fill in the braces from the row. Keep it short and friendly. No need to ask them to confirm.

---

## When a patient wants to move or cancel

**Ask them to message the clinic, and let the front desk handle it.**

Do not edit the appointment in Google Calendar yourself. The AI reads the calendar to find
appointments, and a hand-edited entry can leave it unable to find the booking later, which
breaks reschedules and cancellations for that patient.

Message the clinic page, let the bot do it, and the calendar stays correct.

---

## Tidying the list

**Rows starting `MOVED - ` in Details.** That patient rescheduled. There is now a newer row
with the correct time. Delete the older row so nobody gets reminded about an appointment that
is no longer happening.

**Cancelled appointments.** The row stays on the list even after a cancellation. Check the
**Bookings** tab, which records every booking as `Confirmed`, `Rescheduled` or `Cancelled`. If
the latest entry for that patient says `Cancelled`, delete the To Do row.

**Past appointments.** Once an appointment has happened, set **Status** to `Done` or delete
the row, so the list only shows what is still ahead.

---

## Things worth knowing

- **A booking made today for tomorrow still needs its day-before reminder.** It appears on the
  list the moment it is booked, so check for new rows rather than assuming the list is the
  same as it was this morning.
- **The row appears when the appointment is booked**, which may be weeks ahead. That is
  normal. Sort by **Date** and only work the ones coming up.
- **Appointments booked before this system started have no row.** Add them by hand if you want
  them tracked.
- **The Bookings tab is the source of truth** for what was booked, moved or cancelled. The To
  Do tab is a working checklist, so it is safe to delete rows from it.

---

## When the bot gets something wrong

It will occasionally. Tell whoever maintains the system, and include:

- what the patient wrote, word for word
- what the bot replied
- what should have happened

Most mistakes trace back to something missing from the knowledge base rather than a broken
workflow, and that is quick to fix once someone knows which question caused it.

If a patient reports a booking that is not in the calendar, **trust the calendar**. Book them
in by hand, then report it.
