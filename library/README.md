# Polyester Design Library

A collection of ready-made style variants for Polyester documents. Each item is a `.polystyle` manifest with metadata, CSS, and a sample markup snippet.

## Using a library item

```polyester
/import "@library/cards/enterprise"

/region --class card-enterprise {
  /card --icon shield { ... }
}
```

## Manifest format

```json
{
  "name": "card-enterprise",
  "category": "cards",
  "description": "Subtle shadow, blue accent — clean enterprise card.",
  "targets": ["card"],
  "wrapperClass": "card-enterprise",
  "sampleMarkup": "/region --class card-enterprise {\n  /card --icon shield { ... }\n}",
  "css": ".card-enterprise .poly-card { ... }"
}
```

## Resolution

`/import "<ref>"` resolves in this order:

1. `@library/<category>/<name>` — bundled items (this directory)
2. `./path/to/file.polystyle` — relative path
3. `/abs/path/to/file.polystyle` — absolute path
4. `@<package>/<item>` — npm package (future)
