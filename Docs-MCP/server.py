from fastmcp import FastMCP
import os
import re
import json
import uuid
import requests
from typing import Optional, List, Dict, Any, Tuple
from urllib.parse import urljoin, urlparse
from collections import deque
import mimetypes
from docling.document_converter import DocumentConverter


from langchain_huggingface.embeddings import HuggingFaceEmbeddings
from langchain_postgres import PGVector

from dotenv import load_dotenv

load_dotenv()

# Optional HTML → Markdown
try:
    from bs4 import BeautifulSoup  # type: ignore
except Exception:
    BeautifulSoup = None  # type: ignore

try:
    from markdownify import markdownify as md  # type: ignore
except Exception:
    md = None  # type: ignore

try:
    from readability import Document  # type: ignore
except Exception:
    Document = None  # type: ignore

# ---- Server ----
mcp = FastMCP("Docs-MCP")

# ---- PGVector config ----
PG_USER = os.getenv("POSTGRES_USER")
PG_PASSWORD = os.getenv("POSTGRES_PASSWORD")
PG_HOST = os.getenv("POSTGRES_HOST", "localhost")
PG_DB = os.getenv("POSTGRES_DB")
PG_PORT = os.getenv("POSTGRES_PORT", "5432")
PG_COLLECTION = os.getenv("PG_COLLECTION", "docs_mcp")
EMBED_MODEL = os.getenv("EMBED_MODEL", "BAAI/bge-small-en")

if not all([PG_USER, PG_PASSWORD, PG_HOST, PG_DB]):
    raise RuntimeError("Missing required Postgres env vars")

PG_CONN = f"postgresql+psycopg://{PG_USER}:{PG_PASSWORD}@{PG_HOST}:{PG_PORT}/{PG_DB}"

# ---- Embeddings & VectorStore ----
_embeddings = HuggingFaceEmbeddings(
    model_name=EMBED_MODEL,
    model_kwargs={"device": "cpu"},
    encode_kwargs={"normalize_embeddings": True},
)

_vector = PGVector(
    embeddings=_embeddings,
    collection_name=PG_COLLECTION,
    connection=PG_CONN,
    use_jsonb=True,
)

# ---- Helpers ----


def extract_text_with_docling(source_path: str) -> str:
    converter = DocumentConverter()
    doc = converter.convert(source_path).document
    return doc.export_to_markdown()


def _html_to_markdown(html: str) -> Tuple[str, str]:
    """Convert HTML to clean, readable markdown using readability extraction."""
    if not html:
        return "", ""

    # Use readability to extract main content (like Reader Mode)
    if Document is not None:
        try:
            doc = Document(html)
            title = doc.title()
            clean_html = doc.summary()

            # Now convert the clean HTML to markdown
            if md is not None:
                try:
                    markdown_content = md(
                        clean_html,
                        heading_style="ATX",
                        bullets="-",
                        code_language="",
                        strip=["script", "style", "noscript"],
                    )
                    # Add title at the top
                    if title:
                        markdown_content = f"# {title}\n\n{markdown_content.strip()}"
                    return clean_html, markdown_content.strip()
                except Exception:
                    pass

            # Fallback: Use BeautifulSoup on clean HTML
            if BeautifulSoup is not None:
                return clean_html, _convert_html_to_markdown_manual(clean_html)

        except Exception as e:
            print(f"Readability extraction failed: {e}")
            pass

    # If readability not available, try to clean HTML manually first
    if BeautifulSoup is not None:
        try:
            soup = BeautifulSoup(html, "html.parser")

            # Remove clutter elements
            for element in soup(["script", "style", "noscript", "nav", "footer", "header", "aside", "iframe", "form"]):
                element.decompose()

            # Try to find main content
            main_content = None
            for selector in ["main", "article", '[role="main"]', ".content", "#content", ".main", "#main"]:
                main_content = soup.select_one(selector)
                if main_content:
                    break

            if main_content:
                html_to_convert = str(main_content)
            else:
                html_to_convert = str(soup)

            # Convert to markdown
            if md is not None:
                try:
                    return html_to_convert, md(html_to_convert, heading_style="ATX", bullets="-", strip=["script", "style"]).strip()
                except Exception:
                    pass

            return html_to_convert, _convert_html_to_markdown_manual(html_to_convert)
        except Exception:
            pass

    # Last resort: basic text extraction
    text = re.sub(r"<(script|style)[\s\S]*?</\1>", "", html, flags=re.I)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</p\s*>", "\n\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return html, re.sub(r"\n{3,}", "\n\n", text).strip()


def _convert_html_to_markdown_manual(html: str) -> str:
    """Manual HTML to Markdown conversion using BeautifulSoup."""
    if not BeautifulSoup:
        return html

    try:
        soup = BeautifulSoup(html, "html.parser")

        # Convert headings
        for i in range(1, 7):
            for heading in soup.find_all(f"h{i}"):
                heading.string = f"\n\n{'#' * i} {heading.get_text()}\n\n"

        # Convert links
        for link in soup.find_all("a"):
            href = link.get("href", "")
            text = link.get_text()
            if href and text:
                link.string = f"[{text}]({href})"

        # Convert code blocks
        for code in soup.find_all("pre"):
            code_text = code.get_text()
            code.string = f"\n\n```\n{code_text}\n```\n\n"

        # Convert inline code
        for code in soup.find_all("code"):
            if code.parent and code.parent.name != "pre":
                code.string = f"`{code.get_text()}`"

        # Convert lists
        for ul in soup.find_all("ul"):
            for li in ul.find_all("li", recursive=False):
                li.string = f"\n- {li.get_text()}"

        for ol in soup.find_all("ol"):
            for idx, li in enumerate(ol.find_all("li", recursive=False), 1):
                li.string = f"\n{idx}. {li.get_text()}"

        # Convert blockquotes
        for quote in soup.find_all("blockquote"):
            quote.string = f"\n> {quote.get_text()}\n"

        # Convert paragraphs
        for p in soup.find_all("p"):
            p.string = f"{p.get_text()}\n\n"

        # Get text and clean up
        text = soup.get_text()
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r" +", " ", text)
        return text.strip()
    except Exception:
        return html


def _same_scope(scope: str, base: str, target: str) -> bool:
    try:
        b = urlparse(base)
        t = urlparse(target)
        if scope == "subpages":
            return t.netloc == b.netloc and t.path.startswith(os.path.dirname(b.path) or "/")
        if scope == "hostname":
            return t.netloc == b.netloc
        if scope == "domain":
            def root(host: str) -> str:
                parts = host.split(".")
                return ".".join(parts[-2:]) if len(parts) >= 2 else host
            return root(t.netloc) == root(b.netloc)
    except Exception:
        pass
    return False


def _normalize_version(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    return v.strip()


def _match_target_version(available: List[str], target: Optional[str]) -> Optional[str]:
    if not available:
        return None
    if not target:
        def key(v: str):
            nums = re.findall(r"\d+", v)
            return tuple(int(n) for n in nums), v
        return sorted(available, key=key, reverse=True)[0]
    t = target.strip()
    if "x" in t.lower():
        prefix = t.lower().replace(".x", "").rstrip(".")
        for v in sorted(available, reverse=True):
            if v.lower().startswith(prefix):
                return v
        return None
    if t in available:
        return t
    for v in sorted(available, reverse=True):
        if v.startswith(t):
            return v
    return None


def _chunk_markdown(text: str, chunk_size: int = 1200, overlap: int = 150) -> List[str]:
    chunks: List[str] = []
    i = 0
    n = len(text)
    while i < n:
        end = min(i + chunk_size, n)
        chunk = text[i:end]
        chunks.append(chunk)
        if end == n:
            break
        i = end - overlap
        if i < 0:
            i = 0
    return chunks


def _add_documents(docs: List[Tuple[str, Dict[str, Any]]]) -> int:
    if not docs:
        return 0
    texts = [d[0] for d in docs]
    metadatas = [d[1] for d in docs]
    _vector.add_texts(texts=texts, metadatas=metadatas)
    return len(texts)


def _delete_documents_by_metadata(filters: Dict[str, Any]) -> int:
    import psycopg
    where_clauses = []
    params: List[Any] = []
    for k, v in filters.items():
        where_clauses.append(f"(cmetadata ->> %s) = %s")
        params.extend([k, str(v)])
    where = " AND ".join(where_clauses) if where_clauses else "TRUE"
    sql = f"DELETE FROM langchain_pg_embedding WHERE {where} AND collection_id = (SELECT uuid FROM langchain_pg_collection WHERE name = %s)"
    params.append(PG_COLLECTION)
    with psycopg.connect(f"postgresql://{PG_USER}:{PG_PASSWORD}@{PG_HOST}:{PG_PORT}/{PG_DB}") as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            deleted = cur.rowcount or 0
    return deleted


def _distinct_values(field: str, extra: Optional[Dict[str, Any]] = None) -> List[str]:
    import psycopg
    clauses = [
        "collection_id = (SELECT uuid FROM langchain_pg_collection WHERE name = %s)"]
    params: List[Any] = [PG_COLLECTION]
    if extra:
        for k, v in extra.items():
            clauses.append("(cmetadata ->> %s) = %s")
            params.extend([k, str(v)])
    sql = f"SELECT DISTINCT cmetadata ->> %s AS v FROM langchain_pg_embedding WHERE {' AND '.join(clauses)}"
    params.insert(0, field)  # Insert field at the beginning
    with psycopg.connect(f"postgresql://{PG_USER}:{PG_PASSWORD}@{PG_HOST}:{PG_PORT}/{PG_DB}") as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
    return [r[0] for r in rows if r and r[0]]


def _get_project_stats() -> List[Dict[str, Any]]:
    """Get project statistics with libraries grouped by project"""
    import psycopg
    sql = """
    SELECT 
        cmetadata ->> 'project' as project,
        cmetadata ->> 'library' as library,
        cmetadata ->> 'version' as version,
        COUNT(*) as document_count,
        COUNT(DISTINCT cmetadata ->> 'url') as unique_url_count
    FROM langchain_pg_embedding 
    WHERE collection_id = (SELECT uuid FROM langchain_pg_collection WHERE name = %s)
    AND cmetadata ->> 'project' IS NOT NULL
    AND cmetadata ->> 'library' IS NOT NULL
    GROUP BY cmetadata ->> 'project', cmetadata ->> 'library', cmetadata ->> 'version'
    ORDER BY project, library, version
    """
    with psycopg.connect(f"postgresql://{PG_USER}:{PG_PASSWORD}@{PG_HOST}:{PG_PORT}/{PG_DB}") as conn:
        with conn.cursor() as cur:
            cur.execute(sql, [PG_COLLECTION])
            rows = cur.fetchall()

    # Group by project, then by library
    projects = {}
    for row in rows:
        project, library, version, doc_count, url_count = row
        if project not in projects:
            projects[project] = {}
        if library not in projects[project]:
            projects[project][library] = []
        projects[project][library].append({
            "version": version or "unversioned",
            "documentCount": doc_count,
            "uniqueUrlCount": url_count,
            "status": "completed"
        })

    return [{"name": proj, "libraries": libs} for proj, libs in projects.items()]


# ---- Tools ----


@mcp.tool()
def scrape_docs(
    project: str,
    library: str,
    url: str,
    version: Optional[str] = None,
    content_type: str = "docs",
    maxPages: int = 50,
    maxDepth: int = 2,
    scope: str = "subpages",
    followRedirects: bool = True,
) -> Dict[str, Any]:
    """
    Scrape and index documentation from a URL, file, or folder into a project.
    Supports: local web files, web docs, folder trees, PDF/DOCX/PPTX via Docling, markdown/txt/html as plain, and web crawl.

    Args:
        project: Project name (main grouping) - create new or add to existing
        library: Library name (e.g., 'react', 'fastapi', 'postgresql')
        url: Documentation URL to scrape
        version: Library version (optional, defaults to 'unversioned')
        content_type: Type of content ('docs', 'api', 'tutorials', etc.)
        maxPages: Maximum pages to scrape (default: 50)
        maxDepth: Maximum crawl depth (default: 2)
        scope: Crawl scope ('subpages', 'hostname', 'domain')
        followRedirects: Whether to follow redirects (default: True)

    Returns:
        Summary of scraping results with page and chunk counts
    """
    version = _normalize_version(version)
    docling_exts = [".pdf", ".docx", ".pptx"]

    try:
        # --- 1. Docling-eligible HTTP(S) files (PDF/DOCX/PPTX) ---
        if (url.startswith("http://") or url.startswith("https://")) and any(url.lower().endswith(ext) for ext in docling_exts):
            content = extract_text_with_docling(url)
            docs = [
                (
                    chunk,
                    {
                        "project": project,
                        "content_type": content_type,
                        "library": library,
                        "version": version or "unversioned",
                        "url": url,
                        "fts_content": chunk,
                    }
                )
                for chunk in _chunk_markdown(content)
            ]
            added = _add_documents(docs)
            return {
                "pagesScraped": 1,
                "chunksIndexed": added,
                "message": f"Indexed {added} chunks from {url}"
            }

        # --- 2. Local file/folder handler (with Docling for PDFs, DOCX, PPTX) ---
        if url.startswith("file://"):
            path = url[7:]
            if os.path.isdir(path):
                found_files = []
                for root, dirs, files in os.walk(path):
                    for fname in files:
                        fpath = os.path.join(root, fname)
                        found_files.append(fpath)
                docs = []
                for fpath in found_files:
                    ext = os.path.splitext(fpath)[1].lower()
                    if ext in docling_exts:
                        content = extract_text_with_docling(fpath)
                    else:
                        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                            content = f.read()
                    for chunk in _chunk_markdown(content):
                        docs.append(
                            (chunk, {
                                "project": project,
                                "content_type": content_type,
                                "library": library,
                                "version": version or "unversioned",
                                "url": f"file://{fpath}",
                                "fts_content": chunk,
                            })
                        )
                added = _add_documents(docs)
                return {
                    "pagesScraped": len(found_files),
                    "chunksIndexed": added,
                    "message": f"Indexed {added} chunks from folder '{path}'"
                }
            elif os.path.isfile(path):
                ext = os.path.splitext(path)[1].lower()
                if ext in docling_exts:
                    content = extract_text_with_docling(path)
                else:
                    with open(path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                docs = [
                    (
                        chunk,
                        {
                            "project": project,
                            "content_type": content_type,
                            "library": library,
                            "version": version or "unversioned",
                            "url": url,
                            "fts_content": chunk,
                        }
                    )
                    for chunk in _chunk_markdown(content)
                ]
                added = _add_documents(docs)
                return {
                    "pagesScraped": 1,
                    "chunksIndexed": added,
                    "message": f"Indexed {added} chunks from file '{path}'"
                }
            else:
                return {"error": f"Path not found: {path}"}

        # --- 3. Standard web docs crawling (HTML/doc sites) ---
        seen = set()
        q = deque()
        q.append((url, 0))
        pages = 0
        added = 0
        timeout = (10, 20)

        while q and pages < maxPages:
            u, depth = q.popleft()
            if u in seen:
                continue
            seen.add(u)
            try:
                resp = requests.get(u, allow_redirects=followRedirects, timeout=timeout, headers={
                                    "User-Agent": "Docs-MCP/1.0"})
                if resp.status_code != 200 or "text/html" not in resp.headers.get("Content-Type", ""):
                    continue
                html = resp.text
                html, md = _html_to_markdown(html)
                chunks = _chunk_markdown(md)
                docs = [
                    (
                        chunk,
                        {
                            "project": project,
                            "content_type": content_type,
                            "library": library,
                            "version": version or "unversioned",
                            "url": u,
                            "fts_content": chunk,
                        }
                    )
                    for chunk in chunks if chunk.strip()
                ]
                added += _add_documents(docs)
                pages += 1

                if depth < maxDepth and BeautifulSoup is not None:
                    soup = BeautifulSoup(html, "html.parser")
                    for a in soup.find_all("a", href=True):
                        href = a.get("href")
                        if not href or href.startswith("#") or href.startswith("mailto:") or href.startswith("javascript:"):
                            continue
                        next_url = urljoin(u, href)
                        if _same_scope(scope, url, next_url):
                            q.append((next_url, depth + 1))
            except Exception as e:
                print("Web crawl error:", e)
                continue

        return {
            "pagesScraped": pages,
            "chunksIndexed": added,
            "message": f"Indexed {added} chunks from {pages} pages for project={project}, library={library}@{version or 'unversioned'} [{content_type}]",
        }
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def search_docs(
    project: str,
    library: str,
    query: str,
    version: Optional[str] = None,
    content_type: str = "docs",
    limit: int = 5,
) -> str:
    """Search documentation within a project's library.

    Args:
        project: Project name to search within
        library: Library name to search within
        query: Search query text
        version: Specific version to search (optional)
        content_type: Type of content to search ('docs', 'api', etc.)
        limit: Maximum number of results to return

    Returns:
        Search results with content snippets and source URLs
    """
    filt: Dict[str, Any] = {"project": project,
                            "content_type": content_type, "library": library}
    if version:
        filt["version"] = version
    retriever = _vector.as_retriever(search_type="similarity", search_kwargs={
                                     "k": max(1, int(limit))}, filter=filt)
    docs = retriever.get_relevant_documents(query)
    if not docs:
        return f"No results for '{query}' in project={project}, library={library}, version={version or 'any'}, content_type={content_type}."
    out: List[str] = []
    for i, d in enumerate(docs, 1):
        url = ""
        if isinstance(d.metadata, dict):
            url = d.metadata.get("url", "")
        out.append(
            f"------------------------------------------------------------\n"
            f"Result {i}: {url or '(no-url)'}\n\n"
            f"{getattr(d, 'page_content', '')}\n"
        )
    return "".join(out)


@mcp.tool()
def list_projects() -> str:
    """List all projects and their libraries with statistics.

    Returns:
        Formatted list showing projects, their libraries with versions, and document counts
    """
    projects = _get_project_stats()
    if not projects:
        return "No projects indexed yet. Use scrape_docs to create your first project!"

    result = "📁 Indexed Projects:\n\n"
    for project in projects:
        result += f"📂 **{project['name']}**\n"
        total_docs = 0
        total_urls = 0
        for lib_name, versions in project['libraries'].items():
            result += f"  📚 {lib_name}:\n"
            for version in versions:
                result += f"    - v{version['version']}: {version['documentCount']} docs, {version['uniqueUrlCount']} URLs\n"
                total_docs += version['documentCount']
                total_urls += version['uniqueUrlCount']
        result += f"  📊 **Total**: {total_docs} docs, {total_urls} URLs\n\n"

    return result


@mcp.tool()
def check_project(project: str) -> str:
    """Check if a project exists and show its current libraries.

    Args:
        project: Project name to check

    Returns:
        Information about the project and its libraries, or message if not found
    """
    projects = _get_project_stats()
    for proj in projects:
        if proj['name'] == project:
            result = f"✅ Project '{project}' exists!\n\n"
            result += f"📚 **Libraries in this project:**\n"
            for lib_name, versions in proj['libraries'].items():
                result += f"  - {lib_name}:\n"
                for version in versions:
                    result += f"    - v{version['version']}: {version['documentCount']} docs, {version['uniqueUrlCount']} URLs\n"
            return result

    return f"❌ Project '{project}' does not exist yet.\n\n💡 You can create it by using scrape_docs with this project name."


@mcp.tool()
def list_libraries(project: Optional[str] = None) -> str:
    """List all libraries across projects or within a specific project.

    Args:
        project: Optional project name to filter libraries (shows all projects if not specified)

    Returns:
        List of libraries with their projects and versions
    """
    projects = _get_project_stats()
    if not projects:
        return "No libraries indexed yet. Use scrape_docs to index your first library!"

    if project:
        # Filter for specific project
        matching_projects = [p for p in projects if p['name'] == project]
        if not matching_projects:
            return f"Project '{project}' not found. Use list_projects() to see available projects."
        projects = matching_projects

    result = f"📚 **Libraries{' in project ' + project if project else ' across all projects'}:**\n\n"

    all_libraries = {}
    for proj in projects:
        for lib_name, versions in proj['libraries'].items():
            if lib_name not in all_libraries:
                all_libraries[lib_name] = []
            for version in versions:
                all_libraries[lib_name].append({
                    'project': proj['name'],
                    'version': version['version'],
                    'docs': version['documentCount'],
                    'urls': version['uniqueUrlCount']
                })

    for lib_name, entries in sorted(all_libraries.items()):
        result += f"📖 **{lib_name}**\n"
        for entry in entries:
            result += f"  - Project: {entry['project']}, Version: {entry['version']}, Docs: {entry['docs']}, URLs: {entry['urls']}\n"
        result += "\n"

    return result


@mcp.tool()
def find_version(project: str, library: str, content_type: str = "docs", targetVersion: Optional[str] = None) -> str:
    """Find best matching version for a library within project.

    Args:
        project: Project name
        library: Library name
        content_type: Type of content ('docs', 'api', etc.)
        targetVersion: Specific version to find (optional)

    Returns:
        Best matching version or available versions
    """
    versions = sorted(set(_distinct_values("version", {
                      "project": project, "content_type": content_type, "library": library})))
    if not versions:
        return f"No versions found for {library} in project={project} [{content_type}]."
    chosen = _match_target_version(versions, targetVersion)
    if not chosen:
        avail = ", ".join(versions)
        return f'No match for "{targetVersion}" in {library} (project={project}, {content_type}). Available: {avail}'
    return f"{library}@{chosen}"


@mcp.tool()
def remove_docs(project: str, library: str, version: Optional[str] = None, content_type: str = "docs") -> str:
    """Remove indexed documentation for a library/version from a project.

    Args:
        project: Project name
        library: Library name to remove
        version: Specific version to remove (optional, removes all versions if not specified)
        content_type: Type of content to remove ('docs', 'api', etc.)

    Returns:
        Confirmation message with number of chunks removed
    """
    filters: Dict[str, Any] = {"project": project,
                               "content_type": content_type, "library": library}
    if version:
        filters["version"] = version
    deleted = _delete_documents_by_metadata(filters)
    vtxt = version or "unversioned"
    return f"Removed {deleted} chunks for project={project}, {library}@{vtxt} [{content_type}]"


@mcp.tool()
def fetch_url(url: str, project: str, content_type: str = "docs", followRedirects: bool = True) -> str:
    """Fetch a URL and convert to Markdown (helper tool).

    Args:
        url: URL to fetch
        project: Project name (for context)
        content_type: Type of content ('docs', 'api', etc.)
        followRedirects: Whether to follow redirects

    Returns:
        Markdown content of the URL or error message
    """
    try:
        r = requests.get(
            url,
            allow_redirects=followRedirects,
            timeout=(10, 20),
            headers={"User-Agent": "Docs-MCP/1.0"},
        )
        if r.status_code != 200:
            return f"Failed to fetch URL (status {r.status_code})."
        ctype = r.headers.get("Content-Type", "")
        if "text/html" in ctype:
            _, markdown = _html_to_markdown(r.text)
            return markdown
        if r.text:
            return r.text
        return f"[{len(r.content)} bytes]"
    except Exception as e:
        return f"Failed to fetch URL: {e}"


@mcp.tool()
def detailed_stats(project: Optional[str] = None, library: Optional[str] = None, version: Optional[str] = None) -> str:
    """Get detailed statistics with URL-level granularity and flexible filtering.

    Args:
        project: Optional project name to filter by
        library: Optional library name to filter by  
        version: Optional version to filter by

    Returns:
        Detailed breakdown showing individual URLs and chunk counts with flexible filtering
    """
    import psycopg

    # Build dynamic query based on filters
    clauses = [
        "collection_id = (SELECT uuid FROM langchain_pg_collection WHERE name = %s)"]
    params = [PG_COLLECTION]

    if project:
        clauses.append("(cmetadata ->> 'project') = %s")
        params.append(project)
    if library:
        clauses.append("(cmetadata ->> 'library') = %s")
        params.append(library)
    if version:
        clauses.append("(cmetadata ->> 'version') = %s")
        params.append(version)

    sql = f"""
    SELECT 
        cmetadata ->> 'project' as project,
        cmetadata ->> 'library' as library,
        cmetadata ->> 'version' as version,
        cmetadata ->> 'content_type' as content_type,
        cmetadata ->> 'url' as url,
        COUNT(*) as chunk_count
    FROM langchain_pg_embedding 
    WHERE {' AND '.join(clauses)}
    GROUP BY 
        cmetadata ->> 'project',
        cmetadata ->> 'library', 
        cmetadata ->> 'version',
        cmetadata ->> 'content_type',
        cmetadata ->> 'url'
    ORDER BY project, library, version, content_type, url
    """

    with psycopg.connect(f"postgresql://{PG_USER}:{PG_PASSWORD}@{PG_HOST}:{PG_PORT}/{PG_DB}") as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    if not rows:
        filter_desc = []
        if project:
            filter_desc.append(f"project={project}")
        if library:
            filter_desc.append(f"library={library}")
        if version:
            filter_desc.append(f"version={version}")
        filter_text = f" with filters: {', '.join(filter_desc)}" if filter_desc else ""
        return f"No data found{filter_text}."

    # Group and format results with project-first design
    result = "📊 **Detailed Statistics**\n\n"

    # Build filter description
    filters = []
    if project:
        filters.append(f"Project: {project}")
    if library:
        filters.append(f"Library: {library}")
    if version:
        filters.append(f"Version: {version}")

    if filters:
        result += f"🔍 **Filters**: {', '.join(filters)}\n\n"

    current_project = None
    current_library = None
    current_version = None
    current_content_type = None

    for row in rows:
        proj, lib, ver, content_type, url, chunk_count = row
        ver = ver or "unversioned"
        url = url or "(no-url)"

        if proj != current_project:
            if current_project is not None:
                result += "\n"
            result += f"📂 **Project: {proj}**\n"
            current_project = proj
            current_library = None

        if lib != current_library:
            if current_library is not None:
                result += "\n"
            result += f"  📚 **Library: {lib}**\n"
            current_library = lib
            current_version = None

        if ver != current_version:
            if current_version is not None:
                result += "\n"
            result += f"    🏷️  **Version: {ver}**\n"
            current_version = ver
            current_content_type = None

        if content_type != current_content_type:
            if current_content_type is not None:
                result += "\n"
            result += f"      📄 **Content Type: {content_type}**\n"
            current_content_type = content_type

        result += f"        🔗 {url}: {chunk_count} chunks\n"

    return result


# ---- Run server ----
if __name__ == "__main__":
    mcp.run(transport="http", host="127.0.0.1", port=8009)
