# AgentAsCode_BE
# Agent as Code Platform (Backend)

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.68.0+-green.svg)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue.svg)](https://www.postgresql.org/)

A powerful backend service for managing AI agents, tools, and deployments. This FastAPI-based application provides a robust API for creating, managing, and deploying AI agents with support for various tools and integrations.

## 🚀 Features

- **Agent Management**: Create, update, and manage AI agents
- **Project Organization**: Organize agents into projects
- **Tool Integration**: Extend functionality with various tools
- **Chat Interface**: Interact with agents through a chat interface
- **Deployment**: Deploy agents as standalone services
- **Vector Database**: Built-in support for ChromaDB
- **Azure Blob Storage**: Store and retrieve files from Azure Blob Storage

## 🛠️ Prerequisites

- Python 3.8+
- PostgreSQL 13+
- Docker (optional, for containerized deployment)
- Azure Storage Account (for Azure Blob Storage integration)
- OpenAI API Key (for LLM integration)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/HLokeshwariEmids/AgentAsCode_Backend.git
cd AAC_BACKEND
```

### 2. Set Up Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Database Configuration
POSTGRES_USER=your_postgres_user
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=agentascode

# Azure Storage Configuration
AZURE_STORAGE_CONNECTION_STRING=your_azure_storage_connection_string
AZURE_STORAGE_CONTAINER=your_container_name

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
```

### 3. Install Dependencies

```bash
# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 4. Database Setup

1. Make sure PostgreSQL is running
2. Create a new database named `agentascode` (or your preferred name)
3. Run database migrations (if any)

### 5. Run the Application

```bash
python main.py
```

The API will be available at `http://localhost:8080`


