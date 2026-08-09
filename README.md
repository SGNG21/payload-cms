# Polyvaillant CMS

Instance Payload unique, multi-tenant, qui donne à chaque client un espace de
connexion pour remplacer les photos de son site.

Payload 3.87.1 · Postgres · Vercel Blob · déploiement Vercel.

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
pnpm add @payloadcms/plugin-multi-tenant@3.87.1 @payloadcms/storage-vercel-blob@3.87.1
cp .env.example .env   # puis renseigner les valeurs
```

Base et premier compte :

```bash
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
