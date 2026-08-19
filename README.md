# 🏥 Planning Médical — Guide Complet

## 📋 Stack

| Composant | Technologie |
|-----------|-------------|
| Backend   | Node.js + Express + Socket.IO |
| Frontend  | React + Vite + Nginx |
| Base de données | MySQL 8.0 |
| Conteneurs | Docker + Docker Compose |
| Orchestration | Kubernetes |

---

## 🚀 Lancement LOCAL (développement)

```bash
# Terminal 1 — Backend
cd backend
npm install
cp .env.example .env     # remplir les valeurs
node seed.js             # créer admin@planning.com / Admin123!
npm run dev              # port 8083

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev              # port 5173
```

### Base de données
1. Démarrer XAMPP → MySQL
2. phpMyAdmin → Importer `database/planning.sql`
3. Exécuter `migration.sql`

---

## 🐳 DOCKER COMPOSE (recommandé)

### Prérequis
- Docker Desktop installé

### Démarrage

```bash
# 1. Copier et configurer l'environnement
cp .env.docker .env
# Éditer .env : JWT_SECRET, DB_PASS, EMAIL_USER, EMAIL_PASS

# 2. Construire et démarrer
docker compose up --build -d

# 3. Vérifier
docker compose ps
docker compose logs -f backend

# 4. Accès
#  Frontend : http://localhost:5173
#  Backend  : http://localhost:8083
#  API docs : http://localhost:8083/api/health
```

### Commandes utiles

```bash
# Arrêter
docker compose down

# Arrêter + supprimer volumes (reset BDD)
docker compose down -v

# Rebuild sans cache
docker compose build --no-cache

# Voir les logs
docker compose logs -f [backend|frontend|mysql]

# Exécuter une commande dans un container
docker compose exec backend node seed.js
docker compose exec mysql mysql -u root -p planning
```

---

## ☸️ KUBERNETES

### Prérequis
- Kubernetes cluster (minikube / kind / cloud)
- kubectl configuré
- Images Docker buildées et pushées dans un registry

### Étape 1 — Builder les images

```bash
# Backend
docker build -t votre-registry/planning-backend:1.0.0 ./backend
docker push votre-registry/planning-backend:1.0.0

# Frontend
docker build -t votre-registry/planning-frontend:1.0.0 ./frontend
docker push votre-registry/planning-frontend:1.0.0
```

### Étape 2 — Configurer les manifests

Éditer `k8s/01-secrets.yaml` avec vos vraies valeurs :
```bash
# Encoder une valeur
echo -n "votre_secret" | base64
```

Éditer `k8s/04-backend.yaml` et `k8s/05-frontend.yaml` :
```yaml
image: votre-registry/planning-backend:1.0.0
image: votre-registry/planning-frontend:1.0.0
```

Éditer `k8s/06-ingress.yaml` :
```yaml
host: planning.votre-domaine.com
```

### Étape 3 — Déployer

```bash
# Appliquer dans l'ordre
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-secrets.yaml
kubectl apply -f k8s/02-configmap.yaml
kubectl apply -f k8s/03-mysql.yaml

# Attendre MySQL
kubectl wait --for=condition=ready pod -l app=mysql -n planning-medical --timeout=120s

kubectl apply -f k8s/04-backend.yaml
kubectl apply -f k8s/05-frontend.yaml
kubectl apply -f k8s/06-ingress.yaml

# Ou tout en une fois (ordre alphabétique automatique)
kubectl apply -f k8s/
```

### Vérification

```bash
# Status des pods
kubectl get pods -n planning-medical

# Services
kubectl get services -n planning-medical

# Ingress
kubectl get ingress -n planning-medical

# Logs backend
kubectl logs -l app=backend -n planning-medical -f

# Logs frontend
kubectl logs -l app=frontend -n planning-medical -f

# Describe un pod en erreur
kubectl describe pod <nom-du-pod> -n planning-medical
```

### Minikube (test local)

```bash
# Démarrer minikube
minikube start --cpus=2 --memory=4096

# Activer ingress
minikube addons enable ingress

# Utiliser le registry minikube
eval $(minikube docker-env)
docker build -t planning-backend:latest ./backend
docker build -t planning-frontend:latest ./frontend

# Dans les manifests, utiliser imagePullPolicy: Never
# image: planning-backend:latest

# Accès
minikube service frontend-service -n planning-medical
# ou
minikube tunnel   # puis http://localhost
```

### Mise à jour sans downtime

```bash
# Mettre à jour l'image backend
kubectl set image deployment/backend backend=votre-registry/planning-backend:1.1.0 -n planning-medical

# Suivre le rollout
kubectl rollout status deployment/backend -n planning-medical

# Rollback si problème
kubectl rollout undo deployment/backend -n planning-medical
```

### Scaling

```bash
# Scale manuel
kubectl scale deployment backend  --replicas=4 -n planning-medical
kubectl scale deployment frontend --replicas=3 -n planning-medical

# HPA (déjà configuré dans 04-backend.yaml)
kubectl get hpa -n planning-medical
```

---

## 🧪 TESTS

### Backend

```bash
cd backend
npm install
npm test                   # tous les tests
npm run test:coverage      # avec rapport de couverture
```

### Frontend

```bash
cd frontend
npm install
npm test                   # tous les tests
npm run test:coverage      # avec rapport HTML dans coverage/
```

---

## 🔑 Comptes par défaut

| Email | Mot de passe | Rôle |
|-------|-------------|------|
| admin@planning.com | Admin123! | Administrateur |
| sophie.benali@planning.com | Medecin123! | Médecin |
| karim.mansouri@planning.com | Medecin123! | Médecin |
| youssef.hamdi@planning.com | Tech123! | Technicien |

```bash
# Créer les comptes
cd backend && node seed.js
# ou dans Docker
docker compose exec backend node seed.js
# ou dans Kubernetes
kubectl exec -it deployment/backend -n planning-medical -- node seed.js
```

---

## 📊 Architecture

```
Internet
    │
    ▼
┌─────────────────┐
│  Ingress Nginx  │  (port 80/443)
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌─────────┐
│Frontend│ │ Backend │  (port 80 / 8083)
│ Nginx  │ │ Node.js │
│ React  │ │ +Socket │
└────────┘ └────┬────┘
                │
                ▼
          ┌──────────┐
          │  MySQL   │  (port 3306)
          │  8.0     │
          └──────────┘
```

---

## 🗄️ Ports

| Service | Local dev | Docker | K8s |
|---------|-----------|--------|-----|
| Backend | 8083 | 8083 | ClusterIP |
| Frontend | 5173 | 5173 | ClusterIP |
| MySQL | 3306 | 3306 | Headless |
| Ingress | — | — | 80/443 |
