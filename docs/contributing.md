# Contributing to OpenMesh

Thank you for your interest in contributing! OpenMesh is an open-source project and we welcome contributions of all kinds.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/openmesh.git`
3. Install dependencies: `pnpm install && pnpm setup`
4. Create a branch: `git checkout -b feature/your-feature`

## Development Workflow

```bash
pnpm dev          # Start all services
pnpm lint         # Run ESLint
pnpm type-check   # Run TypeScript checks
pnpm test         # Run tests
pnpm format       # Format code with Prettier
```

## Code Standards

- **TypeScript everywhere** — No plain JavaScript files
- **Feature-based architecture** — Group related code by feature
- **SOLID principles** — Single responsibility, dependency inversion
- **Meaningful names** — Self-documenting code over comments
- **Tests** — Add tests for new functionality
- **Accessibility** — WCAG 2.1 AA compliance for UI changes

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add device discovery via mDNS
fix: resolve WebSocket reconnection loop
docs: update SDK guide with examples
refactor: extract chunk manager to transfer package
test: add room manager unit tests
```

## Pull Request Process

1. Ensure all checks pass (`pnpm lint && pnpm type-check && pnpm test`)
2. Update documentation if needed
3. Fill out the PR template
4. Request review from maintainers

## Code of Conduct

Be respectful, inclusive, and constructive. We're building something great together.

## Questions?

Open a [GitHub Discussion](https://github.com/openmesh/openmesh/discussions) or join our community chat.
