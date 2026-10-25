# 训练记录 Training Log

A phone-first workout logger for a weekly gym session plus a home session, on a 3-week A/B/C rotation.

- **今天**: suggests this week's plan from your rotation (pick any other plan from the 本周重点 dropdown), with a suggested weight for every exercise (double progression).
- **计划**: create, edit, reorder and delete plans in the app; add your own exercises from the library or while picking one.
- **历史**: tap a past session to see every set, volume (lb × reps) and the change from last time; 补录 enters a past workout.
- **记录**: big steppers for weight and reps, one tap per set, automatic rest timer, swap or add exercises.
- **动作库**: 119 exercises with Chinese/English names, cues, home substitutes, and the old trainer-session history.
- **同步**: every set is saved on the phone first (works with no signal), then synced to Supabase when online. CSV export in 设置.

Stack: Vite + React + TypeScript, Dexie (IndexedDB), Supabase (Postgres + magic-link auth), GitHub Pages.

```
data/training_dictionary_v2.xlsx   source spreadsheet (edit this)
scripts/build_data.py              xlsx → src/data/exercises.json, validates templates
src/data/templates.json            the six starting plans (A/B/C × gym/home); edit plans in the app
src/lib/                           storage, sync, rotation and progression logic
src/views/                         screens
supabase/schema.sql                tables + row level security
```

## Setup

### 1. Supabase

1. Create a project (region: East US). Enable RLS if the dialog offers it.
2. **SQL Editor** → paste `supabase/schema.sql` → **Run**.
3. **Authentication → URL Configuration**
   - Site URL: `https://<your-github-username>.github.io/<repo-name>/`
   - Redirect URLs: add the same URL, plus `http://localhost:5173/` for local dev.
4. **Authentication → Email Templates → Magic Link**: add the code to the email body so you can log in by typing it, e.g.
   `<p>验证码：{{ .Token }}</p>`
   This matters on iPhone: a home-screen web app and Safari keep separate logins, so tapping the link logs Safari in, not the app. Typing the code logs in the app itself.
5. After you've logged in once, turn off **Authentication → Sign In / Providers → Allow new users to sign up**, so nobody else can create an account on your project.
6. **Project Settings → API**: note the Project URL and the **anon / publishable** key. Never use the `service_role` / secret key in this app.

### 2. GitHub

1. Create a repo and push this folder:
   ```bash
   git init && git add . && git commit -m "Initial commit"
   git branch -M main
   git remote add origin git@github.com:<you>/<repo-name>.git
   git push -u origin main
   ```
   GitHub Pages on a free account needs a **public** repo. The repo holds code and the exercise library only; your logged sets live in Supabase.
2. **Settings → Secrets and variables → Actions**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. **Settings → Pages → Source: GitHub Actions**. Re-run the workflow (Actions tab) once after this.
4. Open the site on your phone → Share → **Add to Home Screen**. Using it from the home screen also stops iOS Safari from clearing its local data after a week of inactivity.

### Local development

```bash
cp .env.example .env.local   # fill in URL and key, or leave empty for local-only mode
npm install
npm run dev
npm run typecheck
```

### Updating the database after an app update

`supabase/schema.sql` is safe to re-run. When an update changes it, paste the whole file into **SQL Editor** again and **Run**. Until then, sync shows an error, but nothing is lost: records stay on the phone and upload once the schema is current.

### Editing exercises or plans

Plans and your own exercises are edited in the app (今天 → 管理计划, and 动作库 → 新建动作). They sync like your workouts.

To change the built-in exercise library or the six starting plans, edit `data/training_dictionary_v2.xlsx` (sheet 动作库 Exercises) or `src/data/templates.json`, then:

```bash
pip install openpyxl
python scripts/build_data.py
```

It regenerates `src/data/exercises.json` and fails if a template references an unknown exercise or a non-home exercise in a home template.

## How suggestions work

Each template item has a rep range (e.g. 8–10). If every set last time reached the top of the range, the next session suggests more load: +5 lb (+10 lb for heavy lower-body barbell/machine lifts), one level less assistance on the assisted pull-up, +1 rep for bodyweight moves, +10 s for holds. At home, dumbbell suggestions stop at 45 lb and switch to more reps or a slower lowering phase.

## Rotation

Plans in the rotation get letters A, B, C… in the order set under 管理计划. The app stays on the last session's letter during the same Monday–Sunday week and moves to the next letter in a new week; gym and home share the letter. Missed weeks don't skip a letter. Plans outside the rotation, or a different plan picked in 本周重点, don't move it.
