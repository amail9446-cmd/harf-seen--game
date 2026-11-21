# سباق سورة العصر — تسميع ذكي

The game's design stays as published. Only the judging was replaced: the old browser speech recognition is gone, and a real recitation grader (Nabr, by qurani.ai) now decides. It reads Hafs an Asim.

## Why a backend is needed
- Nabr's API key must never sit in browser code.
- Nabr's offline endpoint (`POST https://api.qurani.ai/gw/qrc/offline`) does not accept audio bytes. It takes a **public `audio_url`** and downloads the recording itself. So we need our own server: it receives the child's recording and gives Nabr a one-time link to it.
- The docs say audio sent to the offline endpoint is **not** used to train the model. Recordings sent over the WebSocket can be, unless "Help improve Nabr" is switched off in the dashboard. That is why we use the offline endpoint.

## Flow
1. The sheikh recites (the existing `aud/` files) → the audio is stopped completely (`pause` + clearing `src`) → only then does the mic open, and the first 250 ms are skipped.
2. The child repeats → the recording is converted in the browser to 16 kHz mono WAV → it goes to `/api/evaluate` on our server.
3. The server checks the format and measures sound quality. If the audio is silent or too short → neutral, without calling the service.
4. The server keeps the audio **in memory only** behind a 48-hex-character link that expires in 3 minutes. It calls Nabr with `tajweed_level=1`, then deletes the audio as soon as the reply arrives. Nothing is written to disk.
5. The reply becomes a light:

| Light | When |
|---|---|
| 🟢 Green | `exit_code` 6 or 8, **every** word of the requested ayat is in `confirmed_words`, and no mistake in any aspect the teacher chose |
| 🔴 Red | The service reported something: `skipped_words`, `substituted_words`, `letter_mistakes`, or `tajweed_mistakes` (for the codes the teacher selected) |
| ⚪ Neutral | Unclear or silent audio, any other `exit_code`, an incomplete result (unexamined words with no mistakes ≠ correct), or a service error, timeout, or missing key |

## The three aspects and what the service actually supports
1. **Words, order, omissions:** `skipped_words`, `substituted_words`, and a check that every word was covered.
2. **Harakat and pronunciation:** `letter_mistakes` (`letters_mismatch`, `letters_extra`, `letters_missed`, `tadeef_extra`, `tadeef_missed`).
3. **Tajweed:** `tajweed_mistakes` (ghunna, qalqala, iqlab, idgham, ikhfa, tafkhem, madd...).

Honest limits, from the official docs:
- The service has **no separate makharij list**. Errors between nearby makharij come under `letters_mismatch` in aspect 2.
- The docs say the tajweed and phonetic rules are "under continuous evaluation" and that not every case gets reported.
- **No confidence score is returned.** The panel shows only how complete the result is and measured audio quality. It invents no percentage.

## Teacher panel `/teacher.html`
- Choose the aspects and the counted codes.
- **Reference test:** the sheikh's recitation (expected green) plus deliberately mismatched recordings (expected not green).
- **A real labelled recording** ("correct" or "deliberate mistake") made with the mic.
- **Automatic lights stay off** until at least one real correct recording comes out green **and** one real wrong recording comes out red. Until then the game uses the teacher's manual judging, and the results appear in the panel.
- The last 50 attempts, with no audio and no names (memory only).

## Running it
```bash
cd quran-tasmee
cp .env.example .env   # fill in the values (don't commit it)
set -a; . ./.env; set +a
npm start              # http://localhost:8787  and the panel at /teacher.html
npm test               # unit and integration tests (a local mock in place of Nabr — not a test of grading accuracy)
```
It needs Node 20 or newer and has no npm dependencies. It must be served over **HTTPS** at a public address (Render, Railway, Fly, or a VPS), because:
- the browser only allows the mic over HTTPS;
- Nabr has to download the clip from `PUBLIC_BASE_URL`. On `localhost`, use a tunnel such as `cloudflared` or `ngrok`.

## Settings you need to provide
| Variable | Source |
|---|---|
| `NABR_API_KEY` | The qurani.ai / Nabr dashboard (paid subscription) |
| `PUBLIC_BASE_URL` | The server's public HTTPS address |
| `TEACHER_PIN` | A code of 6+ characters for the panel |

Also make sure to:
- Agree with Nabr on retention and deletion terms for children's recordings. Their privacy policy leaves this to the customer agreement.
- Get parents' consent before using the service.
