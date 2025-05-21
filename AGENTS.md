# Instructions for codex agents

This repository hosts a static website for a contractor pay estimator. The project uses plain HTML, CSS and JavaScript located in the `docs/` directory and has no automated tests.

## Formatting
- Use two spaces for indentation and keep lines under 120 characters when possible.
- When you modify any `docs/*.js`, `docs/*.css` or `docs/*.html` files, run the following command on the files you changed:
  ```
  npx prettier --check <files>
  ```
  If Prettier reports issues, run the same command with `--write` and commit the result.

## Testing
There are currently no automated tests for this repository. Simply ensure Prettier passes for any files you modify.

## Pull request guidelines
- Mention key files changed in the summary.
- State that Prettier was run on affected files and passed.

