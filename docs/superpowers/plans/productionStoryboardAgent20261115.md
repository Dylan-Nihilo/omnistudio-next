# Production Storyboard Agent Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with review checkpoints. Do not add test files; use the direct acceptance procedures in Task 4.

**Goal:** Let a production-project editor generate and review an episode storyboard draft with the existing storyboard team, then commit all draft shots atomically against the script revision that informed them.

**Architecture:** Read the authoritative script document, episode, and project assets from the production database. Run the existing read-only `storyboardTeam` with a selected platform text model and persist its structured output as a revisioned pending draft. Let the user edit and save that draft; on confirmation, revalidate project, episode, script revision, assets, and numbering in one database transaction before inserting scenes and shots.

**Tech Stack:** Bun, TypeScript, Express, Drizzle ORM, MySQL, Vue 3, existing platform model and team-agent runtime.

**Spec:** `docs/superpowers/plans/agentSkillMarketplacePlan20261114.md`, Phase Four vertical slice.

## Global Constraints

- Keep working on `codex/enterprise-comic-p0`; do not switch to or modify `master`.
- Do not add test files or test-only wrappers; use direct service/API/UI exercises in isolated data.
- Keep production project database state authoritative; drafts are revisioned proposals and do not advance project status.
- Agents may return text proposals only; media generation and approval remain separate user-controlled actions.
- Server routes are one HTTP method/path per file; regenerate `src/router.ts` with `bun run routes`.
- New file and directory names use lower camel case; Vue files order sections as template, script, style.

---

### Task 1: Persist Revisioned Storyboard Drafts

**Files:**
- Modify `apps/server/src/db/schema.ts` to add `productionStoryboardDrafts` with project, episode, source script revision, draft revision, model, team/skill versions, JSON draft, status, actor, and timestamps.
- Create `apps/server/src/db/migrations/userIdentityProduction12StoryboardDrafts.sql` with the matching InnoDB table, project/episode foreign keys, and one current draft per project/episode.
- Create `apps/server/src/services/productionStoryboardService.ts` for source loading, draft persistence, draft editing, and atomic confirmation.

**Interfaces:**
- `generateProductionStoryboardDraft(input: { projectId: string; episodeId: string; providerId: string; modelId: string; directory: string })` returns the stored pending draft and source revision.
- `getProductionStoryboardDraft(projectId: string, episodeId: string)` returns the latest pending draft and whether its source script revision is current.
- `saveProductionStoryboardDraft(input: { projectId: string; episodeId: string; expectedDraftRevision: number; draft: StoryboardDraft })` increments the draft revision only when the stored revision matches.
- `confirmProductionStoryboardDraft(input: { projectId: string; episodeId: string; expectedScriptRevision: number; expectedDraftRevision: number; draft: StoryboardDraft })` inserts all scenes and shots in one transaction and records the source revision, team/skill versions, model, and created IDs in the audit event.

- [ ] Read the latest script record, target episode, assets, project status, and project membership before model execution.
- [ ] Reject episodes that already contain scenes in this first slice; never replace existing shots.
- [ ] Store a successful model result as a pending draft; validate its JSON and field limits before persistence.
- [ ] During save and confirm, lock the project row and compare both source script revision and draft revision.
- [ ] In the confirm transaction, validate duplicate-free asset references, project/episode ownership, positive durations, and generated numbering; insert scenes and shots together or insert none.
- [ ] Run `bun run typecheck` in `apps/server` and inspect the SQL/schema types.

### Task 2: Expose Authenticated Draft Operations

**Files:**
- Create `apps/server/src/routes/productionProjects/storyboard/generateDraft.ts` (`POST`).
- Create `apps/server/src/routes/productionProjects/storyboard/getDraft.ts` (`GET`).
- Create `apps/server/src/routes/productionProjects/storyboard/saveDraft.ts` (`PUT`).
- Create `apps/server/src/routes/productionProjects/storyboard/confirmDraft.ts` (`POST`).
- Modify generated `apps/server/src/router.ts` only via `bun run routes`.

**Interfaces:**
- Every endpoint validates UUIDs and strict request bodies, uses `requireAuth`; mutations also use `requireCsrf`.
- Generation requires an enabled platform text model and a valid account workspace directory. The team receives only read/list tools.
- Save and confirm require explicit expected draft and script revisions; stale requests return 409 without changing production rows.

- [ ] Add one route file per endpoint and route each call to the production storyboard service.
- [ ] Include only bounded prompt context: the selected episode's current script, relevant assets, and explicit output schema.
- [ ] Keep AI output in the pending draft table; none of these endpoints starts image, video, or audio generation.
- [ ] Run `bun run routes`, `bun run typecheck`, and `bun run build` in `apps/server`.

### Task 3: Add the Review and Confirmation Flow

**Files:**
- Create `apps/web/src/pages/productionProjects/productionStoryboardDraft.vue` for episode selection, structured scene/shot editing, save, confirm, loading, stale-source, and error states.
- Modify `apps/web/src/pages/productionProjects/detail.vue` to launch the draft panel from the scripted or storyboarded step and refresh the project after confirmation.

**Interfaces:**
- The component receives `projectId`, available episodes, model options, project role, and busy state; it emits `confirmed` after the server commits.
- Use the existing platform text model list/default and existing authenticated API client conventions.

- [ ] Load or resume the stored draft for the selected episode on open.
- [ ] Disable confirmation when the source script revision is stale or the user lacks project create permission.
- [ ] Save edits with optimistic draft revision; show conflicts without discarding local edits.
- [ ] Confirm once, then refresh the project and show the committed scenes/shots in the existing storyboard workspace.
- [ ] Run `bun run typecheck` and `bun run build` in `apps/web`; inspect the production page at desktop and mobile widths.

### Task 4: Stage Acceptance

- [ ] In an isolated test project with a current script, assets, and an empty episode, generate a storyboard draft and verify the stored project/episode/script/team/skill/model references.
- [ ] Edit and save the draft, refresh the page, and verify the saved draft is restored.
- [ ] Change the script revision and confirm the old draft; expect 409 and zero new scenes/shots.
- [ ] Confirm a current draft and verify all scenes/shots appear after refresh with `draft` status and one audit event.
- [ ] Submit an invalid asset ID and duplicate numbering; expect rejection and zero partial inserts.
- [ ] Verify viewer/reviewer roles cannot generate, edit, or confirm; verify no media generation job is created.
- [ ] Write a phase-specific acceptance report before beginning the next roadmap phase.

Current evidence: [Phase Four Storyboard Agent Acceptance Report](../reports/productionStoryboardAgentPhaseAcceptance20261115.md). The implementation and rejection-path checks pass, but real model generation remains intentionally unexecuted until a user confirms the displayed credit estimate in the production UI; do not start Phase Five before that evidence is recorded.
