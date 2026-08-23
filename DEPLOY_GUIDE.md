# 🌐 Guide de Déploiement Cloud 24h/24 & Autonome

Ce guide vous explique pas à pas comment héberger votre application **Planning Médical — GMT Ariana** dans le Cloud pour qu'elle fonctionne **24h/24 et 7j/7**, de façon totalement indépendante de votre ordinateur personnel.

---

## 🏗️ Architecture Cloud (100% Gratuite ou Low-Cost)

| Composant | Fournisseur Recommandé | Rôle |
|-----------|------------------------|------|
| **Base de Données** | **Railway.app** ou **Aiven** / **TiDB Cloud** | MySQL 8.0 hébergé 24h/24 |
| **Backend API** | **Railway.app** ou **Render.com** | Node.js + Express + Socket.IO |
| **Frontend Web/PWA** | **Vercel** ou **Netlify** | React + Vite + PWA Mobile + SSL HTTPS |

---

## 🚀 Étape 1 : Déployer la Base de Données MySQL (ex: Railway.app)

1. Rendez-vous sur [Railway.app](https://railway.app) et connectez-vous avec votre compte GitHub.
2. Cliquez sur **+ New Project** → **Provision MySQL**.
3. Une fois créée, cliquez sur le service MySQL → onglet **Variables** :
   - Vous obtenez : `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE` (ou `DATABASE_URL`).
4. Dans l'onglet **Data** ou via un client comme DBeaver/TablePlus :
   - Importez le fichier [`database/planning.sql`](./database/planning.sql).
   - Exécutez le script [`migration.sql`](./migration.sql).

---

## 🚀 Étape 2 : Déployer le Backend API (Render.com ou Railway.app)

### Option A — Sur Render.com :
1. Créez un compte gratuit sur [Render.com](https://render.com).
2. Cliquez sur **New +** → **Web Service**.
3. Connectez votre dépôt GitHub.
4. Remplissez les champs :
   - **Root Directory** : `backend`
   - **Build Command** : `npm install`
   - **Start Command** : `node server.js`
5. Dans la section **Environment Variables**, ajoutez :
   ```env
   NODE_ENV=production
   PORT=8083
   JWT_SECRET=un_secret_tres_long_et_securise_123456
   DATABASE_URL=mysql://user:password@host:port/database
   FRONTEND_URL=https://votre-frontend.vercel.app,*
   DB_SSL=true
   ```
6. Cliquez sur **Create Web Service**. Vous obtenez une URL API (ex: `https://gmt-backend.onrender.com`).

---

## 🚀 Étape 3 : Déployer le Frontend React PWA (Vercel)

1. Rendez-vous sur [Vercel.com](https://vercel.com) et connectez votre compte GitHub.
2. Cliquez sur **Add New...** → **Project** → Sélectionnez votre dépôt.
3. Remplissez la configuration :
   - **Root Directory** : Cliquez sur *Edit* et choisissez `frontend`.
   - **Framework Preset** : `Vite`.
4. Dans **Environment Variables**, ajoutez :
   ```env
   VITE_API_URL=https://gmt-backend.onrender.com
   ```
5. Cliquez sur **Deploy**.
6. En moins de 60 secondes, votre application est en ligne avec HTTPS gratuit (ex: `https://gmt-ariana.vercel.app`).

---

## 📱 Étape 4 : Utilisation sur Mobile (PWA & Raccourci)

1. Ouvrez le lien de votre application (ex: `https://gmt-ariana.vercel.app`) sur Safari (iPhone) ou Chrome (Android).
2. **Sur Android** : Cliquez sur la bannière *« Installer l'application »* ou menu ⋮ → *Ajouter à l'écran d'accueil*.
3. **Sur iPhone (iOS)** : Cliquez sur l'icône de partage ⎋ → *Sur l'écran d'accueil*.
4. L'icône **GMT Ariana** s'ajoute sur l'écran d'accueil du téléphone et fonctionne comme une application mobile native (plein écran, caméra, géolocalisation, mode hors-ligne).

---

## 🌐 Étape 5 : Lier votre Nom de Domaine Personnalisé (Optionnel)

Pour utiliser `planning.gmt-ariana.tn` :
1. Dans le tableau de bord **Vercel** → votre projet → **Settings** → **Domains**.
2. Entrez `planning.gmt-ariana.tn`.
3. Ajoutez l'enregistrement CNAME ou A indiqué chez votre bureau d'enregistrement DNS (ex: ATI, OVH, Namecheap).
4. Le certificat SSL HTTPS est généré automatiquement et gratuitement.
