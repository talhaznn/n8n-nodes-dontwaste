# Maintainer release process

1. Change the version and lockfile, run `npm ci --ignore-scripts`, `npm test`,
   and the isolated runtime test. Inspect `npm pack --dry-run` for secrets and
   unintended files.
2. Commit and tag `v<package version>` only after the checks pass.
3. Configure npm trusted publishing for GitHub repository
   `talhaznn/n8n-nodes-dontwaste`, workflow `publish.yml`, environment `npm`.
   Protect that GitHub environment with a required release reviewer.
4. Run the Publish npm package workflow against the version tag. It refuses
   an untagged branch and publishes with provenance without a stored npm token.
5. Verify registry integrity and perform a fresh installation of the exact
   published version before announcing it. Never overwrite an existing version.

The initial package may be published interactively with npm's required browser
confirmation. That does not assert npm provenance or n8n verification. Trusted
publishing must be configured on npm before using the workflow above.
