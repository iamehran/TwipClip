# Contributing to TwipClip

Thank you for your interest in contributing to TwipClip! This guide will help you get started with contributing to the project.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Process](#development-process)
4. [Pull Request Process](#pull-request-process)
5. [Coding Standards](#coding-standards)
6. [Testing Guidelines](#testing-guidelines)
7. [Documentation](#documentation)
8. [Community](#community)

## Code of Conduct

### Our Pledge

We are committed to providing a friendly, safe, and welcoming environment for all contributors, regardless of experience level, gender identity and expression, sexual orientation, disability, personal appearance, body size, race, ethnicity, age, religion, nationality, or other similar characteristics.

### Expected Behavior

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members
- Be constructive in your feedback

### Unacceptable Behavior

- Harassment, discrimination, or offensive comments
- Personal attacks or trolling
- Publishing others' private information
- Any conduct which would be considered inappropriate in a professional setting

## Getting Started

### Prerequisites

1. **Fork the Repository**
   ```bash
   # Fork on GitHub, then clone your fork
   git clone https://github.com/yourusername/twipclip.git
   cd twipclip
   ```

2. **Set Up Development Environment**
   ```bash
   # Install dependencies
   npm install
   
   # Copy environment example
   cp env.example .env.local
   
   # Add your API keys to .env.local
   ```

3. **Install System Dependencies**
   - FFmpeg: [Installation Guide](https://ffmpeg.org/download.html)
   - yt-dlp: `pip install yt-dlp`

### Running the Project

```bash
# Development mode
npm run dev

# Run tests
npm test

# Type checking
npm run type-check

# Linting
npm run lint
```

## Development Process

### 1. Find an Issue

- Check the [Issues](https://github.com/yourusername/twipclip/issues) page
- Look for issues labeled `good first issue` or `help wanted`
- Comment on the issue to let others know you're working on it

### 2. Create a Branch

```bash
# Update your fork
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-number-description
```

### 3. Make Your Changes

- Write clean, readable code
- Follow the existing code style
- Add tests for new functionality
- Update documentation as needed

### 4. Commit Your Changes

```bash
# Stage your changes
git add .

# Commit with a descriptive message
git commit -m "feat: add new feature"
# or
git commit -m "fix: resolve issue with video processing"
```

#### Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

### 5. Push Your Changes

```bash
git push origin feature/your-feature-name
```

## Pull Request Process

### 1. Create a Pull Request

- Go to your fork on GitHub
- Click "New Pull Request"
- Select your feature branch
- Fill out the PR template

### 2. PR Template

```markdown
## Description
Brief description of what this PR does

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] Added new tests for changes
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] No commented-out code

## Related Issues
Fixes #123
```

### 3. Code Review

- Be open to feedback
- Respond to review comments
- Make requested changes
- Update your PR as needed

## Coding Standards

### TypeScript

```typescript
// Use explicit types
interface UserData {
  id: string;
  name: string;
  email: string;
}

// Use async/await over promises
async function fetchUser(id: string): Promise<UserData> {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

// Handle errors properly
try {
  const user = await fetchUser(userId);
} catch (error) {
  console.error('Failed to fetch user:', error);
  // Handle error appropriately
}
```

### React Components

```typescript
// Use functional components with TypeScript
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function Button({ label, onClick, disabled = false }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 bg-blue-500 text-white rounded"
    >
      {label}
    </button>
  );
}
```

### File Organization

```
app/
  components/
    Button.tsx        # Component file
    Button.test.tsx   # Test file
    Button.module.css # Styles (if needed)
  utils/
    validation.ts     # Utility functions
    validation.test.ts
```

## Testing Guidelines

### Unit Tests

```typescript
// Example test file
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with label', () => {
    render(<Button label="Click me" onClick={() => {}} />);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button label="Click me" onClick={handleClick} />);
    
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Integration Tests

```typescript
// Test API endpoints
describe('POST /api/process', () => {
  it('processes thread successfully', async () => {
    const response = await request(app)
      .post('/api/process')
      .send({
        thread: 'Test thread',
        videoUrls: ['https://youtube.com/watch?v=test']
      });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('results');
  });
});
```

## Documentation

### Code Documentation

```typescript
/**
 * Finds matching video clips for a given tweet
 * @param tweet - The tweet content to match
 * @param transcript - Video transcript segments
 * @param settings - Model configuration settings
 * @returns Array of matched clips with timestamps
 */
export async function findMatches(
  tweet: string,
  transcript: TranscriptSegment[],
  settings: ModelSettings
): Promise<Match[]> {
  // Implementation
}
```

### README Updates

When adding new features:
1. Update the feature list
2. Add usage examples
3. Update configuration options
4. Add troubleshooting tips

### API Documentation

For new endpoints:
1. Add to `docs/API.md`
2. Include request/response examples
3. Document error cases
4. Add rate limiting info

## Community

### Getting Help

- 💬 [Discussions](https://github.com/yourusername/twipclip/discussions) - Ask questions
- 🐛 [Issues](https://github.com/yourusername/twipclip/issues) - Report bugs
- 💡 [Ideas](https://github.com/yourusername/twipclip/discussions/categories/ideas) - Suggest features

### Communication Channels

- Be respectful and professional
- Search existing issues before creating new ones
- Provide detailed information when reporting bugs
- Include examples and screenshots when helpful

## Recognition

Contributors will be recognized in:
- The project README
- Release notes
- Special contributors section

Thank you for contributing to TwipClip! 🎉 