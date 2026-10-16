#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

mode=${1:?check or deploy}
serverPath=${2:?deployment directory}
releaseCommit=${3:?commit}
attempt=${4:?attempt}
archiveBytes=${5:?archive size}
imageBytes=${6:?image size}
keepReleases=${7:-3}
keepBackups=${8:-7}
backupDays=${9:-30}
minFreeGiB=${10:-5}
logSizeMb=${11:-20}
logFiles=${12:-5}
drainSeconds=${13:-300}

[[ "$mode" == check || "$mode" == deploy ]]
[[ "$serverPath" =~ ^/[a-zA-Z0-9/_-]+$ && "$serverPath" != / ]]
[[ -d "$serverPath" && ! -L "$serverPath" && "$(realpath "$serverPath")" == "$serverPath" ]]
[[ "$releaseCommit" =~ ^[a-f0-9]{40}$ && "$attempt" =~ ^attempt[0-9]+x[0-9]+$ ]]
for value in "$archiveBytes" "$imageBytes" "$keepReleases" "$keepBackups" "$backupDays" "$minFreeGiB" "$logSizeMb" "$logFiles" "$drainSeconds"; do
  [[ "$value" =~ ^[1-9][0-9]{0,11}$ ]] || { echo 'Deployment settings must be positive integers.' >&2; exit 1; }
done
(( keepReleases >= 3 && keepReleases <= 100 && keepBackups >= 7 && keepBackups <= 1000 && backupDays >= 1 && backupDays <= 3650 ))
(( minFreeGiB >= 5 && minFreeGiB <= 100000 && logSizeMb <= 1000 && logFiles <= 100 && drainSeconds >= 30 && drainSeconds <= 600 ))
cd "$serverPath"
test -f compose.yaml
test -f .env
for directory in releases backups; do
  [[ ! -L "$directory" ]]
  mkdir -p "$directory"
  [[ "$(realpath "$directory")" == "$serverPath/$directory" ]]
done
releaseDirectory="$serverPath/releases/$releaseCommit"
[[ ! -L "$releaseDirectory" ]]
mkdir -p "$releaseDirectory"
compose=(docker compose -p omnistudio-next --env-file .env -f compose.yaml)
if [[ -f releaseCompose.yaml ]]; then compose+=(-f releaseCompose.yaml); fi
appContainer=$("${compose[@]}" ps -q omnistudio-next)
mysqlContainer=$("${compose[@]}" ps -q mysql)
test -n "$appContainer"
test -n "$mysqlContainer"
dataPath=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}' "$appContainer")
mysqlPath=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/mysql"}}{{.Source}}{{end}}{{end}}' "$mysqlContainer")
dockerPath=$(docker info --format '{{.DockerRootDir}}')
for directory in "$dataPath" "$mysqlPath" "$dockerPath"; do
  [[ -d "$directory" && ! -L "$directory" && "$(realpath "$directory")" == "$directory" ]]
done

checkSpace() {
  local dataBytes mysqlBytes reserveBytes deployRequired dockerRequired freeBytes
  dataBytes=$(du -sb "$dataPath" | cut -f1)
  mysqlBytes=$(du -sb "$mysqlPath" | cut -f1)
  reserveBytes=$(( minFreeGiB * 1024 * 1024 * 1024 ))
  # ACT: use uncompressed data sizes plus two image sizes as a conservative load/backup allowance.
  deployRequired=$(( archiveBytes + dataBytes * 2 + mysqlBytes + reserveBytes ))
  dockerRequired=$(( imageBytes * 2 + reserveBytes ))
  if [[ "$(stat -c %d "$serverPath")" == "$(stat -c %d "$dockerPath")" ]]; then
    deployRequired=$(( deployRequired + imageBytes * 2 ))
  else
    freeBytes=$(df -PB1 "$dockerPath" | awk 'NR == 2 { print $4 }')
    (( freeBytes >= dockerRequired )) || { echo "Insufficient Docker disk space: available=$freeBytes required=$dockerRequired" >&2; return 1; }
  fi
  freeBytes=$(df -PB1 "$serverPath" | awk 'NR == 2 { print $4 }')
  (( freeBytes >= deployRequired )) || { echo "Insufficient deployment disk space: available=$freeBytes required=$deployRequired" >&2; return 1; }
  echo "Disk preflight passed: available=$freeBytes required=$deployRequired"
}

checkSpace
if [[ "$mode" == check ]]; then
  date +%s > "$releaseDirectory/managedAt"
  exit 0
fi
exec 9>deployLock
flock -n 9
checkSpace
test -s "$releaseDirectory/appImagePending.tar.gz"
test -s "$releaseDirectory/imageChecksum"
(cd "$releaseDirectory" && sha256sum --check imageChecksum)
gzip -t "$releaseDirectory/appImagePending.tar.gz"
previousImage=$(docker inspect --format '{{.Image}}' "$appContainer")
previousImageTag=$(docker inspect --format '{{.Config.Image}}' "$appContainer")
previousMysqlImage=$(docker inspect --format '{{.Image}}' "$mysqlContainer")
backupDirectory="$serverPath/backups/$attempt"
[[ ! -e "$backupDirectory" && ! -L "$backupDirectory" ]]
mkdir -m 700 "$backupDirectory"
date +%s > "$backupDirectory/createdAt"
cp .env "$backupDirectory/environment"
cp compose.yaml "$backupDirectory/compose.yaml"
hadOverride=false
if [[ -f releaseCompose.yaml ]]; then cp releaseCompose.yaml "$backupDirectory/releaseCompose.yaml"; hadOverride=true; fi
if [[ -f deployedCommit ]]; then cp deployedCommit "$backupDirectory/deployedCommit"; fi
for metadata in imageId healthyAt; do
  [[ ! -L "$releaseDirectory/$metadata" ]]
  if [[ -f "$releaseDirectory/$metadata" ]]; then cp "$releaseDirectory/$metadata" "$backupDirectory/release${metadata^}"; fi
done
[[ ! -L "$releaseDirectory/appImage.tar.gz" ]]
if [[ -f "$releaseDirectory/appImage.tar.gz" ]]; then ln "$releaseDirectory/appImage.tar.gz" "$backupDirectory/releaseArchive.tar.gz"; fi
printf '%s\n' "$previousImage" > "$backupDirectory/previousImage"
maintenanceFile="$dataPath/deploymentMaintenance"
bootstrapFile="$serverPath/deploymentBootstrap"
[[ ! -e "$maintenanceFile" && ! -L "$maintenanceFile" && ! -e "$bootstrapFile" && ! -L "$bootstrapFile" ]]
deploymentToken=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
stopped=false
changed=false
committed=false
legacyDrain=false

registerManagedImage() {
  local imageId=$1 commit=$2 healthyAt=$3 directory="$serverPath/managedImages" record
  [[ "$imageId" =~ ^sha256:[a-f0-9]{64}$ && "$commit" =~ ^[a-f0-9]{40}$ && "$healthyAt" =~ ^[1-9][0-9]{0,10}$ ]] || return 1
  [[ ! -L "$directory" ]] || return 1
  mkdir -p -- "$directory" || return 1
  [[ -d "$directory" && "$(realpath -e -- "$directory")" == "$directory" ]] || return 1
  record="$directory/image${imageId#sha256:}"
  [[ ! -L "$record" && ! -L "${record}Pending" ]] || return 1
  [[ ! -e "$record" || -f "$record" ]] || return 1
  [[ ! -e "${record}Pending" || -f "${record}Pending" ]] || return 1
  printf '%s\t%s\n' "$healthyAt" "$commit" > "${record}Pending" || return 1
  mv -T -- "${record}Pending" "$record"
}

waitHealthy() {
  local expectedImage=$1 currentContainer currentImage
  for (( healthyAttempt=0; healthyAttempt<60; healthyAttempt++ )); do
    currentContainer=$("${compose[@]}" ps -q omnistudio-next) || return 1
    currentImage=$(docker inspect --format '{{.Image}}' "$currentContainer" 2>/dev/null) || currentImage=''
    if [[ "$currentImage" == "$expectedImage" ]] && curl -fsS --max-time 5 http://127.0.0.1:3000/api/auth/setupStatus >/dev/null; then return 0; fi
    sleep 2
  done
  return 1
}

waitMysqlHealthy() {
  local mysqlStatus
  for (( mysqlAttempt=0; mysqlAttempt<60; mysqlAttempt++ )); do
    mysqlContainer=$("${compose[@]}" ps -q mysql) || return 1
    mysqlStatus=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$mysqlContainer" 2>/dev/null) || mysqlStatus=''
    if [[ "$mysqlStatus" == healthy ]]; then return 0; fi
    sleep 2
  done
  return 1
}

schemaFingerprint() {
  docker exec "$mysqlContainer" sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database="$MYSQL_DATABASE" --batch --skip-column-names -e "SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COALESCE(COLUMN_DEFAULT,\"NULL\"),EXTRA,COALESCE(COLLATION_NAME,\"NULL\") FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION; SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COALESCE(COLUMN_NAME,\"NULL\"),COALESCE(SUB_PART,0) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX; SELECT id,checksum FROM omnistudio_schema_migrations ORDER BY id"' | sha256sum | cut -d ' ' -f1
}

rollback() {
  local exitCode=${1:-1} walletScale previousPrecision currentSchema rollbackOk=true
  trap - ERR HUP INT TERM
  trap '' HUP INT TERM
  set +e
  if [[ "$committed" != true && ( "$stopped" == true || "$changed" == true ) ]]; then
    "${compose[@]}" stop --timeout 30 omnistudio-next || rollbackOk=false
    cp "$backupDirectory/compose.yaml" compose.yaml || rollbackOk=false
    if [[ "$hadOverride" == true ]]; then cp "$backupDirectory/releaseCompose.yaml" releaseCompose.yaml || rollbackOk=false; else rm -f releaseCompose.yaml; fi
    compose=(docker compose -p omnistudio-next --env-file .env -f compose.yaml)
    if [[ "$hadOverride" == true ]]; then compose+=(-f releaseCompose.yaml); fi
    if [[ "$previousImageTag" != "$previousImage" ]]; then docker tag "$previousImage" "$previousImageTag" || rollbackOk=false; fi
    "${compose[@]}" up -d --no-build --no-deps mysql || rollbackOk=false
    waitMysqlHealthy || rollbackOk=false
    if [[ "$changed" == true ]]; then
      currentSchema=$(schemaFingerprint)
      if [[ ! -s "$backupDirectory/schemaFingerprint" || "$currentSchema" != "$(cat "$backupDirectory/schemaFingerprint")" ]]; then
        echo "Schema changed or could not be verified. Maintenance retained; manual database recovery required from $backupDirectory." >&2
        exit "$exitCode"
      fi
    fi
    previousPrecision=$(docker image inspect --format '{{index .Config.Labels "com.omnisline.walletCreditPrecision"}}' "$previousImage")
    walletScale=$(docker exec "$mysqlContainer" sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database="$MYSQL_DATABASE" --batch --skip-column-names -e "SELECT MAX(NUMERIC_SCALE) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=\"user_wallets\" AND COLUMN_NAME IN (\"balance\",\"frozen\")"')
    if ! [[ "$walletScale" =~ ^[0-9]+$ ]] || { [[ "$walletScale" -ge 6 ]] && [[ "$previousPrecision" != 6 ]]; }; then
      "${compose[@]}" stop --timeout 30 omnistudio-next
      echo "Rollback blocked by incompatible/unknown wallet precision. Maintenance retained; recover from $backupDirectory." >&2
      exit "$exitCode"
    fi
    "${compose[@]}" up -d --no-build --no-deps omnistudio-next || rollbackOk=false
    if [[ "$rollbackOk" == true ]] && waitHealthy "$previousImage"; then
      if [[ -f "$backupDirectory/releaseArchive.tar.gz" ]]; then mv "$backupDirectory/releaseArchive.tar.gz" "$releaseDirectory/appImage.tar.gz" || rollbackOk=false; fi
      for metadata in imageId healthyAt; do
        if [[ -f "$backupDirectory/release${metadata^}" ]]; then cp "$backupDirectory/release${metadata^}" "$releaseDirectory/$metadata" || rollbackOk=false; else rm -f "$releaseDirectory/$metadata" || rollbackOk=false; fi
      done
      if [[ -f "$backupDirectory/deployedCommit" ]]; then cp "$backupDirectory/deployedCommit" deployedCommit || rollbackOk=false; else rm -f deployedCommit || rollbackOk=false; fi
      if [[ "$rollbackOk" == true ]]; then
        rm -f "$maintenanceFile" "$bootstrapFile"
        echo 'Deployment failed; previous application image and Compose configuration restored.' >&2
      else
        echo "Rollback metadata restoration failed. Maintenance retained; inspect $backupDirectory." >&2
      fi
    else
      echo "Rollback failed. Maintenance retained; inspect containers and $backupDirectory." >&2
    fi
  else
    rm -f "$maintenanceFile" "$bootstrapFile"
  fi
  exit "$exitCode"
}
trap 'rollback $?' ERR
trap 'rollback 130' HUP INT TERM
printf '%s' "$deploymentToken" > "$maintenanceFile"

readDrainStatus() {
  docker exec "$appContainer" bun -e 'const fs = await import("node:fs"); const token = fs.readFileSync("/app/data/deploymentMaintenance", "utf8"); const response = await fetch("http://127.0.0.1:3000/api/deployment/status", { headers: { "x-deployment-token": token }, signal: AbortSignal.timeout(5000) }); if (!response.ok) process.exit(1); const body = await response.json(); const status = body.data; if (status?.maintenance !== true || !Number.isInteger(status.activeRequests) || status.activeRequests < 0) process.exit(1); console.log(status.activeRequests);'
}
if ! activeRequests=$(readDrainStatus); then
  # ACT: the first upgrade predates the application gate. Require an explicitly installed Nginx bootstrap gate.
  nginxConfiguration=$(nginx -T 2>&1)
  if ! grep -Fq "if (-f $bootstrapFile) { return 503; }" <<< "$nginxConfiguration"; then
    echo 'Application does not support draining. Install the documented one-time Nginx bootstrap gate before upgrading.' >&2
    false
  fi
  touch "$bootstrapFile"
  legacyDrain=true
fi
quietSamples=0
for (( drainAttempt=0; drainAttempt<drainSeconds; drainAttempt+=2 )); do
  if [[ "$legacyDrain" == true ]]; then
    activeRequests=$(ss -Htn state established '( sport = :3000 or dport = :3000 )' | wc -l)
  else
    activeRequests=$(readDrainStatus)
  fi
  activeJobs=$(docker exec "$mysqlContainer" sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database="$MYSQL_DATABASE" --batch --skip-column-names -e "SELECT COUNT(*) FROM user_generation_jobs WHERE status IN (\"reserved\",\"running\")"')
  [[ "$activeRequests" =~ ^[0-9]+$ && "$activeJobs" =~ ^[0-9]+$ ]]
  if (( activeRequests == 0 && activeJobs == 0 )); then quietSamples=$((quietSamples + 1)); else quietSamples=0; fi
  if (( quietSamples >= 3 )); then break; fi
  sleep 2
done
if (( quietSamples < 3 )); then
  if (( activeJobs == 0 )); then
    echo "Drain wait completed: no active generation jobs remain (activeRequests=$activeRequests). Proceeding with graceful container shutdown." >&2
  else
    echo "Drain timed out with activeRequests=$activeRequests activeJobs=$activeJobs; application remains running." >&2
    false
  fi
fi
echo 'All tracked requests and generation jobs drained.'
previousRevision=$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$appContainer")
if [[ "$previousRevision" =~ ^[a-f0-9]{40}$ && -d "$serverPath/releases/$previousRevision" && ! -L "$serverPath/releases/$previousRevision" ]]; then
  printf '%s\n' "$previousImage" > "$serverPath/releases/$previousRevision/imageId"
  if [[ ! -f "$serverPath/releases/$previousRevision/healthyAt" ]]; then date +%s > "$serverPath/releases/$previousRevision/healthyAt"; fi
  if ! registerManagedImage "$previousImage" "$previousRevision" "$(cat "$serverPath/releases/$previousRevision/healthyAt")"; then
    echo '::warning::Previous successful image could not be registered; unregistered images will not be removed by ID.' >&2
  fi
fi
stopped=true
"${compose[@]}" stop --timeout 30 omnistudio-next
docker exec "$mysqlContainer" sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump --user="$MYSQL_USER" --single-transaction --quick --routines --triggers --no-tablespaces "$MYSQL_DATABASE"' | gzip > "$backupDirectory/databasePending.sql.gz"
gzip -t "$backupDirectory/databasePending.sql.gz"
mv "$backupDirectory/databasePending.sql.gz" "$backupDirectory/database.sql.gz"
tar -C "$dataPath" --exclude='./deploymentMaintenance' -czf "$backupDirectory/appDataPending.tar.gz" .
gzip -t "$backupDirectory/appDataPending.tar.gz"
tar -tzf "$backupDirectory/appDataPending.tar.gz" >/dev/null
mv "$backupDirectory/appDataPending.tar.gz" "$backupDirectory/appData.tar.gz"
schemaFingerprint > "$backupDirectory/schemaFingerprint"
configFiles=(environment compose.yaml previousImage schemaFingerprint)
if [[ "$hadOverride" == true ]]; then configFiles+=(releaseCompose.yaml); fi
if [[ -f "$backupDirectory/deployedCommit" ]]; then configFiles+=(deployedCommit); fi
tar -C "$backupDirectory" -czf "$backupDirectory/deploymentConfig.tar.gz" "${configFiles[@]}"
gzip -t "$backupDirectory/deploymentConfig.tar.gz"
(cd "$backupDirectory" && sha256sum database.sql.gz appData.tar.gz deploymentConfig.tar.gz > checksums)
date +%s > "$backupDirectory/complete"
checkSpace
docker load < "$releaseDirectory/appImagePending.tar.gz"
image="omnistudio-next-app:$releaseCommit"
test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")" = "$releaseCommit"
test "$(docker image inspect --format '{{.Architecture}}' "$image")" = amd64
test "$(docker image inspect --format '{{index .Config.Labels "com.omnisline.walletCreditPrecision"}}' "$image")" = 6
expectedImage=$(docker image inspect --format '{{.Id}}' "$image")
cat > releaseComposePending.yaml <<YAML
services:
  mysql:
    image: "$previousMysqlImage"
    logging:
      driver: json-file
      options:
        max-size: "${logSizeMb}m"
        max-file: "$logFiles"
  omnistudio-next:
    image: "$image"
    environment:
      UTOOO_SEEDANCE_API_KEY: \${UTOOO_SEEDANCE_API_KEY:-}
      OMNISTUDIO_NEXT_PUBLIC_URL: \${OMNISTUDIO_NEXT_PUBLIC_URL:-}
    logging:
      driver: json-file
      options:
        max-size: "${logSizeMb}m"
        max-file: "$logFiles"
YAML
changed=true
mv releaseComposePending.yaml releaseCompose.yaml
compose=(docker compose -p omnistudio-next --env-file .env -f compose.yaml -f releaseCompose.yaml)
"${compose[@]}" up -d --no-build --no-deps mysql
waitMysqlHealthy
"${compose[@]}" up -d --no-build --no-deps omnistudio-next
waitHealthy "$expectedImage"
appContainer=$("${compose[@]}" ps -q omnistudio-next)
test "$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$appContainer")" = "$releaseCommit"
readDrainStatus >/dev/null
for container in "$appContainer" "$mysqlContainer"; do
  test "$(docker inspect --format '{{.HostConfig.LogConfig.Type}}' "$container")" = json-file
  test "$(docker inspect --format '{{index .HostConfig.LogConfig.Config "max-size"}}' "$container")" = "${logSizeMb}m"
  test "$(docker inspect --format '{{index .HostConfig.LogConfig.Config "max-file"}}' "$container")" = "$logFiles"
done
mv "$releaseDirectory/appImagePending.tar.gz" "$releaseDirectory/appImage.tar.gz"
printf '%s\n' "$expectedImage" > "$releaseDirectory/imageIdPending"
date +%s > "$releaseDirectory/healthyAtPending"
mv "$releaseDirectory/imageIdPending" "$releaseDirectory/imageId"
mv "$releaseDirectory/healthyAtPending" "$releaseDirectory/healthyAt"
printf '%s\n' "$releaseCommit" > deployedCommitPending
mv deployedCommitPending deployedCommit
committed=true
rm -f "$maintenanceFile" "$bootstrapFile"
trap - ERR HUP INT TERM
echo "Deployed $releaseCommit with complete backup $attempt."
if ! registerManagedImage "$expectedImage" "$releaseCommit" "$(cat "$releaseDirectory/healthyAt")"; then
  echo '::warning::Application is healthy, but immutable image registration failed; inspect managedImages.' >&2
fi
if ! bash "$releaseDirectory/deploymentRetention.sh" "$serverPath" "$keepReleases" "$keepBackups" "$backupDays" "$releaseCommit" "$attempt"; then
  echo '::warning::Application is healthy, but retention cleanup failed. Inspect deployment storage.' >&2
fi
df -h "$serverPath" "$dockerPath"
