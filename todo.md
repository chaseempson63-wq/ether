# Ether MVP - Project TODO

## Core Features

### Authentication & User Management
- [x] User authentication with Manus OAuth integration
- [x] Role-based access control (admin/user)
- [x] User profile management (name, bio, headline)
- [ ] Admin dashboard for user management

### Memory & Data Capture
- [x] Daily Reflection interface for capturing memories
- [ ] Voice memo support with file upload
- [ ] Voice transcription integration (Whisper API)
- [x] Decision logging with reasoning capture
- [x] Core values input interface
- [x] Memory tagging and categorization

### Database Schema & Vector Search
- [x] Profiles table with user metadata
- [x] Memories table with vector embeddings
- [x] Reasoning patterns table with decision logic
- [x] Core values table with belief statements
- [x] Beneficiaries table for inheritance management
- [ ] pgvector integration for semantic search
- [x] Migration scripts for schema deployment

### AI Persona Engine
- [x] System prompt generation based on user reasoning
- [x] RAG (Retrieval-Augmented Generation) implementation
- [x] Truthfulness tagging system (Known Memory / Likely Inference / Speculation)
- [x] Response generation with confidence levels
- [x] Tone and style mirroring based on stored patterns
- [x] LLM integration with OpenAI GPT-4o

### Chat Interface
- [x] RAG-based AI chat component
- [x] Message history display
- [ ] Streaming response support
- [x] Truthfulness tag display on responses
- [x] "Second Mind" conversation mode (user talking to themselves)
- [x] Citation of source memories in responses

### Interview Mode
- [x] AI-generated interview prompts
- [x] Question categories (values, decisions, lessons, beliefs)
- [x] Conversational interview flow
- [ ] Auto-capture of responses as memories
- [x] Interview session history

### Dashboard
- [x] Memory timeline visualization
- [x] Reasoning patterns overview
- [x] Core values summary
- [ ] AI accuracy metrics
- [x] Memory statistics (count, sources, dates)
- [x] Quick access to recent memories

### Beneficiary Management
- [x] Beneficiary profile creation
- [x] Access level assignment (full/restricted/legacy_only)
- [ ] Memory-specific access controls
- [ ] Beneficiary invitation system

### Legacy Mode
- [x] Toggle to preview AI responses as if for beneficiaries
- [ ] Restricted memory filtering
- [ ] Legacy-specific tone adjustments
- [ ] Beneficiary-facing interface preview

### Voice & Media
- [ ] Voice memo recording interface
- [ ] Audio file upload
- [x] Transcription processing (via Whisper API)
- [x] Transcript storage and search

### Testing & Quality
- [ ] Unit tests for core procedures (vitest)
- [ ] RAG retrieval accuracy tests
- [ ] Persona Engine response tests
- [x] End-to-end flow testing
- [ ] Voice transcription integration tests

### Deployment & Documentation
- [x] Environment variables configuration
- [x] Database migration documentation
- [x] API documentation (tRPC procedures)
- [ ] User onboarding guide

## Phase 2 Features (Post-MVP)
- [ ] Advanced analytics on memory patterns
- [ ] Multi-language support
- [ ] Video avatar generation
- [ ] Marketplace for accessing other digital minds
- [ ] Smart contract integration for inheritance
- [ ] Mobile app (React Native)
- [ ] Real-time collaboration features

## Known Constraints
- Truthfulness tagging must be clear and visible to beneficiaries
- All file uploads must go to S3 (no local storage)
- Voice transcription limited to 16MB files
- Database timestamps stored as UTC
- All responses must maintain Chase's core values and reasoning patterns
