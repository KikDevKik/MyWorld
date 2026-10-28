#!/usr/bin/env bash
# Oct 2026: configuración ÚNICA para el deploy automático desde GitHub (sin claves).
# Pégalo en Cloud Shell (console.cloud.google.com → icono ">_" arriba a la derecha) con el proyecto MyWorld.
# Crea una cuenta de servicio solo para publicar y deja que GitHub la use ÚNICAMENTE desde KikDevKik/MyWorld.
set -euo pipefail
PROJECT=myword-67b03
REPO=KikDevKik/MyWorld
SA=github-deploy
POOL=github
PROVIDER=myworld-repo
gcloud config set project "$PROJECT"
NUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com

# 1) Cuenta de servicio para publicar
gcloud iam service-accounts describe "$SA@$PROJECT.iam.gserviceaccount.com" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "$SA" --display-name="Deploy desde GitHub (MyWorld)"

# 2) Permisos mínimos para publicar funciones (2.ª gen) y la web
for ROLE in roles/firebasehosting.admin roles/cloudfunctions.admin roles/run.admin \
            roles/artifactregistry.admin roles/cloudbuild.builds.editor roles/iam.serviceAccountUser \
            roles/secretmanager.admin roles/serviceusage.serviceUsageConsumer roles/firebaseextensions.viewer \
            roles/eventarc.admin roles/pubsub.admin roles/storage.admin roles/firebase.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA@$PROJECT.iam.gserviceaccount.com" \
    --role="$ROLE" --condition=None --quiet >/dev/null
  echo "  ✓ $ROLE"
done

# 3) Federación de identidad: GitHub (solo este repo) puede actuar como esa cuenta, sin claves
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global --workload-identity-pool="$POOL" \
       --display-name="MyWorld repo" --issuer-uri="https://token.actions.githubusercontent.com" \
       --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
       --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main'"
gcloud iam service-accounts add-iam-policy-binding "$SA@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO" --quiet >/dev/null

echo
echo "LISTO. Copia estos dos valores en GitHub → Settings → Secrets and variables → Actions → pestaña Variables:"
echo "  GCP_WIF_PROVIDER = projects/$NUM/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo "  GCP_DEPLOY_SA    = $SA@$PROJECT.iam.gserviceaccount.com"
