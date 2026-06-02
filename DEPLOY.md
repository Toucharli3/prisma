# Déployer PRISMA sur Vercel (+ classement en ligne)

Le jeu est un site **statique** (Vite → `dist/`) + **une fonction serverless**
(`api/scores.js`) pour le classement partagé. Sans backend, le jeu fonctionne
quand même : le classement bascule automatiquement en **local** (par navigateur).

## 1. Mettre le code sur GitHub

```bash
cd prisma
git add -A && git commit -m "prisma"      # si pas déjà fait
# crée un repo vide sur github.com puis :
git remote add origin https://github.com/<toi>/prisma.git
git push -u origin main
```

## 2. Importer sur Vercel

1. Va sur **vercel.com** → *Add New… → Project* → importe ton repo GitHub.
2. Vercel détecte **Vite** tout seul (Build `npm run build`, Output `dist`). Laisse tel quel.
3. Clique **Deploy**. → Le jeu est en ligne (classement encore en **local**).

## 3. Activer le classement EN LIGNE (Upstash Redis, gratuit)

1. Dans ton projet Vercel → onglet **Storage** → *Create Database* → choisis
   **Upstash → Redis** → *Continue*, choisis une région proche, **Create**.
2. **Connecte** la base au projet (bouton *Connect Project*). Vercel injecte
   automatiquement les variables `KV_REST_API_URL` et `KV_REST_API_TOKEN`.
3. Onglet **Deployments** → **Redeploy** le dernier déploiement (pour prendre les
   variables). 

C'est tout : le menu affichera **● en ligne** et tes potes verront le même
classement en ouvrant l'URL Vercel sur leurs ordis. 🎉

> Variables reconnues par la fonction : `KV_REST_API_URL`/`KV_REST_API_TOKEN`
> **ou** `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`.

## 4. (Option) Tester l'API en local

`npm run dev` (Vite) **ne lance pas** les fonctions `/api` → le classement reste
local. Pour tester l'API en local, utilise le CLI Vercel :

```bash
npm i -g vercel
vercel dev        # sert le site + /api, demande de lier le projet/vars
```

## Notes

- **Anti-triche** : les scores sont envoyés depuis le navigateur. Le serveur
  borne les valeurs aberrantes, mais entre potes c'est « confiance ». Pour une
  vraie compét anti-triche il faudrait valider la partie côté serveur (hors scope).
- Le classement ne garde que les **500 meilleurs scores** (auto-nettoyage).
- Réinitialiser le classement : supprime la clé `prisma:scores:v1` dans la console Upstash.
