# Ivoir'Académie 🇨🇮

Plateforme éducative intelligente pour les élèves ivoiriens, propulsée par l'IA.

## Fonctionnalités

- 💬 **Chat intelligent** — Pose tes questions et obtiens des explications adaptées à ton niveau
- 📝 **Exercices** — Génération automatique d'exercices avec correction étape par étape
- ✅ **Correction** — Soumets ton travail et reçois une correction détaillée avec une note
- 🧠 **Quiz** — Des quiz interactifs pour tester tes connaissances
- 📚 **Révision** — Fiches de révision et résumés de leçons
- 🎓 **Programme ivoirien** — Basé sur le programme scolaire de Côte d'Ivoire
- 🌐 **Agents de scraping** — Récupération automatique de contenus depuis des sites éducatifs ivoiriens
- 🤖 **IA puissante** — Groq (Llama 3) pour des réponses rapides et gratuites + RAG enrichi

## Matières

Mathématiques, Français, Physique-Chimie, SVT, Histoire-Géographie, Philosophie, Anglais

## Technologies

- **Frontend** : Next.js 15, React 19, TypeScript, Tailwind CSS 4
- **Backend** : Next.js API Routes
- **Base de données** : SQLite (dev) / PostgreSQL (prod) avec Prisma ORM
- **IA** : Groq API (Llama 3.3 70B) — gratuit et ultra-rapide, avec fallback OpenAI
- **Scraping** : Cheerio + Axios (agents intelligents)
- **Auth** : NextAuth.js

## Architecture IA

```
Utilisateur → Chat → RAG (Leçons DB + Contenu scrappé) → Groq/Llama 3 → Réponse
                                    ↑
                        Agents de scraping
                    ┌─────────┼──────────┐
              education    abidjan.net   Wikipedia
              .gouv.ci                     FR
```

Les agents de scraping récupèrent du contenu éducatif depuis :
- **education.gouv.ci** — Ministère de l'Éducation Nationale de Côte d'Ivoire
- **abidjan.net** — Actualités éducatives ivoiriennes
- **Wikipedia FR** — Définitions et contenus encyclopédiques

Le contenu est stocké en base de données et utilisé comme contexte RAG pour enrichir les réponses de l'IA.

## Installation

```bash
# Cloner le repo
git clone https://github.com/Ralldeur/ivoir-academie.git
cd ivoir-academie

# Installer les dépendances
npm install

# Configurer l'environnement
cp .env.example .env
# Ajouter votre clé API Groq (gratuit : https://console.groq.com/keys)

# Initialiser la base de données
npx prisma db push
npm run db:seed

# Lancer le serveur de développement
npm run dev
```

## Comptes de démonstration

- **Admin** : admin@ivoir-academie.ci / admin123
- **Élève** : eleve@ivoir-academie.ci / eleve123

## Structure du projet

```
src/
├── app/
│   ├── (auth)/          # Pages de connexion/inscription
│   ├── chat/            # Interface de chat IA
│   ├── exercises/       # Générateur d'exercices
│   ├── admin/           # Panel d'administration (+ scraping)
│   └── api/             # Routes API
│       └── admin/scrape/ # Endpoint de scraping admin
├── components/
│   ├── chat/            # Composants du chat
│   ├── ui/              # Composants UI réutilisables
│   └── Providers.tsx    # Providers (Auth, Theme, Toast)
├── lib/
│   ├── ai.ts            # Provider IA unifié (Groq + OpenAI fallback)
│   ├── scraper.ts       # Agents de scraping (3 sources)
│   ├── auth.ts          # Configuration NextAuth
│   ├── openai.ts        # Client OpenAI (fallback)
│   ├── prisma.ts        # Client Prisma
│   └── utils.ts         # Utilitaires
└── types/               # Types TypeScript
```

## Variables d'environnement

| Variable | Description | Requis |
|----------|-------------|--------|
| `DATABASE_URL` | URL de connexion à la base de données | Oui |
| `NEXTAUTH_SECRET` | Clé secrète NextAuth | Oui |
| `NEXTAUTH_URL` | URL de l'application | Oui |
| `GROQ_API_KEY` | Clé API Groq (gratuit, recommandé) | Groq ou OpenAI |
| `OPENAI_API_KEY` | Clé API OpenAI (payant) | Groq ou OpenAI |

## Roadmap

- [x] Chat IA intelligent avec streaming
- [x] Intégration Groq / Llama 3 (gratuit)
- [x] Agents de scraping éducatifs
- [x] RAG enrichi (leçons + contenu scrappé)
- [ ] Upload PDF/images pour analyse
- [ ] Paiements Mobile Money (Orange, Wave, MTN)
- [ ] Application mobile (React Native)
- [ ] Mode hors ligne
- [ ] Statistiques d'apprentissage détaillées
- [ ] Système de gamification (badges, points)
- [ ] Support multilingue (Français, Anglais, Dioula, Baoulé)

## Licence

MIT
