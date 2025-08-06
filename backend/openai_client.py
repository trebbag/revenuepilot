"""
Simple wrapper for the OpenAI Chat Completion API.

This module defines a helper function that sends a chat completion request
to OpenAI using the provided messages and returns the content of the
assistant's response.  The API key should be set in the environment
variable `OPENAI_API_KEY`.  If the key is not available or the network
call fails, an exception will be raised.
"""

from typing import List, Dict
import openai

from .key_manager import get_api_key


def call_openai(messages: List[Dict[str, str]], model: str = "gpt-4o", temperature: float = 0) -> str:
    """
    Send a chat completion request to the OpenAI API and return the assistant's
    reply content.  Uses the API key from the environment.

    Args:
        messages: A list of message dicts in the format expected by the
            ChatCompletion API.
        model: The model name to use (default 'gpt-4o').
        temperature: Sampling temperature; 0 for deterministic output.
    Returns:
        The assistant's response content as a string.
    Raises:
        RuntimeError: If the API key is missing or the call fails.
    """
    # Always attempt to load the API key for each call.  ``get_api_key``
    # checks the environment, OS keyring and a user-scoped file.  A clear
    # error is raised if no key is available.
    api_key = get_api_key()
    if not api_key:
        raise RuntimeError("OpenAI key not configured.")
    openai.api_key = api_key
    try:
        response = openai.ChatCompletion.create(
            model=model,
            messages=messages,
            temperature=temperature,
        )
        return response.choices[0].message["content"]
    except Exception as exc:
        raise RuntimeError(f"Error calling OpenAI: {exc}") from exc
