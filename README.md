# Tire Grip

Mobile-first SaaS za zakazivanje zamene guma kod vulkanizera: kupac kroz chat sa dugmićima izabere uslugu, vidi cenu i slobodan termin, a vulkanizer potvrdi zahtev iz admin panela (wa.me / Viber link).

**Stack:** Next.js 16 · TypeScript · PostgreSQL 16 · Drizzle ORM · Tailwind 4 · Vitest · hosting: Hetzner + Coolify

## Pokretanje lokalno

```bash
cp .env.example .env
pnpm install
pnpm db:up                 # Postgres u Dockeru
pnpm db:generate           # prva migracija iz src/db/schema.ts
pnpm drizzle-kit generate --custom --name=booking_no_overlap
#   → u generisani SQL fajl nalepi sadržaj drizzle/custom/0001_booking_no_overlap.sql
pnpm db:migrate
pnpm db:test               # testovi ograničenja baze (rollback, bezbedno)
pnpm db:seed               # demo radnja "Brzi Točak" → /brzi-tocak
pnpm dev
```

## Model podataka (korak 1)

| Tabela | Šta čuva |
|---|---|
| `shops` | radnja (tenant): slug za link, broj dizalica (`bays`), korak termina, horizont zakazivanja, auto-potvrda |
| `shop_members` | ko upravlja radnjom (vlasnik/radnik) — povezuje se sa auth tabelama u koraku auth |
| `services`, `service_prices` | usluge i cena/trajanje po tipu vozila (putničko / SUV / kombi) |
| `working_hours` | nedeljno radno vreme, više intervala po danu (pauza za ručak) |
| `schedule_exceptions` | praznici i posebno radno vreme za datum |
| `blocked_times` | ručno blokirano vreme (jedna ili sve dizalice) |
| `customers`, `vehicles` | klijenti radnje (telefon u E.164, jedinstven po radnji), saglasnost za podsetnike, vozila |
| `bookings` | rezervacije: snapshot cene/trajanja, dizalica, status, izvor |
| `tire_storage` | hotel za gume |
| `reminder_campaigns`, `reminder_messages` | sezonski podsetnici sa personalizovanim linkom (`/r/{token}`) |

### Garancije na nivou baze

- **Nema duplih termina:** svaka rezervacija zauzima jednu dizalicu; exclusion constraint `bookings_no_overlap` zabranjuje preklapanje aktivnih rezervacija na istoj dizalici. Otkazane/odbijene ne blokiraju termin, a uzastopni termini (10:00–10:30, 10:30–11:00) su dozvoljeni.
- **Izolacija radnji:** deca referenciraju roditelje kompozitnim ključem `(shop_id, id)`, pa rezervacija ne može da pokazuje na klijenta, vozilo ili uslugu druge radnje.
- **Istorija je zaštićena:** usluga ili vozilo sa rezervacijama ne može da se obriše (deaktivira se), cene se čuvaju kao snapshot u rezervaciji.

Sve ovo pokriva `tests/db/constraints.sql`.
