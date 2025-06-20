# MCP GitHub Project Manager

A comprehensive Model Context Protocol (MCP) server for GitHub project management with requirements traceability and advanced project workflows.

## 🚀 Features

- **GitHub Integration**: Full CRUD operations for projects, issues, milestones, and sprints
- **Requirements Traceability**: Link requirements → features → tasks with complete traceability
- **Real-time Sync**: Bidirectional synchronization with GitHub via webhooks
- **Template System**: PRD and task generation using structured templates
- **Persistence**: Intelligent caching and state management
- **MCP Compliance**: Full Model Context Protocol implementation with Zod validation

## 📋 Prerequisites

- Node.js 18+ 
- GitHub personal access token with appropriate permissions
- GitHub repository for project management

## 🔧 Installation

### Option 1: NPM Global Install

```bash
npm install -g mcp-github-project-manager
```

### Option 2: From Source

```bash
git clone https://github.com/Faresabdelghany/my-mcp-github-project-manager.git
cd my-mcp-github-project-manager
npm install
npm run build
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```bash
# Required
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_OWNER=your_github_username_or_organization  
GITHUB_REPO=your_repository_name

# Optional
PORT=3001
NODE_ENV=development
LOG_LEVEL=info
CACHE_DIRECTORY=.mcp-cache
SYNC_ENABLED=true
```

### GitHub Token Permissions

Your GitHub token needs these permissions:
- `repo` (Full repository access)
- `project` (Project access)
- `write:org` (Organization access)

## 🏃‍♂️ Usage

### Basic Usage

```bash
# Start the MCP server
mcp-github-project-manager

# With command line options
mcp-github-project-manager --token=your_token --owner=username --repo=repository

# Check configuration
mcp-github-project-manager status

# See all options
mcp-github-project-manager --help
```

### MCP Client Integration

#### Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "github-project-manager": {
      "command": "npx",
      "args": ["-y", "mcp-github-project-manager"],
      "env": {
        "GITHUB_TOKEN": "your_github_token",
        "GITHUB_OWNER": "your_username",
        "GITHUB_REPO": "your_repo"
      }
    }
  }
}
```

#### Other MCP Clients

The server supports standard MCP protocol over stdio transport.

## 🛠️ Development

### Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test
npm run test:coverage
```

### Project Structure

```
src/
├── index.ts              # CLI entry point
├── server.ts             # Main MCP server
├── config/               # Configuration management
├── tools/                # MCP tool implementations
│   └── base/             # Base tool classes
├── utils/                # Utility functions
│   ├── logger.ts         # Logging system
│   ├── errors.ts         # Error handling
│   └── validation.ts     # Validation utilities
└── __tests__/            # Test files
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:e2e

# Watch mode
npm run test:watch
```

## 📚 Next Steps

This is the core foundation of the MCP GitHub Project Manager. The following features will be implemented in subsequent phases:

### Phase 2: GitHub API Integration
- GitHub GraphQL and REST clients
- Authentication and rate limiting
- Error handling and retries

### Phase 3: Domain Models
- Project, Issue, Milestone entities
- Zod validation schemas
- TypeScript type definitions

### Phase 4: Resource Management
- Caching and persistence
- CRUD operations
- State management

### Phase 5: GitHub Tools
- Project management tools
- Issue and milestone tools
- Sprint planning tools

### Phase 6: Template System
- PRD generation templates
- Task breakdown templates
- Requirements traceability

### Phase 7: Real-time Events
- Webhook integration
- Event processing
- Real-time synchronization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Model Context Protocol](https://modelcontextprotocol.io)
- [GitHub GraphQL API](https://docs.github.com/en/graphql)
- [GitHub REST API](https://docs.github.com/en/rest)

## 📊 Status

This project is in active development. Current implementation status:

- ✅ Core MCP server foundation
- ✅ Configuration and validation system
- ✅ Tool registry and base classes
- ✅ CLI interface and error handling
- 🔄 GitHub API integration (next phase)
- ⏳ Domain models and schemas
- ⏳ Basic GitHub tools
- ⏳ Template system
- ⏳ Requirements traceability
- ⏳ Real-time events and webhooks

## 🙋‍♂️ Support

- Create an [issue](https://github.com/Faresabdelghany/my-mcp-github-project-manager/issues) for bugs or feature requests
- Check existing documentation and examples
- Review the configuration guide for setup issues

## 🚀 Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Faresabdelghany/my-mcp-github-project-manager.git
   cd my-mcp-github-project-manager
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your GitHub token and repository details
   ```

4. **Build and run:**
   ```bash
   npm run build
   npm start
   ```

5. **Or run in development:**
   ```bash
   npm run dev
   ```

The server will start and be ready to accept MCP protocol connections!