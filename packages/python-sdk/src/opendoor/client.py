from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, BinaryIO, Iterator, Mapping, Optional, Union

import httpx

FileArg = Union[str, Path, BinaryIO, tuple[str, bytes]]


class OpenDoorError(Exception):
    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        body: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class OpenDoor:
    """OpenAI-compatible client for the OpenDoor gateway."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ) -> None:
        key = api_key or os.environ.get("OPENDOOR_API_KEY")
        if not key:
            raise OpenDoorError("api_key is required (or set OPENDOOR_API_KEY)")
        self.api_key = key
        self.base_url = (
            base_url or os.environ.get("OPENDOOR_BASE_URL") or "http://localhost:3001"
        ).rstrip("/")
        self.timeout = timeout
        self.chat = ChatResource(self)
        self.models = ModelsResource(self)
        self.generations = GenerationsResource(self)
        self.images = ImagesResource(self)
        self.videos = VideosResource(self)
        self.audio = AudioResource(self)
        self.batches = BatchesResource(self)
        self.embeddings = EmbeddingsResource(self)
        self.rerank = RerankResource(self)
        self.responses = ResponsesResource(self)
        self.files = FilesResource(self)
        self.plugins = PluginsResource(self)
        self.catalog = CatalogResource(self)
        self.account = AccountResource(self)
        self.usage = UsageResource(self)
        self.requests = RequestsResource(self)
        self.keys = KeysResource(self)
        self.assistants = AssistantsResource(self)
        self.workflows = WorkflowsResource(self)
        self.training = TrainingResource(self)
        self.deployments = DeploymentsResource(self)
        self.agents = AgentsResource(self)
        self.byok = ByokResource(self)
        self.policies = PoliciesResource(self)
        self.premium = PremiumResource(self)

    def _headers(self, json_body: bool = True) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        if json_body:
            headers["Content-Type"] = "application/json"
        return headers

    def request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        files: Optional[Mapping[str, Any]] = None,
        data: Optional[Mapping[str, Any]] = None,
    ) -> Any:
        url = f"{self.base_url}{path}"
        kwargs: dict[str, Any] = {"timeout": self.timeout, "headers": self._headers(files is None)}
        if files is not None:
            kwargs["headers"] = self._headers(False)
            kwargs["files"] = files
            kwargs["data"] = data
        elif json is not None:
            kwargs["json"] = json
        response = httpx.request(method, url, **kwargs)
        return self._parse(response)

    def stream_sse(self, path: str, body: Any) -> Iterator[dict[str, Any]]:
        url = f"{self.base_url}{path}"
        with httpx.stream(
            "POST",
            url,
            json=body,
            headers=self._headers(),
            timeout=self.timeout,
        ) as response:
            if response.status_code >= 400:
                body = response.read().decode("utf-8", errors="replace")
                raise OpenDoorError(
                    f"OpenDoor API error {response.status_code}: {body}",
                    status_code=response.status_code,
                    body=body,
                )
            for line in response.iter_lines():
                if not line:
                    continue
                if line.startswith("data: "):
                    payload = line[6:]
                elif line.startswith("data:"):
                    payload = line[5:].lstrip()
                else:
                    continue
                if payload.strip() == "[DONE]":
                    return
                yield json.loads(payload)

    def _parse(self, response: httpx.Response) -> Any:
        if response.status_code >= 400:
            try:
                body: Any = response.json()
            except Exception:
                body = response.text
            raise OpenDoorError(
                f"OpenDoor API error {response.status_code}: {body}",
                status_code=response.status_code,
                body=body,
            )
        if response.status_code == 204 or not response.content:
            return {}
        return response.json()


class ChatCompletionsResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def create(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        provider: Optional[dict[str, Any]] = None,
        stream: bool = False,
        **kwargs: Any,
    ) -> Any:
        body: dict[str, Any] = {"model": model, "messages": messages, **kwargs}
        if provider is not None:
            body["provider"] = provider
        if stream:
            body["stream"] = True
            return self._client.stream_sse("/v1/chat/completions", body)
        return self._client.request("POST", "/v1/chat/completions", json=body)


class ChatResource:
    def __init__(self, client: OpenDoor) -> None:
        self.completions = ChatCompletionsResource(client)


class ModelsResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def list(self) -> Any:
        return self._client.request("GET", "/v1/models")


class GenerationsResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def get(self, generation_id: str) -> Any:
        return self._client.request("GET", f"/v1/generations/{generation_id}")


class ImagesResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def generate(self, *, prompt: str, model: Optional[str] = None, **kwargs: Any) -> Any:
        body: dict[str, Any] = {"prompt": prompt, **kwargs}
        if model is not None:
            body["model"] = model
        return self._client.request("POST", "/v1/images/generations", json=body)


class VideosResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def generate(self, *, prompt: str, model: Optional[str] = None, **kwargs: Any) -> Any:
        body: dict[str, Any] = {"prompt": prompt, **kwargs}
        if model is not None:
            body["model"] = model
        return self._client.request("POST", "/v1/videos/generations", json=body)

    def get(self, generation_id: str) -> Any:
        return self._client.request("GET", f"/v1/videos/generations/{generation_id}")


class AudioResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def transcribe(
        self,
        file: FileArg,
        *,
        model: str = "whisper-1",
        **kwargs: Any,
    ) -> Any:
        upload = _as_upload(file)
        data: dict[str, Any] = {"model": model, **kwargs}
        return self._client.request(
            "POST",
            "/v1/audio/transcriptions",
            files={"file": upload},
            data=data,
        )


class BatchesResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def create(self, **kwargs: Any) -> Any:
        return self._client.request("POST", "/v1/batches", json=kwargs)

    def get(self, batch_id: str) -> Any:
        return self._client.request("GET", f"/v1/batches/{batch_id}")

    def list(self) -> Any:
        return self._client.request("GET", "/v1/batches")


class EmbeddingsResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def create(self, **kwargs: Any) -> Any:
        return self._client.request("POST", "/v1/embeddings", json=kwargs)


class RerankResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def create(self, **kwargs: Any) -> Any:
        return self._client.request("POST", "/v1/rerank", json=kwargs)


class ResponsesResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def create(self, **kwargs: Any) -> Any:
        return self._client.request("POST", "/v1/responses", json=kwargs)


class FilesResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def list(self, purpose: Optional[str] = None) -> Any:
        path = "/v1/files" if not purpose else f"/v1/files?purpose={purpose}"
        return self._client.request("GET", path)

    def get(self, file_id: str) -> Any:
        return self._client.request("GET", f"/v1/files/{file_id}")

    def content(self, file_id: str) -> Any:
        return self._client.request("GET", f"/v1/files/{file_id}/content")

    def delete(self, file_id: str) -> Any:
        return self._client.request("DELETE", f"/v1/files/{file_id}")


class PluginsResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def web_search(self, query: str, max_results: Optional[int] = None) -> Any:
        body: dict[str, Any] = {"query": query}
        if max_results is not None:
            body["max_results"] = max_results
        return self._client.request("POST", "/v1/plugins/web-search", json=body)


class CatalogResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def list(self) -> Any:
        return self._client.request("GET", "/v1/catalog")


class AccountResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def get(self) -> Any:
        return self._client.request("GET", "/v1/account")

    def balance(self) -> Any:
        return self._client.request("GET", "/v1/account/balance")


class UsageResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def get(self, days: Optional[int] = None) -> Any:
        path = "/v1/usage" if days is None else f"/v1/usage?days={days}"
        return self._client.request("GET", path)

    def rate_limits(self) -> Any:
        return self._client.request("GET", "/v1/usage/rate-limits")


class RequestsResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def list(self, **params: Any) -> Any:
        qs = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
        return self._client.request("GET", f"/v1/requests{('?' + qs) if qs else ''}")

    def get(self, request_id: str) -> Any:
        return self._client.request("GET", f"/v1/requests/{request_id}")


class KeysResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def list(self) -> Any:
        return self._client.request("GET", "/v1/keys")

    def create(self, **kwargs: Any) -> Any:
        return self._client.request("POST", "/v1/keys", json=kwargs)

    def delete(self, key_id: str) -> Any:
        return self._client.request("DELETE", f"/v1/keys/{key_id}")


class AssistantsResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def list(self) -> Any:
        return self._client.request("GET", "/v1/assistants")

    def create(self, **kwargs: Any) -> Any:
        return self._client.request("POST", "/v1/assistants", json=kwargs)

    def get(self, assistant_id: str) -> Any:
        return self._client.request("GET", f"/v1/assistants/{assistant_id}")

    def update(self, assistant_id: str, **kwargs: Any) -> Any:
        return self._client.request("PATCH", f"/v1/assistants/{assistant_id}", json=kwargs)

    def delete(self, assistant_id: str) -> Any:
        return self._client.request("DELETE", f"/v1/assistants/{assistant_id}")

    def chat(self, assistant_id: str, **kwargs: Any) -> Any:
        return self._client.request("POST", f"/v1/assistants/{assistant_id}/chat", json=kwargs)


class WorkflowsResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def list(self) -> Any:
        return self._client.request("GET", "/v1/workflows")

    def create(self, **kwargs: Any) -> Any:
        return self._client.request("POST", "/v1/workflows", json=kwargs)

    def get(self, workflow_id: str) -> Any:
        return self._client.request("GET", f"/v1/workflows/{workflow_id}")

    def update(self, workflow_id: str, **kwargs: Any) -> Any:
        return self._client.request("PATCH", f"/v1/workflows/{workflow_id}", json=kwargs)

    def delete(self, workflow_id: str) -> Any:
        return self._client.request("DELETE", f"/v1/workflows/{workflow_id}")

    def run(self, workflow_id: str, **kwargs: Any) -> Any:
        return self._client.request("POST", f"/v1/workflows/{workflow_id}/run", json=kwargs)

    def runs(self, workflow_id: str) -> Any:
        return self._client.request("GET", f"/v1/workflows/{workflow_id}/runs")


class TrainingDatasetsResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def list(self) -> Any:
        return self._client.request("GET", "/v1/training/datasets")

    def create(self, **kwargs: Any) -> Any:
        return self._client.request("POST", "/v1/training/datasets", json=kwargs)

    def get(self, dataset_id: str) -> Any:
        return self._client.request("GET", f"/v1/training/datasets/{dataset_id}")


class TrainingJobsResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def list(self) -> Any:
        return self._client.request("GET", "/v1/training/jobs")

    def create(self, **kwargs: Any) -> Any:
        return self._client.request("POST", "/v1/training/jobs", json=kwargs)

    def get(self, job_id: str) -> Any:
        return self._client.request("GET", f"/v1/training/jobs/{job_id}")


class TrainingResource:
    def __init__(self, client: OpenDoor) -> None:
        self.datasets = TrainingDatasetsResource(client)
        self.jobs = TrainingJobsResource(client)


class DeploymentsResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def list(self) -> Any:
        return self._client.request("GET", "/v1/deployments")

    def create(self, **kwargs: Any) -> Any:
        return self._client.request("POST", "/v1/deployments", json=kwargs)

    def get(self, deployment_id: str) -> Any:
        return self._client.request("GET", f"/v1/deployments/{deployment_id}")

    def delete(self, deployment_id: str) -> Any:
        return self._client.request("DELETE", f"/v1/deployments/{deployment_id}")


class AgentsResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def list(self) -> Any:
        return self._client.request("GET", "/v1/agents")

    def create(self, **kwargs: Any) -> Any:
        return self._client.request("POST", "/v1/agents", json=kwargs)

    def get(self, agent_id: str) -> Any:
        return self._client.request("GET", f"/v1/agents/{agent_id}")

    def update(self, agent_id: str, **kwargs: Any) -> Any:
        return self._client.request("PATCH", f"/v1/agents/{agent_id}", json=kwargs)

    def chat(self, agent_id: str, message: str, **kwargs: Any) -> Any:
        body: dict[str, Any] = {"message": message, **kwargs}
        return self._client.request("POST", f"/v1/agents/{agent_id}/chat", json=body)

    def start(self, agent_id: str) -> Any:
        return self.update(agent_id, status="running")

    def stop(self, agent_id: str) -> Any:
        return self.update(agent_id, status="stopped")

    def computer(self, agent_id: str, control: str) -> Any:
        return self.update(agent_id, computerControl=control)

    def delete(self, agent_id: str) -> Any:
        return self._client.request("DELETE", f"/v1/agents/{agent_id}")

    def restore(self, agent_id: str) -> Any:
        return self._client.request("POST", f"/v1/agents/{agent_id}/restore")


class ByokResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def list(self) -> Any:
        return self._client.request("GET", "/v1/byok")

    def create(self, **kwargs: Any) -> Any:
        return self._client.request("POST", "/v1/byok", json=kwargs)

    def delete(self, key_id: str) -> Any:
        return self._client.request("DELETE", f"/v1/byok/{key_id}")


class PoliciesResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def list(self) -> Any:
        return self._client.request("GET", "/v1/policies")

    def create(self, **kwargs: Any) -> Any:
        return self._client.request("POST", "/v1/policies", json=kwargs)

    def get(self, policy_id: str) -> Any:
        return self._client.request("GET", f"/v1/policies/{policy_id}")

    def update(self, policy_id: str, **kwargs: Any) -> Any:
        return self._client.request("PATCH", f"/v1/policies/{policy_id}", json=kwargs)

    def delete(self, policy_id: str) -> Any:
        return self._client.request("DELETE", f"/v1/policies/{policy_id}")


class PremiumRentalsResource:
    def __init__(self, client: OpenDoor) -> None:
        self._client = client

    def list(self) -> Any:
        return self._client.request("GET", "/v1/premium/rentals")

    def create(self, **kwargs: Any) -> Any:
        return self._client.request("POST", "/v1/premium/rentals", json=kwargs)

    def get(self, rental_id: str) -> Any:
        return self._client.request("GET", f"/v1/premium/rentals/{rental_id}")

    def delete(self, rental_id: str) -> Any:
        return self._client.request("DELETE", f"/v1/premium/rentals/{rental_id}")


class PremiumResource:
    def __init__(self, client: OpenDoor) -> None:
        self.rentals = PremiumRentalsResource(client)


def _as_upload(file: FileArg) -> tuple[str, bytes]:
    if isinstance(file, tuple):
        return file
    if isinstance(file, (str, Path)):
        path = Path(file)
        return path.name, path.read_bytes()
    name = getattr(file, "name", "audio")
    if hasattr(name, "split"):
        name = Path(str(name)).name
    return str(name), file.read()
