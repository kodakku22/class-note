## Summary

What changed and why?

## Area

- [ ] research-workflow
- [ ] ai-agent
- [ ] papers/books/lectures
- [ ] packaging/build
- [ ] security/privacy
- [ ] docs/community
- [ ] other

## Verification

- [ ] `npm run lint`
- [ ] `npm test -- --run`
- [ ] `npm run test:coverage`
- [ ] `npm run build`
- [ ] `npm run license:check`
- [ ] `npm audit`
- [ ] `npm audit --omit=dev`

For packaging or updater changes:

- [ ] `npm run dist`
- [ ] `npm run test:release-smoke`
- [ ] `npm run hash:release`
- [ ] `npm run test:release-artifacts`

## User Impact

Describe UI changes, migration needs, and whether existing Vault files are changed.

## AI / Privacy Impact

Does this send any new data outside the local Vault? If yes, explain the trigger,
destination, and user control.

## Security / Operations Impact

- [ ] IPC or filesystem access changed
- [ ] Vault index/search/backlinks changed
- [ ] Diagnostics/logging/telemetry changed
- [ ] Release/signing/update behavior changed
- [ ] No security-sensitive behavior changed

Explain mitigations, rollback behavior, and any docs updated.

## Screenshots

Add screenshots or short clips for UI changes.
