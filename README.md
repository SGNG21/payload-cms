# Polyvaillant CMS

Instance Payload unique, multi-tenant, qui donne à chaque client un espace de
connexion pour remplacer les photos de son site.

Payload 3.87.1 · Postgres (Supabase) · Supabase Storage (S3-compatible) · déploiement Vercel.

---

## ADR-001 — Une instance multi-tenant, pas une par client

**Contexte.** Plusieurs sites déjà vendus, en React/Vite et en Next.js.
Besoin : chaque client se connecte et remplace ses photos.

**Décision.** Une seule instance Payload standalone, partagée, avec
`@payloadcms/plugin-multi-tenant`. Les sites clients restent inchangés et
consomment une API publique en lecture.

**Pourquoi.**

- Payload 3 s'installe *dans* une app Next.js. L'embarquer dans chaque site
  imposerait de migrer les sites Vite. Standalone évite cette migration et rend
  le choix Next vs Vite des sites clients sans effet sur le CMS.
- Provisionner le client suivant coûte un script, pas un déploiement.
- Un seul back-office, un seul schéma, une seule base à maintenir.

**Conséquences.**

- L'isolation entre clients repose entièrement sur l'access control. Toute
  nouvelle collection doit être déclarée dans `plugins.multiTenantPlugin.collections`,
  sinon elle est visible par tous les tenants. **C'est le principal risque de ce design.**
- Panne de l'instance = plus de back-office pour tout le monde. En revanche les
  sites publics continuent de fonctionner : ils servent des URL Blob directes,
  sans dépendance runtime au CMS.

**Statut.** Accepté. Payload devient le CMS standard pour tout nouveau site.
Sveltia sort du starter Hermes Build. Le CMS custom de l'Institut de Charlène
reste en place (fonctionne en production) et n'est pas migré à ce stade.

---

## Modèle de données

| Collection | Rôle | Créé par |
|---|---|---|
| `tenants` | Un client = un site | Admin / script |
| `users` | Comptes de connexion, rôle `admin` ou `editor` | Admin / script |
| `media-slots` | Un emplacement photo nommé (upload direct) | Script uniquement |

Le champ `tenant` sur `media-slots` et l'array `tenants` sur `users` sont
injectés par le plugin — ne pas les déclarer à la main.

**Le point de design important :** `media-slots` n'est pas une médiathèque.
Un client à qui l'on présente « Créer un média » ne touche plus jamais rien.
Il voit une liste d'emplacements nommés — « Photo d'accueil », « Réalisation 1 » —
et ne peut que remplacer l'image. `create` et `delete` lui sont fermés.

---

## Installation

Payload doit vivre dans une app Next.js. On part du template officiel plutôt
que de câbler les routes du back-office à la main :

```bash
pnpm create payload-app@latest polyvaillant-cms --template blank --db postgres
cd polyvaillant-cms
```

Puis on remplace la config générée par celle de ce dossier :

```bash
# copier payload.config.ts, src/collections, src/access, src/endpoints, scripts
pnpm add @payloadcms/plugin-multi-tenant@3.87.1 @payloadcms/storage-s3@3.87.1
cp .env.example .env   # puis renseigner les valeurs
```

Base et premier compte :

```bash
# L'adaptateur ne crée pas le schéma lui-même — à faire une fois, avant le
# premier migrate, sur toute base neuve (locale ou Supabase) :
psql "$DATABASE_URI" -c 'CREATE SCHEMA IF NOT EXISTS payload;'

pnpm payload migrate:create init
pnpm payload migrate
pnpm dev
```

Le back-office est sur `http://localhost:3000/admin`. Le premier compte créé
via l'écran d'inscription est à passer en `roles: ['admin']` directement en
base — ensuite tous les autres comptes se créent depuis le back-office ou le
script.

## Provisionner un client

```bash
pnpm tsx scripts/provision-tenant.ts \
  --slug reb-couverture \
  --name "REB Couverture" \
  --domain reb-couverture.fr \
  --email fabrice@reb-couverture.fr \
  --slots "hero:Photo d'accueil,realisation-1:Réalisation 1,equipe:Photo de l'équipe"
```

Idempotent. Le mot de passe initial s'affiche une seule fois.

## Preuve d'isolation multi-tenant

Testé le 2026-08-09 sur Postgres 16 local (`schemaName: 'payload'`, jamais
`public`), avec deux tenants provisionnés via le script ci-dessus :

| Tenant | Slug | Compte editor | Slots |
|---|---|---|---|
| REB Couverture | `reb-couverture` | fabrice@reb-couverture.fr | hero, realisation-1, equipe |
| Institut de Charlène | `institut-charlene` | charlene@institut-charlene.fr | hero, cabinet |

Résultats (API REST, comptes editor authentifiés) :

| Test | Attendu | Résultat |
|---|---|---|
| `GET /api/media-slots` (fabrice) | 3 docs, tenant reb-couverture uniquement | ✅ `totalDocs: 3` — hero/realisation-1/equipe |
| `GET /api/media-slots` (charlene) | 2 docs, tenant institut-charlene uniquement | ✅ `totalDocs: 2` — hero/cabinet |
| `GET /api/media-slots/:id` d'un slot d'un **autre** tenant | refusé | ✅ `404 Pas trouvé` (n'existe même pas pour ce user) |
| `PATCH` d'un slot d'un **autre** tenant | refusé | ✅ `403` |
| `PATCH` de son **propre** slot (`alt`) | autorisé | ✅ `200` |
| `POST /api/media-slots` (editor, création) | refusé, même sur son propre tenant | ✅ `403` |
| `DELETE /api/media-slots/:id` (editor, sur son propre slot) | refusé | ✅ `403` |
| `PATCH /api/users/:id` — editor tente `roles: ['admin']` sur son propre compte | pas d'escalade | ✅ `200` (update autorisé sur soi-même) mais le champ `roles` reste `['editor']` — verrouillé par l'access de champ `adminOnlyField`, vérifié en base après coup |
| `GET /api/public/sites/reb-couverture/media` (public, non authentifié) | mapping key→url du seul tenant reb-couverture | ✅ 3 clés, aucune clé de institut-charlene |
| `GET /api/public/sites/institut-charlene/media` (public, non authentifié) | mapping key→url du seul tenant institut-charlene | ✅ 2 clés, aucune clé de reb-couverture |

Isolation confirmée à trois niveaux : liste (`find`), accès direct par ID, et
écriture (`update`/`create`/`delete`). Le plugin multi-tenant intersecte
correctement la contrainte de tenant sur `media-slots` sans code d'accès
supplémentaire à écrire — voir `src/access/index.ts`.

## Déploiement (Supabase + Vercel)

Projet Supabase dédié : `payload-cms`, ref `npeuvlrqglbtexxgeaid`, région
`eu-west-3` (Paris). Ce qui suit est un guide d'actions manuelles — cette
session ne s'est jamais connectée à ce projet et n'a rien exécuté dessus.

### 1. Dans le dashboard Supabase, avant le premier `migrate`

**a. SQL Editor** — créer le schéma applicatif (l'adaptateur ne le fait pas
lui-même) :

```sql
CREATE SCHEMA IF NOT EXISTS payload;
```

**b. Storage → New bucket**
- Nom : `media`
- **Public bucket : OUI.** Les photos de `media-slots` sont déjà publiques
  par design — `GET /api/public/sites/:slug/media` ne demande aucune
  authentification (voir plus haut), exactement le même contrat qu'avec
  `access: 'public'` sur Vercel Blob. Un bucket privé forcerait à signer
  chaque URL pour rien : les sites clients doivent pouvoir afficher les
  images directement.

**c. Storage → Settings → S3 Connection** — générer un jeu d'identifiants S3
dédiés (Access Key ID / Secret Access Key). **Ce n'est pas la `service_role`
key** : c'est un système de credentials séparé, propre au protocole
S3-compatible. La valeur du secret n'est affichée qu'une seule fois à la
génération — la noter tout de suite.

### 2. Variables d'environnement à renseigner dans Vercel

| Variable | Valeur / source |
|---|---|
| `DATABASE_URI` | Connection string **Session** (port **5432**) du projet Supabase — Database → Connect. Pas le pooler Transaction (6543). |
| `PAYLOAD_SECRET` | Valeur aléatoire forte générée une fois (`openssl rand -base64 32`), propre à cet environnement. |
| `S3_ACCESS_KEY_ID` | Étape 1c |
| `S3_SECRET_ACCESS_KEY` | Étape 1c |
| `S3_BUCKET` | `media` |
| `S3_ENDPOINT` | `https://npeuvlrqglbtexxgeaid.storage.supabase.co/storage/v1/s3` |
| `S3_REGION` | `eu-west-3` |
| `NEXT_PUBLIC_SERVER_URL` | URL publique de l'instance une fois déployée |

### 3. Déploiement Vercel (étapes manuelles — à faire par vous, pas par cette session)

1. Vercel → New Project → importer `SGNG21/payload-cms`.
2. Framework preset : Next.js, auto-détecté. Aucun `vercel.json` requis —
   `next build` est déjà le script `build` de `package.json`, vérifié
   compatible zéro-config.
3. Renseigner les 8 variables de la table ci-dessus (Project Settings →
   Environment Variables).
4. Déployer.
5. **Une fois déployé**, exécuter la migration une seule fois contre la base
   de prod, depuis votre poste (jamais depuis une session Claude) :
   ```bash
   DATABASE_URI="<connection string prod>" pnpm payload migrate
   ```
6. Créer le premier compte via l'écran d'inscription du `/admin` déployé,
   puis le repasser en `roles: ['admin']` directement en base.

## Côté site client

```js
const res = await fetch(`https://cms.polyvaillant.fr/api/public/sites/${slug}/media`)
const { media } = await res.json()
// media['hero'] -> { url, alt, width, height, sizes, updatedAt }
```

Aucune clé d'API : l'endpoint ne sert que des images déjà publiques.
Toujours prévoir un fallback sur l'image du build — un slot non renseigné
n'a pas d'`url`, et le site ne doit pas afficher un trou.

En Vite, un fetch au montage suffit. En Next.js, un `revalidate: 60` sur le
fetch évite tout rebuild à chaque photo remplacée.
