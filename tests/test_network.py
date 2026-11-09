"""Unittests voor de netwerkhulpfuncties."""

import socket
import unittest
from unittest.mock import MagicMock, patch

from kwaliteitsaanpakspel.network import get_lan_ip, open_server_socket


class GetLanIpTest(unittest.TestCase):
    """Unittests voor het bepalen van het wifi-IP-adres."""

    @patch("socket.socket")
    def test_ip_address_of_default_route(self, socket_class: MagicMock) -> None:
        """Test dat het lokale adres van de UDP-socket wordt teruggegeven."""
        udp_socket = socket_class.return_value.__enter__.return_value
        udp_socket.getsockname.return_value = ("192.168.1.23", 54321)
        self.assertEqual("192.168.1.23", get_lan_ip())
        udp_socket.connect.assert_called_once_with(("8.8.8.8", 80))

    @patch("socket.socket")
    def test_no_network(self, socket_class: MagicMock) -> None:
        """Test dat localhost wordt teruggegeven als er geen netwerk is."""
        socket_class.return_value.__enter__.return_value.connect.side_effect = OSError
        self.assertEqual("127.0.0.1", get_lan_ip())


class OpenServerSocketTest(unittest.TestCase):
    """Unittests voor het openen van de serversocket."""

    def test_listens_on_all_interfaces(self) -> None:
        """Test dat de socket op alle interfaces luistert."""
        with open_server_socket(first_port=0) as server_socket:
            self.assertEqual("0.0.0.0", server_socket.getsockname()[0])

    def test_skips_occupied_port(self) -> None:
        """Test dat een bezette poort wordt overgeslagen."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied:
            occupied.bind(("0.0.0.0", 0))
            occupied.listen()
            port = occupied.getsockname()[1]
            with open_server_socket(first_port=port) as server_socket:
                self.assertNotEqual(port, server_socket.getsockname()[1])

    @patch("socket.socket")
    def test_no_free_port(self, socket_class: MagicMock) -> None:
        """Test dat er een foutmelding komt als er geen vrije poort is."""
        socket_class.return_value.bind.side_effect = OSError
        with self.assertRaisesRegex(OSError, "Geen vrije poort gevonden tussen 8000 en 8002"):
            open_server_socket(first_port=8000, attempts=3)
        self.assertEqual(3, socket_class.return_value.close.call_count)
