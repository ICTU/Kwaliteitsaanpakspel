"""Netwerkhulpfuncties: het wifi-IP-adres bepalen en een vrije poort openen."""

import socket

DEFAULT_PORT = 8765
MAX_PORT_ATTEMPTS = 20


def get_lan_ip() -> str:
    """Geef het IP-adres waarop andere laptops op hetzelfde netwerk deze laptop kunnen bereiken.

    Het "verbinden" van een UDP-socket verstuurt geen pakketten, maar laat het besturingssysteem wel
    de interface kiezen die bij de default route hoort. Het lokale adres van die socket is het adres
    dat we zoeken.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp_socket:
        try:
            udp_socket.connect(("8.8.8.8", 80))
        except OSError:
            return "127.0.0.1"
        return udp_socket.getsockname()[0]


def open_server_socket(first_port: int = DEFAULT_PORT, attempts: int = MAX_PORT_ATTEMPTS) -> socket.socket:
    """Open een luisterende socket op alle interfaces, op de eerste vrije poort vanaf first_port."""
    for port in range(first_port, first_port + attempts):
        server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            server_socket.bind(("0.0.0.0", port))
        except OSError:
            server_socket.close()
            continue
        server_socket.listen()
        return server_socket
    raise OSError(f"Geen vrije poort gevonden tussen {first_port} en {first_port + attempts - 1}")
