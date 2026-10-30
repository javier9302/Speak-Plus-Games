# Lantern Island (and Speak Plus City) on Render + Supabase

With this setup, Lantern Island runs on the internet. Students scan the QR code and join with their phone's **mobile data**: no school Wi-Fi, no hotspot.

- **Render** runs the game server (free plan to start).
- **Supabase** keeps the saves: groups, islands, cards you make (free plan). Render's free plan forgets its files on every restart, so the saves can't live there.

Time needed: about 30 minutes, once. After that, every push to `main` on GitHub updates the game by itself.

---

## 0. Make the GitHub repository private (do this first)

The repository `javier9302/Speak-Plus-Games` is **public** right now. It contains the fan-art characters (`public/shared/heroes.js`), which must never be published.

GitHub → the repository → **Settings** → **General** → at the bottom, **Danger Zone** → **Change repository visibility** → **Make private**.

Render works with private repositories (step 2 gives it access).

## 1. Supabase: a place for the saves

1. Go to <https://supabase.com>, sign up (GitHub login works), **New project**.
   - Name: `lantern-island`. Database password: make one up and keep it (the game doesn't need it).
   - **Region: Northeast Asia (Tokyo)**.
2. When the project is ready: left menu **SQL Editor** → **New query** → paste the whole file `lantern-island/supabase/schema.sql` → **Run**. It should say "Success". Running it again is safe.
3. Left menu **Project Settings** → **API Keys**. Copy two things somewhere safe:
   - the **Project URL** (like `https://abcdefgh.supabase.co`; it's also under **Project Settings → Data API**)
   - the **`service_role`** key (on the **Legacy API keys** tab; press *Reveal*). This is the secret key. **Never** put it in a file, a chat or a page; only in Render (step 2).

> Free plan: Supabase pauses a project after **7 days with no use**. With a weekly class that's borderline. If the game says "Supabase did not answer", open the Supabase dashboard and press **Restore project**. Playing or opening the teacher panel once a week keeps it awake.

## 2. Render: the game server

1. Go to <https://render.com>, sign up **with GitHub**. When it asks, give it access to the `Speak-Plus-Games` repository.
2. **New +** → **Blueprint** → choose `Speak-Plus-Games`. Render reads `render.yaml` from the repository and shows one service, **lantern-island**, in Singapore, on the free plan.
3. It asks for three values:

   | Setting | What to type |
   | --- | --- |
   | `TEACHER_PIN` | A PIN you choose, e.g. `4821`. The host screen and teacher panel ask for it. |
   | `SUPABASE_URL` | The Project URL from step 1 |
   | `SUPABASE_SERVICE_KEY` | The `service_role` key from step 1 |

4. **Apply**. The first build takes a few minutes. When the service shows **Live**, its address is at the top, like `https://lantern-island-xxxx.onrender.com`.

You don't need to set `PUBLIC_URL`: the game uses Render's address by itself, and the QR code points there.

## 3. Try it before class

1. On the laptop, open `https://<your address>/host/` and type the PIN.
2. Scan the QR code with your phone **with Wi-Fi switched off** (mobile data only). You should join the lobby.
3. Teacher panel: `https://<your address>/teacher/` (same PIN). Make a test group, then check in Supabase → **Table Editor** → `li_groups` that it's there.

## In class

- **Free plan:** the server sleeps after 15 minutes without use and takes **about a minute to wake up**. Open the host screen a couple of minutes before the lesson. Once it's open, it stays awake.
- Students only need the QR code (or the address + room code). Each phone uses very little data.
- A student without mobile data still needs Wi-Fi or your hotspot.
- **Characters:** online, everyone plays as the original **Islander** and the "choose a character" button is hidden. The fan-art characters are still there when you run the game on your own laptop (`npm start`), for classroom use only.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| The page takes a minute to open | Normal on the free plan: the server is waking up. |
| "Supabase did not answer" / "project is paused" | Supabase dashboard → **Restore project**. |
| "missing tables … schema.sql" | Step 1.2 wasn't done (or failed): run `supabase/schema.sql` again. |
| "wrong key" | `SUPABASE_SERVICE_KEY` is not the `service_role` key. Render → lantern-island → **Environment**, fix it, **Save** (it restarts). |
| Forgot the PIN | Render → lantern-island → **Environment** → `TEACHER_PIN`. |
| Movement feels slow | Check the region is Singapore. Render's paid **Starter** plan also removes the sleep. Change `plan: free` to `plan: starter` in `render.yaml`, or change it in the Render dashboard. |

## Speak Plus City online (phones)

`render.yaml` also has a second service, **speak-plus-city**, so students can play Speak Plus City with their phones from anywhere. It needs no settings and no Supabase: the game is saved in the teacher's browser.

- If you create the Blueprint after this was added, Render creates both services at once.
- If you already created it with only Lantern Island: Render → **Blueprints** → your blueprint → **Manual sync** (or wait for the next push to `main`). Render shows the new service; approve it.
- Its address is like `https://speak-plus-city-xxxx.onrender.com`. Open `/teacher.html` on the laptop, **Open board window**, tick **Play with phones** on the setup screen, and students scan the QR code on the board.
- Same free-plan rule: open the teacher page a couple of minutes before class so it's awake. Render's free plan gives 750 hours a month per account, shared by both games; sleeping services don't use them.

## Updating the game

Every push to `main` makes Render rebuild and restart the game (a minute or two). Saves are in Supabase, so nothing is lost. Avoid pushing during a lesson: the restart disconnects the phones for a moment (they reconnect by themselves).

## Moving existing saves to Supabase

If you already have groups saved on your laptop (`lantern-island/data/`), copy them once:

```
cd lantern-island
SUPABASE_URL=https://abcdefgh.supabase.co SUPABASE_SERVICE_KEY=... npm run copy-to-supabase
```

Or, simpler: in the teacher panel on the laptop, **Export save** for each group; online, **Import save…**.
