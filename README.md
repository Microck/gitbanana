<div align="center">
  <img src="https://litter.catbox.moe/061nlo6ed4mu2tlx.png" alt="gitbanana logo" width="220">
  <h1>gitbanana</h1>
</div>

`gitbanana` publishes a release asset from github actions to a GameBanana
submission.

it owns the GameBanana side only: upload the file, create the GameBanana update,
verify that the update links to the published file, and return stable outputs
for the rest of your workflow. your project still builds the asset, prepares
release notes, and creates or updates the github release.

## quickstart

```yaml
- name: Publish to GameBanana
  id: gitbanana
  uses: Microck/gitbanana@v1
  with:
    submission-id: ${{ vars.GAMEBANANA_SUBMISSION_ID }}
    asset: dist/example-${{ github.ref_name }}.zip
    release-tag: ${{ github.ref_name }}
    release-notes: ${{ steps.notes.outputs.markdown }}
    storage-state-b64-gz: ${{ secrets.GAMEBANANA_STORAGE_STATE_B64_GZ }}
```

use the outputs to link a github release back to GameBanana:

```yaml
- name: Create GitHub release
  env:
    GH_TOKEN: ${{ github.token }}
  run: |
    notes_file="$RUNNER_TEMP/release-notes.md"
    printf '%s\n\nGameBanana: %s\n' \
      '${{ steps.notes.outputs.markdown }}' \
      '${{ steps.gitbanana.outputs.file-url }}' > "$notes_file"

    gh release create "${{ github.ref_name }}" \
      "dist/example-${{ github.ref_name }}.zip" \
      --title "Example ${{ github.ref_name }}" \
      --notes-file "$notes_file" \
      --verify-tag
```

see [examples/release.yml](examples/release.yml) for a complete tag-based
workflow with build, notes, GameBanana publishing, github release publishing,
and failure artifact upload.

## authentication

GameBanana rejects username/password login from github-hosted runners through
anti-bot protections. `gitbanana` therefore uses Playwright storage state
captured from a real local browser session.

capture a secret locally:

```bash
npx gitbanana capture --submission-id 123456 --output gamebanana-state.txt
```

the command opens a headed browser on the GameBanana edit page for that
submission. log in, complete any verification, and wait for the file manager to
appear. `gitbanana` verifies edit access before it prints or writes secret
material, then emits a gzipped base64 Playwright storage-state value.

store it as a github secret:

```bash
gh secret set GAMEBANANA_STORAGE_STATE_B64_GZ --body-file gamebanana-state.txt
```

do not commit `gamebanana-state.txt`. treat it like a password because it can
impersonate the signed-in GameBanana account.

## inputs

| input | required | default | description |
| --- | --- | --- | --- |
| `submission-id` | yes | | GameBanana submission id. |
| `asset` | yes | | Local release asset path to upload. |
| `release-tag` | yes | | Release tag, such as `v1.2.3`. |
| `release-notes` | yes | | Markdown release notes text. |
| `storage-state-b64-gz` | yes* | | Gzip-compressed base64 Playwright storage state. |
| `storage-state-b64` | yes* | | Plain base64 Playwright storage state. Prefer the gzip form. |
| `release-name` | no | `release-tag` | GameBanana update name. |
| `api-section` | no | `Mod` | GameBanana API section name. |
| `page-section` | no | `mods` | GameBanana edit-page route section. |
| `browser` | no | `cloakbrowser` | Browser backend: `cloakbrowser` or `chromium`. |
| `debug-dir` | no | | Directory for sanitized failure artifacts. |

*Set exactly one storage-state input.

use `api-section` and `page-section` explicitly for non-mod submissions. they
are separate because GameBanana API section names and page routes are not the
same contract.

## outputs

| output | description |
| --- | --- |
| `file-id` | GameBanana file row id. |
| `file-url` | Public `https://gamebanana.com/mmdl/<file-id>` download URL. |
| `update-id` | GameBanana update row id. |
| `already-published` | `true` when a matching update/file already existed. |

the action intentionally does not expose raw GameBanana API payloads. the output
contract stays limited to stable identifiers and the public download URL.

## release notes

`gitbanana` accepts a small Markdown subset:

- `##` through `######` headings
- `-` or `*` bullet lists
- plain paragraphs

text is HTML-escaped before it is sent to GameBanana. bullet entries become
GameBanana changelog entries. headings containing `fix`, `remove`, `add`,
`change`, or `improve` map to the closest GameBanana changelog category.

this is deliberately not a full Markdown or HTML renderer. prepare complex
release notes in your workflow before passing them to the action.

## reruns

reruns are idempotent when the existing GameBanana update for the release is
already linked to a matching active file. in that case, `already-published` is
`true` and the same file/update identifiers are returned.

if an update exists but points at the wrong file, `gitbanana` fails with a clear
diagnostic instead of deleting or repairing remote GameBanana history. fix the
GameBanana update manually and rerun the workflow.

## debug artifacts

set `debug-dir` to collect sanitized failure artifacts:

```yaml
- name: Publish to GameBanana
  uses: Microck/gitbanana@v1
  with:
    submission-id: ${{ vars.GAMEBANANA_SUBMISSION_ID }}
    asset: dist/example-${{ github.ref_name }}.zip
    release-tag: ${{ github.ref_name }}
    release-notes: ${{ steps.notes.outputs.markdown }}
    storage-state-b64-gz: ${{ secrets.GAMEBANANA_STORAGE_STATE_B64_GZ }}
    debug-dir: ${{ runner.temp }}/gitbanana-debug

- name: Upload gitbanana debug artifacts
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: gitbanana-debug
    path: ${{ runner.temp }}/gitbanana-debug
    if-no-files-found: ignore
```

the action writes artifacts only when publishing fails. it does not upload them
itself, and it never logs raw Playwright storage state.

## local development

```bash
pnpm install
pnpm check
```

`pnpm check` runs typechecking, tests, and the build. the build writes the
github action bundle to `dist/index.js` and the CLI bundle to `dist/cli.cjs`.

useful local commands:

```bash
node dist/cli.cjs --help
node dist/cli.cjs verify-auth --submission-id 123456 --storage-state /path/to/storage-state.json
```

the normal test suite uses local fixtures and does not publish to GameBanana.
the opt-in smoke workflow verifies stored GameBanana API access when you provide
the required secret.

## license

`gitbanana` is licensed under the [MIT license](LICENSE).
