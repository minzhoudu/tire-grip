# Tire Grip

Mobile-first SaaS za zakazivanje zamene guma kod vulkanizera: kupac kroz chat sa dugmićima izabere uslugu, vidi cenu i slobodan termin, a vulkanizer potvrdi zahtev iz admin panela (wa.me / Viber link).

**Stack:** Next.js 16 · TypeScript · PostgreSQL 16 · Drizzle ORM · Tailwind 4 · Vitest · hosting: Hetzner + Coolify

## Pokretanje lokalno

```bash
cp .env.example .env
pnpm install
pnpm db:up                 # Postgres u Dockeru
pnpm db:setup              # primenjuje migracije iz drizzle/ (uključujući pravilo protiv duplih termina)
pnpm db:test               # testovi ograničenja baze (rollback, bezbedno; traži psql)
pnpm db:seed               # demo radnja "Brzi Točak" → /brzi-tocak
pnpm dev
```

### Promena šeme baze

1. Izmeni `src/db/schema.ts`
2. `pnpm db:generate`: pravi novu migraciju u `drizzle/` (pregledaj SQL pre commita)
3. `pnpm db:setup`: primenjuje je na lokalnu bazu, bez brisanja podataka
4. Commit-uj `drizzle/` zajedno sa izmenom šeme (CI pada ako migracija fali)

Ne koristi `drizzle-kit push`: na bazi sa podacima pokušava da obriše i ponovo napravi kompozitna ograničenja i pada. Pravila koja Drizzle ne ume da izrazi (npr. `bookings_no_overlap`) idu u ručnu migraciju: `pnpm drizzle-kit generate --custom --name=ime`.

`pnpm db:reset` **briše lokalnu bazu** i pravi je ispočetka iz migracija, sa demo podacima.

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

- **Nema duplih termina:** svaka rezervacija zauzima jednu dizalicu; exclusion constraint `bookings_no_overlap` (migracija `drizzle/0001_booking_no_overlap.sql`) zabranjuje preklapanje aktivnih rezervacija na istoj dizalici. Otkazane/odbijene ne blokiraju termin, a uzastopni termini (10:00–10:30, 10:30–11:00) su dozvoljeni.
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

## Admin panel za vulkanizera (korak 4)

`/admin` (prijava na `/prijava`). Javna registracija je isključena, a nalog pravi:

```bash
# u .env: BETTER_AUTH_SECRET (openssl rand -base64 32) i BETTER_AUTH_URL=http://localhost:3000
pnpm admin:create pera@example.rs 'bar-10-karaktera' "Pera" brzi-tocak        # vlasnik
pnpm admin:create radnik@example.rs 'bar-10-karaktera' "Mika" brzi-tocak staff # radnik
```

- **Zahtevi** (`/admin/{slug}`): predstojeći termini po danima, osvežavaju se sami na 30 s. Akcije: Potvrdi / Odbij (novi), Završeno / Otkaži / Nije došao (potvrđeni). Posle potvrde, odbijanja ili otkazivanja dobija se dugme „Pošalji na WhatsApp“ sa gotovom porukom kupcu (odbijanje i otkazivanje sadrže link za novi termin). Istorija pokazuje poslednjih 60 dana.
- **Novi termin** (`/admin/{slug}/novi`): za kupce koji zovu. Isti engine i ista zaštita od preklapanja, ali bez minimalne najave, do 120 dana unapred, odmah potvrđeno.
- **Blokade** (`/admin/{slug}/blokade`): pauza ili kvar dizalice; kupci tada ne vide te termine. Postojeći termini se ne pomeraju, ali panel upozori koliko ih ima u tom periodu.
- **Podešavanja** (`/admin/{slug}/podesavanja`, samo vlasnik): podaci radnje, pravila zakazivanja (broj dizalica, korak termina, horizont, minimalna najava, auto-potvrda), radno vreme po danima (više intervala za pauzu), praznici/posebno radno vreme i usluge sa cenama po tipu vozila (dodavanje, izmena, uključi/isključi, redosled). Granični slučajevi: smanjenje broja dizalica je blokirano dok postoji zakazan termin na dizalici koja bi nestala; kraće radno vreme se snimi, ali panel upozori i izlista pogođene termine (ne pomeraju se automatski); usluga sa bilo kojom rezervacijom (i prošlom) ne može da se obriše, samo isključi. Šema baze se ne menja za ovaj ekran.

Bezbednost: svaka admin stranica i svaka server action proverava da je korisnik član radnje iz URL-a (`requireShopAccess`), a svi upiti su ograničeni na tu radnju. Stranica podešavanja dodatno traži `requireOwnerAccess` (404 za radnike). Promena statusa je uslovni `UPDATE … WHERE status IN (…)`, pa dva telefona ne mogu da je primene dvaput. Prijava ide preko Better Auth HTTP endpointa, zbog ugrađenog ograničenja broja pokušaja.

Testovi: `tests/booking-status.test.ts`, `tests/admin.int.test.ts` (prijava, statusi, istorija, ručni unos, blokade, izolacija radnji) i `tests/settings.int.test.ts` (podešavanja: granični slučajevi oko dizalica, radnog vremena i brisanja usluga).

## Platforma (korak 5)

**Javna registracija** (`/registracija`): nova radnja se sama prijavi (naziv, adresa/slug sa proverom dostupnosti uživo, podaci vlasnika, telefon). Nalog se odmah pravi i vlasnik se uloguje, ali radnja ide u stanje `pending` (`shops.signup_status`) — `/admin` prikazuje da čeka pregled umesto panela, dok je ne odobri vlasnik platforme. Naplata je za sada ručna (plan se menja iz `/platforma`, bez integracije sa platnim provajderom); `/` je javna početna strana sa objašnjenjem i pozivom na registraciju.

**`/platforma`** — dashboard vlasnika platforme (ne vlasnika radnje): pregled svih radnji, odobravanje/odbijanje novih registracija, suspenzija, ručna promena plana i „Uđi kao" (impersonacija) za podršku — vremenski ograničena (1h) sesija bez diranja `shop_members`, vidljiva vlasniku radnje kao baner sa dugmetom za prekid. Pristup preko `PLATFORM_ADMIN_EMAILS` u `.env` (lista email adresa odvojenih zarezom — nema posebne kolone u bazi, namerno, da se ne može eskalirati kroz app bug). Svaka akcija (odobrenje, suspenzija, promena plana, ulazak/izlazak iz impersonacije) se beleži u `platform_audit_log`.

Testovi: `tests/platform.int.test.ts` (dashboard, suspenzija, plan, impersonacija) i `tests/signup.int.test.ts` (registracija, duple adrese/emailovi, slaba lozinka).

## Deploy

### Za početak, besplatno: Vercel + Neon

`vercel.json` postavlja build komandu na `pnpm db:setup && pnpm build`, pa se migracije primenjuju pri svakom deploy-u automatski — nema potrebe za serverom, terminalom ni Docker-om.

1. [neon.tech](https://neon.tech) → novi projekat → kopiraj **pooled** connection string (sa `-pooler` u hostname-u — serverless funkcije otvaraju mnogo kratkih konekcija, samo pooler to podnosi).
2. [vercel.com](https://vercel.com) → Add New Project → uvezi `tire-grip` GitHub repo.
3. Project Settings → Environment Variables, isto kao `.env.example`:
   - `DATABASE_URL` — pooled niska iz koraka 1
   - `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
   - `BETTER_AUTH_URL` — Vercel-ov URL aplikacije (npr. `https://tire-grip.vercel.app`, ili sopstveni domen)
   - `PLATFORM_ADMIN_EMAILS` — email vlasnika platforme
4. Project Settings → General → Node.js Version: **22.x**.
5. Deploy. Prvi nalog preko `/registracija` (javna, pravi i radnju i vlasnika).

### Kasnije, sopstveni server: Hetzner + Coolify

`Dockerfile` pravi jednu runtime sliku (ne samo `.next/standalone`) — zadržava ceo `node_modules` da bi Coolify-jeva komanda posle deploy-a mogla da pokrene `pnpm db:setup` (i `pnpm admin:create`/`pnpm db:seed` po potrebi) u istom kontejneru. Ima smisla kad se pređe na naplatu i poželi se kontrola nad infrastrukturom — do tad Vercel+Neon ne traže ni karticu.

Promenljive okruženja na aplikaciji u Coolify-ju (isto kao u `.env.example`, samo bez fajla):
- `DATABASE_URL` — interna konekcija ka Postgres servisu u Coolify-ju (ne izlaže se javno)
- `BETTER_AUTH_SECRET` — `openssl rand -base64 32`, čuva se stabilno (ne menja se posle prvog deploy-a)
- `BETTER_AUTH_URL` — javni URL aplikacije, npr. `https://app.example.rs`
- `PLATFORM_ADMIN_EMAILS` — email vlasnika platforme

Post-deployment Command u podešavanjima aplikacije: `pnpm db:setup` (primeni migracije pri svakom deploy-u).

Prvi nalog: ili `/registracija` (javna, pravi i radnju i vlasnika), ili `pnpm admin:create` kroz Coolify-jev terminal za konkretnu radnju (npr. posle `pnpm db:seed` za demo radnju).
