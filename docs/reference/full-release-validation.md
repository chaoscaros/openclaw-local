---
title: "Full Release Validation"
summary: "Operator guide for the full release validation workflow"
read_when:
  - Running the full release validation workflow
  - Rerunning focused release validation lanes
  - Checking package and Telegram release validation behavior
---

# Full Release Validation

The `Full Release Validation` workflow coordinates the pre-publish candidate
checks that run before release approval. It fans out normal CI, release checks,
package acceptance, live checks, QA lanes, performance checks, and the optional
Telegram package lane from one selected ref.

Use the workflow on `main` for normal release validation. The target ref can be
an existing release tag or the current full commit SHA for a validation-only
pre-publish candidate.

## Common inputs

- `ref`: release tag, stable correction tag, beta tag, or current full `main`
  SHA to validate
- `release_profile`: `full` runs the complete parent workflow; lighter profiles
  are for operator-directed reruns
- `rerun_group`: narrows the workflow to a focused lane such as `npm-telegram`,
  `package`, `cross-os`, or `qa`
- `cross_os_suite_filter`: narrows cross-OS release checks without changing the
  selected release candidate
- `live_suite_filter`: narrows live release checks
- `release_package_spec`: package spec used by package-aware release checks
- `npm_telegram_package_spec`: package spec used by the Telegram package lane

## Package candidate flow

Full profile runs prepare a package artifact named `release-package-under-test`.
That artifact represents the local candidate built from the target ref and is
used by package acceptance and the Telegram package lane when no published
package spec is supplied.

Focused package reruns that do not rebuild the parent package artifact must pass
either `release_package_spec` or a lane-specific package input. Do not rely on a
focused rerun to silently skip that package input; the operator summary calls
out whether the lane is using a published package spec or the parent artifact.

## Telegram package lane

The Telegram package lane validates a package through the
`npm-telegram-beta-e2e` workflow.

| Rerun group         | Behavior                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `all`               | Full profile uses the parent `release-package-under-test` artifact unless a package spec is provided. |
| `npm-telegram`      | Published-package Telegram E2E; requires `release_package_spec` or `npm_telegram_package_spec`.       |
| other focused lanes | Telegram package validation is skipped.                                                               |

If the package spec is blank in a full profile run, the workflow dispatches the
Telegram check with the current run artifact name and run id. If the package
spec is present, the child workflow installs that published package directly.

## Advisory lanes

QA release-check lanes are advisory. They are still useful release evidence, but
they do not replace the blocking package, install, and cross-OS checks. Treat an
advisory failure as a release decision input instead of an automatic publish
blocker unless the release owner explicitly promotes that lane to blocking.

## Operator summary

The parent workflow summary records:

- whether normal CI, performance, plugin prerelease, and release checks ran
- whether Package Acceptance used a SHA-built artifact or a package spec
- whether the Telegram package lane used a published package spec, the parent
  artifact, or skipped
- which filtered suites were applied, including `cross_os_suite_filter`

Check that summary before approving a publish. It is the fastest way to confirm
the workflow validated the intended package candidate rather than a stale or
unrelated package.
