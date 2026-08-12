# GAME SCORE v59 — ONLINE + QR

Questa cartella è pronta per diventare la versione online di GAME SCORE.

## Cosa è già implementato

- La v58 completa rimane la base dell'app.
- L'host continua a gestire normalmente i punteggi.
- Pulsante flottante **QR GIOCATORI** quando è aperta una partita.
- Creazione di una stanza online con codice casuale.
- QR automatico verso la modalità giocatore.
- Modalità giocatore/spectator senza pulsanti amministrativi.
- Aggiornamenti live tramite Supabase Realtime Broadcast.
- Recupero dello stato dal database ogni volta che un giocatore apre il link.
- Polling di sicurezza ogni 12 secondi in caso un browser mobile perda un evento live.
- L'host secret rimane nel browser dell'host e non viene messo nel QR.
- Nel database viene salvato solo l'hash SHA-256 del secret dell'host.
- Il database non è direttamente leggibile/scrivibile dal ruolo anon: il client usa RPC controllate.

## 1. Crea Supabase

Crea un nuovo progetto Supabase.

Apri **SQL Editor**, crea una query nuova e incolla tutto il contenuto di:

`SUPABASE_SETUP.sql`

Esegui la query.

## 2. Configura il progetto

Apri:

`online-config.js`

Inserisci:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `APP_PUBLIC_URL`

Usa la **Publishable Key / anon key destinata al browser**.
Non inserire mai la `service_role`.

Esempio:

```js
window.GS_ONLINE_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_...",
  APP_PUBLIC_URL: "https://gamescore-production.up.railway.app"
};
```

## 3. GitHub

Carica l'intera cartella nel repository GitHub.

I file importanti per Railway sono già inclusi:

- `package.json`
- `server.js`
- `railway.json`

Non è necessario installare librerie Node.

## 4. Railway

Crea un progetto Railway dal repository GitHub.

Railway eseguirà:

`node server.js`

Quando Railway ti assegna il dominio pubblico, copialo in `APP_PUBLIC_URL` dentro `online-config.js` e fai un nuovo commit/deploy.

## 5. Come funziona durante una partita

1. L'host crea la partita normalmente.
2. Compare **QR GIOCATORI**.
3. L'host apre il QR.
4. Alla prima apertura viene creata la stanza Supabase.
5. I giocatori scansionano il QR.
6. Sul loro telefono appare solo la classifica live.
7. Ogni salvataggio dell'host aggiorna database + Broadcast.
8. Chi torna sull'app dopo una sospensione recupera automaticamente lo stato dal database.

## Sicurezza

La modalità giocatore non riceve l'host secret.

Il QR contiene soltanto il codice stanza.

Gli aggiornamenti al database passano dalla funzione `gs_update_room`, che controlla l'hash del secret dell'host.

`SUPABASE_SETUP.sql` revoca l'accesso diretto alla tabella per `anon` e `authenticated`.

## Nota Hall of Fame

La Hall of Fame della v59 rimane quella persistente dell'host già presente nella v58. La stanza online condivide la partita live. Un eventuale profilo/account host con Hall of Fame cloud potrà essere aggiunto in un secondo passaggio senza modificare il QR dei giocatori.


## V84 — Host multi-dispositivo

La V84 permette di iniziare una partita su PC e riprenderla come HOST su iPhone (o viceversa).

1. Esegui **SUPABASE_V84_HOST_MULTI_DISPOSITIVO.sql** una sola volta nel SQL Editor di Supabase.
2. Pubblica la V84.
3. Sul dispositivo che crea la partita, apri **QR GIOCATORI**: troverai anche il **Codice Host personale**.
4. Sul secondo dispositivo apri GAME SCORE normalmente, premi **GESTISCI / COLLEGA HOST ONLINE** e inserisci quel codice una sola volta.
5. Da quel momento la Home mostrerà automaticamente le partite online in corso e potrai premere **CONTINUA** per diventare HOST su quel dispositivo.

Il QR giocatori resta separato: chi lo scansiona entra solo come spettatore.
