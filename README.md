# GitHub Project Manager MCP

A comprehensive Model Context Protocol (MCP) server for GitHub project management with advanced project workflows, issue tracking, milestone management, and requirements traceability.

## 🚀 Features

### Core GitHub Management
- **Project Management**: Full CRUD operations for GitHub Projects v2
- **Issue Management**: Create, read, update, and list issues with advanced filtering
- **Milestone Management**: Comprehensive milestone tracking with progress metrics
- **Label Management**: Create and manage repository labels
- **Repository Operations**: Basic repository management capabilities

### Advanced Capabilities
- **Schema Validation**: Type-safe operations with Zod validation
- **Error Handling**: Comprehensive error handling with detailed logging
- **Rate Limiting**: Built-in GitHub API rate limit handling
- **Progress Tracking**: Real-time progress metrics for milestones and projects
- **Filtering & Pagination**: Advanced filtering and pagination for all list operations
- **Bulk Operations**: Support for bulk operations (configurable)

### Developer Experience
- **TypeScript**: Fully typed with comprehensive interfaces
- **Logging**: Structured logging with Winston
- **Configuration**: Environment-based configuration with validation
- **Testing**: Jest testing framework setup
- **Linting**: ESLint and Prettier for code quality

## 📦 Installation

### Prerequisites
- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- GitHub Personal Access Token

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Faresabdelghany/my-mcp-github-project-manager.git
   cd my-mcp-github-project-manager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Start the server**
   ```bash
   npm start
   ```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Environment
NODE_ENV=development

# Server Configuration
SERVER_NAME="GitHub Project Manager MCP"
SERVER_VERSION="1.0.0"
SERVER_HOST=localhost
SERVER_PORT=3000
SERVER_TIMEOUT=30000

# GitHub Configuration
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_API_URL=https://api.github.com
GITHUB_USER_AGENT="GitHub-Project-Manager-MCP/1.0.0"
GITHUB_DEFAULT_OWNER=your_username
GITHUB_DEFAULT_REPO=your_repo
GITHUB_RATE_LIMIT_REQUESTS=5000
GITHUB_RATE_LIMIT_WINDOW=3600000

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=text
LOG_ENABLE_COLORS=true
LOG_ENABLE_TIMESTAMP=true
LOG_MAX_FILES=5
LOG_MAX_SIZE=10MB

# Tool Configuration
TOOLS_TIMEOUT=30000
TOOLS_RETRIES=3
TOOLS_ENABLE_METRICS=true
TOOLS_ENABLE_CACHING=false

# Feature Flags
FEATURE_PROJECTS_V2=true
FEATURE_ADVANCED_SEARCH=true
FEATURE_BULK_OPERATIONS=false
FEATURE_WEBHOOKS=false
```

### GitHub Token Setup

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate a new token with the following permissions:
   - `repo` (Full control of private repositories)
   - `project` (Full control of projects)
   - `write:org` (Write org and team membership, read and write org projects)

## 🛠️ Usage

### Available Tools

#### Project Management Tools

| Tool | Description | Input |
|------|-------------|-------|
| `create_project` | Create a new GitHub project | `{ title, shortDescription?, owner, visibility }` |
| `list_projects` | List GitHub projects | `{ status?, limit? }` |
| `get_project` | Get project details | `{ projectId, includeItems? }` |
| `update_project` | Update project properties | `{ projectId, title?, description?, status?, visibility? }` |
| `delete_project` | Delete a project | `{ projectId }` |

#### Issue Management Tools

| Tool | Description | Input |
|------|-------------|-------|
| `create_issue` | Create a new issue | `{ title, description, assignees, labels, milestoneId?, priority?, type? }` |
| `list_issues` | List repository issues | `{ status?, assignee?, labels?, milestone?, sort?, direction?, limit? }` |
| `get_issue` | Get issue details | `{ issueId }` |
| `update_issue` | Update issue properties | `{ issueId, title?, description?, status?, assignees?, labels?, milestoneId }` |

#### Milestone Management Tools

| Tool | Description | Input |
|------|-------------|-------|
| `create_milestone` | Create a new milestone | `{ title, description, dueDate? }` |
| `list_milestones` | List repository milestones | `{ status?, sort?, direction? }` |
| `get_milestone` | Get milestone details | `{ milestoneId }` |

### Example Usage

#### Creating a Project
```json
{
  "tool": "create_project",
  "arguments": {
    "title": "My New Project",
    "shortDescription": "A project for managing tasks",
    "owner": "myusername",
    "visibility": "private"
  }
}
```

#### Creating an Issue
```json
{
  "tool": "create_issue",
  "arguments": {
    "title": "Add user authentication",
    "description": "Implement OAuth authentication with GitHub and Google providers",
    "assignees": "developer1,developer2",
    "labels": "feature,authentication,high-priority",
    "priority": "high",
    "type": "feature"
  }
}
```

#### Listing Issues with Filters
```json
{
  "tool": "list_issues",
  "arguments": {
    "status": "open",
    "assignee": "developer1",
    "labels": ["bug", "high-priority"],
    "sort": "updated",
    "direction": "desc",
    "limit": 20
  }
}
```

## 🏗️ Architecture

### Project Structure
```
src/
├── config/           # Configuration management
├── domain/
│   ├── schemas/      # Zod validation schemas
│   └── types/        # TypeScript type definitions
├── infrastructure/
│   └── github/       # GitHub API client
├── tools/
│   ├── base/         # Base tool classes
│   └── github/       # GitHub-specific tools
├── types/            # Common type definitions
├── utils/            # Utility functions
└── server.ts         # Main MCP server
```

### Key Components

- **BaseTool**: Abstract base class for all tools with validation, logging, and error handling
- **ToolRegistry**: Manages tool registration, discovery, and execution
- **GitHubClient**: Wrapper around Octokit for GitHub API operations
- **MCPServer**: Main server implementation with MCP protocol handling

## 🧪 Development

### Available Scripts

```bash
# Development
npm run dev          # Start development server with hot reload
npm run build        # Build the project
npm run start        # Start production server

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm run type-check   # Run TypeScript type checking
npm run validate     # Run all validation checks

# Testing
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report

# Utilities
npm run clean        # Clean build artifacts
```

### Adding New Tools

1. **Create the tool class**
   ```typescript
   import { BaseTool } from '@/tools/base/BaseTool.js';
   import { z } from 'zod';
   
   export class MyNewTool extends BaseTool {
     public readonly metadata = {
       name: 'my_new_tool',
       description: 'Description of what this tool does',
       category: 'github',
       subcategory: 'issues'
     };
     
     public readonly schema = z.object({
       // Define input schema
     });
     
     protected async executeImpl(args: any) {
       // Implement tool logic
       return this.createSuccessResponse(result);
     }
   }
   ```

2. **Register the tool**
   ```typescript
   // In src/tools/github/index.ts
   import { MyNewTool } from './MyNewTool.js';
   
   export async function registerGitHubTools(registry: ToolRegistry) {
     // ... existing registrations
     await registry.registerTool(new MyNewTool());
   }
   ```

### Testing

The project uses Jest for testing. Test files should be placed in the `tests/` directory or alongside source files with `.test.ts` or `.spec.ts` extensions.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 📊 Monitoring & Logging

### Logging

The application uses Winston for structured logging with the following levels:
- **error**: Error conditions
- **warn**: Warning conditions
- **info**: Informational messages
- **debug**: Debug-level messages

Logs include:
- Tool execution metrics
- GitHub API call statistics
- Error tracking with stack traces
- Performance metrics

### Error Handling

Comprehensive error handling includes:
- **Operational Errors**: Expected errors (validation, API errors)
- **Programming Errors**: Unexpected errors (bugs)
- **Rate Limiting**: GitHub API rate limit handling
- **Timeout Handling**: Request timeout management

## 🔒 Security

### Best Practices
- Environment variables for sensitive configuration
- Input validation with Zod schemas
- Sanitized logging (sensitive data redaction)
- Secure GitHub token handling
- Rate limiting compliance

### GitHub Permissions

Minimum required GitHub token permissions:
- `repo`: Repository access
- `project`: Project management
- `write:org`: Organization projects (if applicable)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Run validation: `npm run validate`
5. Commit your changes: `git commit -am 'Add feature'`
6. Push to the branch: `git push origin feature-name`
7. Submit a pull request

### Development Guidelines

- Follow TypeScript best practices
- Write comprehensive tests
- Use conventional commit messages
- Update documentation for new features
- Ensure all CI checks pass

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

- **Documentation**: Check this README and inline code comments
- **Issues**: [GitHub Issues](https://github.com/Faresabdelghany/my-mcp-github-project-manager/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Faresabdelghany/my-mcp-github-project-manager/discussions)

## 🗺️ Roadmap

- [ ] Advanced project field management
- [ ] Webhook support for real-time updates
- [ ] Project templates and automation
- [ ] Advanced analytics and reporting
- [ ] Integration with other project management tools
- [ ] GraphQL API support for Projects v2
- [ ] Bulk operations for issues and milestones
- [ ] Custom project workflows

---

**Built with ❤️ using TypeScript, Model Context Protocol, and GitHub APIs**
