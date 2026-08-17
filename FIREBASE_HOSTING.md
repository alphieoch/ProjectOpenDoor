# Firebase Hosting (OpenDoor)

**Status:** live on GCP project `project-800192c2-3ecc-4889-8f7`.

| | |
|---|---|
| Site | `opendoor-gcp` |
| URL | https://opendoor-gcp.web.app |
| Alt | https://opendoor-gcp.firebaseapp.com |
| Console | https://console.firebase.google.com/project/project-800192c2-3ecc-4889-8f7/overview |
| Hosting | https://console.firebase.google.com/project/project-800192c2-3ecc-4889-8f7/hosting |

`firebase.json` rewrites `/v1/**` and `/health` to Cloud Run `opendoor-gateway`, and everything else to `opendoor-dashboard` (us-central1). There is no separate static export.

## What was blocked before

`firebase projects:addfirebase` / empty `hosting:sites:list` was an org ToS / “Firebase not added” problem. That is **cleared**: Firebase is linked and Hosting APIs are enabled.

If ToS ever blocks again (403 on `addFirebase` or empty site list), an org admin must accept Firebase terms in the console, then create + deploy:

1. Open https://console.firebase.google.com/ → **Add project** → select `project-800192c2-3ecc-4889-8f7` → accept ToS  
   Direct: https://console.firebase.google.com/project/project-800192c2-3ecc-4889-8f7/overview
2. `firebase login`
3. `firebase hosting:sites:create opendoor-gcp --project project-800192c2-3ecc-4889-8f7`
4. `firebase deploy --only hosting --project project-800192c2-3ecc-4889-8f7`

## Why not `opendoor-f39a4`

Site ID `opendoor-f39a4` is **reserved by another GCP project** (`opendoor-f39a4` / “Opendoor”, number `88730326418`). Hosting Cloud Run rewrites must stay in the same project as the Cloud Run services, so this repo deploys to `opendoor-gcp` on `project-800192c2-3ecc-4889-8f7`.

```text
Error: Invalid name: `opendoor-f39a4` is reserved by another project;
try something like `opendoor-f39a4-7fae9` instead
```

The sibling project already has https://opendoor-f39a4.web.app and its own Cloud Run services. Do not point this repo’s `firebase.json` at that site unless you intend to serve that other project.

## Redeploy

```bash
firebase deploy --only hosting --project project-800192c2-3ecc-4889-8f7
```

`.firebaserc` default project is `project-800192c2-3ecc-4889-8f7`. Site id in `firebase.json` is `opendoor-gcp` (same default as `scripts/deploy-gcp.sh` / `FIREBASE_SITE_ID`).
