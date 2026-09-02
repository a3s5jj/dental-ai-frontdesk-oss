-- Dental AI Front Desk - Supabase RAG schema
-- Run ONCE in the Supabase SQL Editor (Dashboard > SQL Editor > New query > paste > Run).
-- Creates the knowledge store that three things share:
--   * workflows/knowledge_ingestion.json  writes chunks here from a Google Drive folder
--   * tools/kb_ingest.mjs                 writes chunks here from a local PDF
--   * workflows/dental_front_desk.json    searches here via the search_knowledge tool
--
-- Embeddings = OpenAI text-embedding-3-small, 1536 dimensions. The vector(1536) below MUST
-- match the embedding nodes in the workflows, or similarity search returns garbage.

-- 1) Enable the pgvector extension (safe to re-run).
create extension if not exists vector;

-- 2) The knowledge table. One row = one chunk of an uploaded file.
create table if not exists documents (
  id        bigserial primary key,
  content   text,                 -- the chunk's text
  metadata  jsonb,                 -- { source: filename, file_id: ... }
  embedding vector(1536)           -- OpenAI embedding of `content`
);

-- 3) Similarity index for fast search (cosine distance, HNSW).
create index if not exists documents_embedding_idx
  on documents using hnsw (embedding vector_cosine_ops);

-- 4) The search function the agent's search_knowledge tool calls.
--    Given a query vector, returns the closest chunks by cosine similarity.
create or replace function match_documents (
  query_embedding vector(1536),
  match_count int default null,
  filter jsonb default '{}'
) returns table (
  id        bigint,
  content   text,
  metadata  jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
