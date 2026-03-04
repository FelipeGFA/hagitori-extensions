## Description

<!-- What does this PR do? New extension, bug fix, or update? -->

## Extension

- **Name**: <!-- e.g., MangaDex -->
- **Language**: <!-- e.g., Multi, pt-br, en -->
- **Type**: <!-- New extension / Update / Fix -->

## Checklist

- [ ] Bumped `version` in `package.json`
- [ ] Entry point file matches folder name
- [ ] Extension builds without errors (`npx tsc --noEmit`)
- [ ] Tested all implemented methods (`getManga`, `getChapters`, `getPages`)
- [ ] Added `icon.png` if it's a new extension
- [ ] Set `supportsDetails: true` only if `getDetails()` is implemented
- [ ] Set required `capabilities` (`"browser"`, `"crypto"`) if used
- [ ] Domains list is accurate and complete