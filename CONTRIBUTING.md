# Contributing to SitotaBot

First off, thank you for considering contributing to SitotaBot! It's people like you that make SitotaBot such a great tool.

## Where do I go from here?

If you've noticed a bug or have a feature request, make sure to check our [Issues](https://github.com/yourusername/sitotabot/issues) if one already exists. If not, go ahead and create a new issue!

## Fork & create a branch

If this is something you think you can fix, then fork SitotaBot and create a branch with a descriptive name.

A good branch name would be (where issue #325 is the ticket you're working on):

```sh
git checkout -b 325-add-new-feature
```

## Get the test suite running

Make sure you have Node.js 20+ and PostgreSQL installed. 

1. Install dependencies: `npm install`
2. Set up your environment: `cp .env.example .env` and fill it out
3. Run the tests: `npm test`

Make sure all tests pass before you start writing your own.

## Implement your fix or feature

At this point, you're ready to make your changes! Feel free to ask for help; everyone is a beginner at first.

## Make a Pull Request

At this point, you should switch back to your master branch and make sure it's up to date with SitotaBot's main branch:

```sh
git remote add upstream https://github.com/yourusername/sitotabot.git
git checkout main
git pull upstream main
```

Then update your feature branch from your local copy of main, and push it!

```sh
git checkout 325-add-new-feature
git rebase main
git push --set-upstream origin 325-add-new-feature
```

Finally, go to GitHub and make a Pull Request.

## Code Style

- We use standard TypeScript styling and `tsc` for linting.
- Ensure that you format your code before submitting a PR.
- Add tests for your changes.

Thanks for contributing!
