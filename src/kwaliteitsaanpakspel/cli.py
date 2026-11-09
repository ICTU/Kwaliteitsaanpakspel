"""Start de server en open de spelleiderpagina in de browser."""

import webbrowser

import uvicorn

from .app import create_app
from .network import get_lan_ip, open_server_socket


def main() -> None:
    """Start het spel."""
    server_socket = open_server_socket()
    port = server_socket.getsockname()[1]
    join_url = f"http://{get_lan_ip()}:{port}"
    print(f"Het Kwaliteitsaanpakspel draait. Teams melden zich aan via {join_url}", flush=True)
    server = uvicorn.Server(uvicorn.Config(create_app(join_url)))
    # De socket luistert al, dus de browser kan verbinden voordat uvicorn draait.
    webbrowser.open(f"http://localhost:{port}")
    server.run(sockets=[server_socket])
