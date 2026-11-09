# Toon de beschikbare recipes
default:
    @just --list

# Start het spel
start:
    uv run kwaliteitsaanpakspel

# Draai alle unittests, met dekkingsmeting
test: test-python test-js

# Controleer de Python-code met ruff: fouten, stijl en opmaak
lint:
    uv run ruff check src tests
    uv run ruff format --check src tests

# Draai de unittests van de Python-code, met dekkingsmeting
test-python:
    uv run coverage run -m unittest discover -s tests -t .
    uv run coverage report

# Draai de unittests van de JavaScript-code, met dekkingsmeting
test-js:
    node --test --experimental-test-coverage --test-coverage-include='src/**/*.js' --test-coverage-include-all \
        --test-coverage-lines=100 --test-coverage-branches=100 --test-coverage-functions=100 'tests/js/*.test.js'
