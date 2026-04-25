# Lessons Learned

## Git Commits - No Co-Authored-By
- **Context**: The entire git history was sanitized to remove all Co-Authored-By trailers (observations 1640-1641)
- **Rule**: NEVER include `Co-Authored-By` trailers in commits for this repo
- **Mistake**: Added `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` to a commit despite the full history having been cleaned
