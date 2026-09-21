Utica-TS-CC  ·  feature/gis-v1  ·  GIS module upload
=====================================================

Target repo: mburkegr/Utica-TS-CC (the existing TypeScript repo). Do NOT create a new repo.

What this zip contains
  Every file that is new or modified relative to main (commit dec36df), in its
  final folder position. Unchanged files (engine/, fixtures, harness, most of
  ui/, data/) are not included and do not need re-uploading.

Upload steps (GitHub web UI)
  1. In Utica-TS-CC, create a branch named  feature/gis-v1  (branch dropdown → type the name → Create).
  2. On that branch, open the  utica-deal-model  folder → Add file → Upload files.
     Drag the CONTENTS of this zip's  utica-deal-model  folder (the subfolders
     gis, gis-data, ui, tests, dist and the loose files) onto the upload area.
     Chrome/Edge keep folder structure when you drag folders. 48 files, ~4 MB.
  3. Also upload the root  .gitignore  to the repository root on the same branch.
  4. Delete the old build:  utica-deal-model/dist/utica-deal-model.html
     (open it → trash icon → commit). It was renamed to dist/index.html.
  5. Commit to feature/gis-v1, then open a pull request into main when ready.

Result should match the branch in feature-gis-v1.bundle exactly (49 changes:
39 added, 9 modified, 1 deleted).

Modified files (overwrite):
  utica-deal-model/README.md
  utica-deal-model/build.mjs
  utica-deal-model/package.json
  utica-deal-model/tsconfig.json
  utica-deal-model/tests/run_all.ts
  utica-deal-model/tests/ui_boundary.test.ts
  utica-deal-model/ui/App.tsx
  utica-deal-model/ui/main.tsx
  utica-deal-model/ui/styles.css

Deleted file (remove by hand):
  utica-deal-model/dist/utica-deal-model.html

If you have git installed locally, the bundle preserves the seven milestone
commits instead of one upload commit:
  git clone https://github.com/mburkegr/Utica-TS-CC.git
  cd Utica-TS-CC
  git fetch /path/to/feature-gis-v1.bundle feature/gis-v1:feature/gis-v1
  git push origin feature/gis-v1
