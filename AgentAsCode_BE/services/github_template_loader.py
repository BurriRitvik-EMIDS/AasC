import requests
import json
from typing import List, Dict, Any
from urllib.parse import urljoin
import logging

logger = logging.getLogger(__name__)


class GitHubTemplateLoader:
    def __init__(self, github_repo_url: str = "https://github.com/HLokeshwariEmids/AAC_Templates"):
        self.github_repo_url = github_repo_url
        # Convert GitHub repo URL to raw content URL
        self.raw_base_url = github_repo_url.replace(
            "github.com", "raw.githubusercontent.com") + "/main/"

    def load_templates_from_github(self) -> Dict[str, Any]:
        """
        Load agent templates from GitHub repository
        Expected structure:
        - templates/main_templates.json - Main agent templates
        - templates/sub_templates.json - Sub-agent templates
        """
        try:
            # Load main templates
            main_templates = self._load_json_file(
                "templates/main_templates.json")

            # Load sub-agent templates
            sub_templates = self._load_json_file(
                "templates/sub_templates.json")

            return {
                "main_templates": main_templates,
                "sub_templates": sub_templates,
                "source": "github",
                "repository": self.github_repo_url
            }

        except Exception as e:
            logger.error(f"Failed to load templates from GitHub: {str(e)}")
            # No fallback - return empty templates with error info
            return {
                "main_templates": [],
                "sub_templates": {},
                "source": "github_error",
                "repository": self.github_repo_url,
                "error": str(e)
            }

    def _load_json_file(self, file_path: str) -> Any:
        """Load a JSON file from GitHub raw content with improved error handling"""
        url = urljoin(self.raw_base_url, file_path)

        try:
            logger.info(f"Loading templates from URL: {url}")
            response = requests.get(url, timeout=10)
            response.raise_for_status()

            data = response.json()
            if not isinstance(data, (list, dict)):
                logger.error(
                    f"Unexpected data format from {url}: {type(data)}")
                return [] if file_path == "templates/main_templates.json" else {}

            logger.info(
                f"Successfully loaded {len(data) if isinstance(data, list) else len(data.keys())} items from {file_path}")
            return data

        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching {url}: {str(e)}")
            raise Exception(
                f"Failed to load {file_path} from GitHub: {str(e)}")
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing JSON from {url}: {str(e)}")
            raise Exception(f"Invalid JSON in {file_path}: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error loading {file_path}: {str(e)}")
            raise


# Global instance
github_loader = GitHubTemplateLoader()
