#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() { printf '%s\n' "$*" >&2; exit 1; }
regularFile() { [[ -f "$1" && ! -L "$1" ]]; }

[[ $# -eq 6 || $# -eq 7 ]] || fail 'Usage: deploymentRetention.sh serverPath keepReleases keepBackupCount keepBackupDays currentCommit protectedBackup [--dryRun]'
serverPath=$1
keepReleases=$2
keepBackupCount=$3
keepBackupDays=$4
currentCommit=$5
protectedBackup=$6
dryRun=false
if [[ $# -eq 7 ]]; then
  [[ $7 == --dryRun ]] || fail 'Unknown option'
  dryRun=true
fi
for count in "$keepReleases" "$keepBackupCount" "$keepBackupDays"; do
  [[ $count =~ ^[1-9][0-9]{0,5}$ ]] || fail 'Retention counts and days must be positive integers'
done
[[ $currentCommit =~ ^[a-f0-9]{40}$ ]] || fail 'Invalid current commit'
[[ $protectedBackup =~ ^attempt[0-9]+x[0-9]+$ ]] || fail 'Invalid protected backup name'
[[ $serverPath == /* && $serverPath != / && $serverPath != *$'\n'* && $serverPath != *$'\t'* ]] || fail 'Deployment root must be an absolute path'
serverPath=${serverPath%/}
[[ -d $serverPath && ! -L $serverPath ]] || fail 'Deployment root must be an existing directory, not a symlink'
[[ $(realpath -e -- "$serverPath") == "$serverPath" ]] || fail 'Deployment root must be canonical and contain no symlinks'
regularFile "$serverPath/compose.yaml" || fail 'Deployment compose.yaml is missing or is a symlink'
releaseRoot="$serverPath/releases"
backupRoot="$serverPath/backups"
for directory in "$releaseRoot" "$backupRoot"; do
  [[ -d $directory && ! -L $directory && $(realpath -e -- "$directory") == "$directory" ]] || fail 'Release and backup roots must be existing real directories'
done
regularFile "$releaseRoot/$currentCommit/healthyAt" && regularFile "$releaseRoot/$currentCommit/imageId" || fail 'Current release has no valid success metadata'
[[ ! -L $releaseRoot/$currentCommit ]] || fail 'Current release must not be a symlink'
currentImage=$(cat "$releaseRoot/$currentCommit/imageId")
currentHealthyAt=$(cat "$releaseRoot/$currentCommit/healthyAt")
[[ $currentImage =~ ^sha256:[a-f0-9]{64}$ && $currentHealthyAt =~ ^[1-9][0-9]{0,10}$ ]] || fail 'Current release metadata is invalid'
protectedBackupDirectory="$backupRoot/$protectedBackup"
[[ -d $protectedBackupDirectory && ! -L $protectedBackupDirectory ]] || fail 'Protected backup must be a real directory'
regularFile "$protectedBackupDirectory/previousImage" || fail 'Rollback image metadata is missing'
rollbackImage=$(cat "$protectedBackupDirectory/previousImage")
[[ $rollbackImage =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'Rollback image metadata is invalid'
managedImageRoot="$serverPath/managedImages"
if [[ -e $managedImageRoot || -L $managedImageRoot ]]; then
  [[ -d $managedImageRoot && ! -L $managedImageRoot && $(realpath -e -- "$managedImageRoot") == "$managedImageRoot" ]] || fail 'Managed image root must be a real directory'
fi

# ACT: The caller holds deployLock; unknown legacy directories and backups are never inferred as managed entries.
now=$(date +%s)
backupCutoff=$((now - keepBackupDays * 86400))
pendingCutoff=$((now - 7 * 86400))
declare -A protectedImages=([$currentImage]=1 [$rollbackImage]=1)
declare -A oldImages=()
declare -A registeredCommits=()
declare -A imageRecordPaths=()
declare -a releaseRecords=()
declare -a backupRecords=()
declare -a pendingReleases=()
declare -a pendingBackups=()
releaseFiles=(appImage.tar.gz appImagePending.tar.gz imageChecksum deployServer.sh deploymentRetention.sh managedAt healthyAt healthyAtPending imageId imageIdPending)
backupFiles=(environment compose.yaml releaseCompose.yaml deployedCommit previousImage releaseImageId releaseHealthyAt releaseArchive.tar.gz checksums schemaFingerprint createdAt databasePending.sql.gz appDataPending.tar.gz database.sql.gz appData.tar.gz deploymentConfig.tar.gz complete)
containerList=$(docker ps -aq)
if [[ -n $containerList ]]; then
  mapfile -t containerIds <<< "$containerList"
  containerImages=$(docker inspect --format '{{.Image}}' "${containerIds[@]}")
  while IFS= read -r imageId; do
    [[ $imageId =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'Cannot verify container image references'
    protectedImages[$imageId]=1
  done <<< "$containerImages"
fi
imageRows=$(docker image ls --no-trunc --format '{{.Repository}}\t{{.Tag}}\t{{.ID}}' omnistudio-next-app)

for directory in "$releaseRoot"/*; do
  [[ -d $directory && ! -L $directory ]] || continue
  commit=${directory##*/}
  [[ $commit =~ ^[a-f0-9]{40}$ ]] || continue
  if [[ $commit != "$currentCommit" && ! -e $directory/healthyAt && ! -L $directory/healthyAt ]] && regularFile "$directory/managedAt"; then
    managedAt=$(cat "$directory/managedAt")
    if [[ $managedAt =~ ^[1-9][0-9]{0,10}$ && $managedAt -lt $pendingCutoff ]]; then pendingReleases+=("$commit"); fi
  fi
  regularFile "$directory/healthyAt" && regularFile "$directory/imageId" || continue
  healthyAt=$(cat "$directory/healthyAt")
  imageId=$(cat "$directory/imageId")
  [[ $healthyAt =~ ^[1-9][0-9]{0,10}$ && $imageId =~ ^sha256:[a-f0-9]{64}$ ]] || continue
  releaseRecords+=("$healthyAt"$'\t'"$commit"$'\t'"$imageId")
done
[[ ${#releaseRecords[@]} -gt 0 ]] || fail 'No managed successful releases found'
versionRecords=("${releaseRecords[@]}")
for recordFile in "$managedImageRoot"/image*; do
  regularFile "$recordFile" || continue
  recordName=${recordFile##*/}
  [[ $recordName =~ ^image[a-f0-9]{64}$ ]] || continue
  recordValue=$(cat "$recordFile")
  IFS=$'\t' read -r healthyAt commit extra <<< "$recordValue"
  [[ $healthyAt =~ ^[1-9][0-9]{0,10}$ && $commit =~ ^[a-f0-9]{40}$ && $recordValue == "$healthyAt"$'\t'"$commit" ]] || continue
  imageId="sha256:${recordName#image}"
  registeredCommits[$imageId]=$commit
  imageRecordPaths[$imageId]=$recordFile
  versionRecords+=("$healthyAt"$'\t'"$commit"$'\t'"$imageId")
done
mapfile -t versionRecords < <(printf '%s\n' "${versionRecords[@]}" | sort -t $'\t' -k1,1nr -k2,2r)
declare -A keptVersions=([$currentImage]=1)
for record in "${versionRecords[@]}"; do
  IFS=$'\t' read -r healthyAt commit imageId <<< "$record"
  if [[ ${#keptVersions[@]} -lt $keepReleases ]]; then keptVersions[$imageId]=1; fi
done
for imageId in "${!keptVersions[@]}"; do protectedImages[$imageId]=1; done

for directory in "$backupRoot"/*; do
  [[ -d $directory && ! -L $directory ]] || continue
  backupName=${directory##*/}
  [[ $backupName =~ ^attempt[0-9]+x[0-9]+$ ]] || continue
  if [[ $backupName != "$protectedBackup" && ! -e $directory/complete && ! -L $directory/complete ]] && regularFile "$directory/createdAt"; then
    createdAt=$(cat "$directory/createdAt")
    if [[ $createdAt =~ ^[1-9][0-9]{0,10}$ && $createdAt -lt $pendingCutoff ]]; then pendingBackups+=("$backupName"); fi
  fi
  regularFile "$directory/complete" || continue
  completeAt=$(cat "$directory/complete")
  [[ $completeAt =~ ^[1-9][0-9]{0,10}$ ]] || continue
  complete=true
  for fileName in database.sql.gz appData.tar.gz deploymentConfig.tar.gz; do
    if ! regularFile "$directory/$fileName" || [[ ! -s $directory/$fileName ]]; then complete=false; break; fi
  done
  if $complete; then backupRecords+=("$completeAt"$'\t'"$backupName"); fi
done

removeFile() {
  local file=$1
  regularFile "$file" || return 0
  [[ $(realpath -e -- "${file%/*}") == "${file%/*}" ]] || fail 'Cleanup target parent changed'
  printf '%s %s\n' "$($dryRun && printf 'Would remove' || printf 'Removing')" "$file"
  if ! $dryRun; then rm -- "$file"; fi
}

for record in "${releaseRecords[@]}"; do
  IFS=$'\t' read -r healthyAt commit imageId <<< "$record"
  [[ $commit != "$currentCommit" && ! ${protectedImages[$imageId]+present} ]] || continue
  oldImages[$imageId]=1
done
for imageId in "${!registeredCommits[@]}"; do
  if [[ ! ${protectedImages[$imageId]+present} ]]; then oldImages[$imageId]=1; fi
done

while IFS=$'\t' read -r repository tag imageId; do
  [[ $repository == omnistudio-next-app && $tag =~ ^[a-f0-9]{40}$ && ${oldImages[$imageId]+present} && ! ${protectedImages[$imageId]+present} ]] || continue
  referencedContainers=$(docker ps -aq --filter "ancestor=$imageId")
  if [[ -n $referencedContainers ]]; then protectedImages[$imageId]=1; continue; fi
  printf '%s %s:%s\n' "$($dryRun && printf 'Would remove image' || printf 'Removing image')" "$repository" "$tag"
  if $dryRun; then continue; fi
  if ! docker image rm "$repository:$tag"; then
    protectedImages[$imageId]=1
    printf 'Image and release archive retained because removal was refused: %s:%s\n' "$repository" "$tag" >&2
    continue
  fi
  if [[ ${imageRecordPaths[$imageId]+present} ]] && remainingImages=$(docker image ls --all --quiet --no-trunc) && [[ $'\n'"$remainingImages"$'\n' != *$'\n'"$imageId"$'\n'* ]]; then
    removeFile "${imageRecordPaths[$imageId]}"
  fi
done <<< "$imageRows"

for imageId in "${!registeredCommits[@]}"; do
  [[ ${oldImages[$imageId]+present} && ! ${protectedImages[$imageId]+present} ]] || continue
  imageMetadata=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}{{"\t"}}{{json .RepoTags}}{{"\t"}}{{json .RepoDigests}}' "$imageId" 2>/dev/null) || continue
  IFS=$'\t' read -r revision repoTags repoDigests <<< "$imageMetadata"
  [[ $revision == "${registeredCommits[$imageId]}" && ( $repoTags == '[]' || $repoTags == null ) && ( $repoDigests == '[]' || $repoDigests == null ) ]] || continue
  referencedContainers=$(docker ps -aq --filter "ancestor=$imageId")
  if [[ -n $referencedContainers ]]; then protectedImages[$imageId]=1; continue; fi
  printf '%s %s\n' "$($dryRun && printf 'Would remove registered image' || printf 'Removing registered image')" "$imageId"
  if $dryRun || docker image rm "$imageId"; then
    removeFile "${imageRecordPaths[$imageId]}"
  else
    protectedImages[$imageId]=1
    printf 'Registered image retained because removal was refused: %s\n' "$imageId" >&2
  fi
done

for record in "${releaseRecords[@]}"; do
  IFS=$'\t' read -r healthyAt commit imageId <<< "$record"
  [[ $commit != "$currentCommit" && ! ${protectedImages[$imageId]+present} ]] || continue
  directory="$releaseRoot/$commit"
  for fileName in "${releaseFiles[@]}"; do removeFile "$directory/$fileName"; done
  # Historical database dumps and any unrecognized files keep their directory intact.
  if ! $dryRun; then rmdir -- "$directory" 2>/dev/null || true; fi
done

if [[ ${#backupRecords[@]} -gt 0 ]]; then
  mapfile -t backupRecords < <(printf '%s\n' "${backupRecords[@]}" | sort -t $'\t' -k1,1nr -k2,2r)
  backupIndex=0
  for record in "${backupRecords[@]}"; do
    IFS=$'\t' read -r completeAt backupName <<< "$record"
    backupIndex=$((backupIndex + 1))
    [[ $backupIndex -gt $keepBackupCount && $completeAt -lt $backupCutoff && $backupName != "$protectedBackup" ]] || continue
    directory="$backupRoot/$backupName"
    for fileName in "${backupFiles[@]}"; do removeFile "$directory/$fileName"; done
    if ! $dryRun; then rmdir -- "$directory" 2>/dev/null || true; fi
  done
fi

for commit in "${pendingReleases[@]}"; do
  directory="$releaseRoot/$commit"
  for fileName in "${releaseFiles[@]}"; do removeFile "$directory/$fileName"; done
  if ! $dryRun; then rmdir -- "$directory" 2>/dev/null || true; fi
done
for backupName in "${pendingBackups[@]}"; do
  directory="$backupRoot/$backupName"
  for fileName in "${backupFiles[@]}"; do removeFile "$directory/$fileName"; done
  if ! $dryRun; then rmdir -- "$directory" 2>/dev/null || true; fi
done
