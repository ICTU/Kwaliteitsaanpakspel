"""Unittests voor het opstarten van het spel."""

import runpy
import unittest
from unittest.mock import MagicMock, patch

from kwaliteitsaanpakspel.cli import main


@patch("builtins.print")
@patch("uvicorn.Server")
@patch("webbrowser.open")
@patch("kwaliteitsaanpakspel.cli.get_lan_ip", MagicMock(return_value="192.168.1.23"))
@patch("kwaliteitsaanpakspel.cli.open_server_socket")
class MainTest(unittest.TestCase):
    """Unittests voor de main-functie."""

    def test_main(
        self, open_server_socket: MagicMock, browser_open: MagicMock, server_class: MagicMock, print_: MagicMock
    ) -> None:
        """Test dat de server start op de gevonden socket en de browser de spelleiderpagina opent."""
        server_socket = open_server_socket.return_value
        server_socket.getsockname.return_value = ("0.0.0.0", 8766)
        main()
        print_.assert_called_once_with(
            "Het Kwaliteitsaanpakspel draait. Teams melden zich aan via http://192.168.1.23:8766", flush=True
        )
        browser_open.assert_called_once_with("http://localhost:8766")
        server_class.return_value.run.assert_called_once_with(sockets=[server_socket])


class ModuleTest(unittest.TestCase):
    """Unittests voor `python -m kwaliteitsaanpakspel`."""

    @patch("kwaliteitsaanpakspel.cli.main")
    def test_run_module(self, main_function: MagicMock) -> None:
        """Test dat het starten als module de main-functie aanroept."""
        runpy.run_module("kwaliteitsaanpakspel", run_name="__main__")
        main_function.assert_called_once_with()
