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

## Slobodni termini (korak 2)

`src/lib/availability/` je čista logika bez baze i bez zavisnosti, pokrivena testovima u `tests/availability.test.ts` (`pnpm test`).

- `getDayAvailability` daje sve početne termine za dan, uz oznaku slobodno/zauzeto (zauzeti se prikazuju precrtano) i slobodne dizalice
- `listBookableDays` daje dane koji imaju bar jedan slobodan termin, za chipove „Danas / Sutra / sub 24.10.“
- `getOpenStatus` daje stanje za baner „Radimo do 17h“ ili „Otvaramo u pon u 08:00“
- `findFreeBay` služi za ponovnu proveru pri upisu rezervacije
- `resolveOffer` daje cenu i trajanje usluge za tip vozila

Pravila: izuzetak za datum zamenjuje nedeljno radno vreme; usluga mora da stane u jedan interval (pauza za ručak); mreža termina kreće od otvaranja na svakih `slot_step_min`; ne nude se termini pre `min_notice_min` ni van `booking_horizon_days`; termin je slobodan ako bar jedna dizalica nema preklapanje, a blokada bez dizalice zauzima sve. Vreme se računa u zoni radnje, ispravno i preko promene letnjeg računanja vremena.

## Chat za kupca (korak 3)

Javna stranica radnje: `/{slug}` (demo posle `pnpm db:seed`: `http://localhost:3000/brzi-tocak`).

Tok: usluga → vozilo → dan → termin → podaci → potvrda. Ako usluga ima cenu samo za jedan tip vozila, pitanje o vozilu se preskače.

- `src/lib/booking/flow.ts`: state machine kao čist reducer; događaji koji ne pripadaju trenutnom koraku se ignorišu (dupli tap, stara dugmad)
- `src/app/[slug]/actions.ts`: server actions `getDaysAction`, `getSlotsAction`, `submitBookingAction`; svaki ulaz se validira (Zod)
- `src/server/bookings.ts`: `createBookingRequest` ponovo proverava termin istim engine-om, pa u jednoj transakciji upisuje klijenta (po telefonu), vozilo i rezervaciju na prvu slobodnu dizalicu. Ako je dizalicu u međuvremenu uzeo drugi zahtev, baza odbija upis (`23P01`) i pokušava se sledeća; ako nijedna nije slobodna, ništa se ne upisuje i kupac bira drugi termin
- Telefon se čuva u E.164 (`064 123 4567` → `+381641234567`)
- Saglasnost za podsetnike je checkbox koji je podrazumevano isključen
- Posle slanja kupac može jednim klikom da prosledi zahtev radnji na WhatsApp (dok ne napravimo admin panel)

Testovi: `tests/booking-flow.test.ts`, `tests/phone-and-messages.test.ts`, `tests/booking-request.test.ts` i integracioni `tests/booking.int.test.ts`, koji radi nad pravom bazom ako je postavljen `DATABASE_URL` (pravi sopstvenu probnu radnju i briše je na kraju).
